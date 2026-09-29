import Foundation

// MARK: - 应用配置

@MainActor
final class AppSettings: ObservableObject {
    static let shared = AppSettings()
    nonisolated static let baseURLKey = "serverBaseURL"

    @Published var baseURLString: String {
        didSet { UserDefaults.standard.set(baseURLString, forKey: Self.baseURLKey) }
    }

    private init() {
        baseURLString = UserDefaults.standard.string(forKey: Self.baseURLKey)
            ?? "http://localhost:8888"
    }

    var baseURL: URL? {
        URL(string: baseURLString.trimmingCharacters(in: .whitespacesAndNewlines))
    }
}

// MARK: - API 错误

struct APIError: LocalizedError, Decodable {
    let statusCode: Int?
    let statusMessage: String?
    let message: String?

    var errorDescription: String? {
        statusMessage ?? message ?? "请求失败（\(statusCode ?? 0)）"
    }
}

// MARK: - API 客户端

/// 后端为 Nuxt/Nitro，认证走 httpOnly Cookie（PASETO）。
/// URLSession + HTTPCookieStorage 会在登录后自动携带 Cookie，
/// 401 时调用 /api/auth/refresh 刷新后重试一次，等价于网页端 apiFetch 的行为。
final class APIClient: Sendable {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder = JSONDecoder()

    private init() {
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        session = URLSession(configuration: config)
    }

    private var baseURL: URL? {
        let raw = UserDefaults.standard.string(forKey: AppSettings.baseURLKey)
            ?? "http://localhost:8888"
        return URL(string: raw.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    enum Method: String {
        case get = "GET", post = "POST", put = "PUT", delete = "DELETE"
    }

    /// 通用请求。`refreshOn401` 为 false 时用于认证接口本身，避免递归刷新。
    func request<T: Decodable>(
        _ path: String,
        method: Method = .get,
        body: [String: Any]? = nil,
        refreshOn401: Bool = true
    ) async throws -> T {
        let data = try await rawRequest(path, method: method, body: body, refreshOn401: refreshOn401)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError(statusCode: nil, statusMessage: "数据解析失败：\(error.localizedDescription)", message: nil)
        }
    }

    /// 期望 204 空响应的请求（如删除操作）。
    func requestVoid(
        _ path: String,
        method: Method = .get,
        body: [String: Any]? = nil,
        refreshOn401: Bool = true
    ) async throws {
        _ = try await rawRequest(path, method: method, body: body, refreshOn401: refreshOn401)
    }

    private func rawRequest(
        _ path: String,
        method: Method,
        body: [String: Any]?,
        refreshOn401: Bool
    ) async throws -> Data {
        var data = try await perform(path, method: method, body: body)

        if refreshOn401, isUnauthorized(data) {
            let refreshed = await refreshSession()
            if refreshed {
                data = try await perform(path, method: method, body: body)
            }
        }
        return data
    }

    private func isUnauthorized(_ data: Data) -> Bool {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return (object["statusCode"] as? Int) == 401
    }

    private func perform(_ path: String, method: Method, body: [String: Any]?) async throws -> Data {
        guard let base = baseURL else {
            throw APIError(statusCode: nil, statusMessage: "服务器地址无效", message: nil)
        }
        guard let url = URL(string: base.absoluteString.trimmingCharacters(in: ["/"]) + path) else {
            throw APIError(statusCode: nil, statusMessage: "请求地址无效", message: nil)
        }

        var req = URLRequest(url: url)
        req.httpMethod = method.rawValue
        req.timeoutInterval = 30
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        do {
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                throw APIError(statusCode: nil, statusMessage: "无效的服务器响应", message: nil)
            }

            // 后端 h3 错误体：{ statusCode, statusMessage, ... }，statusMessage 为中文文案
            if !(200...299).contains(http.statusCode) {
                if let apiError = try? decoder.decode(APIError.self, from: data), apiError.statusMessage != nil {
                    throw apiError
                }
                throw APIError(statusCode: http.statusCode, statusMessage: "请求失败（HTTP \(http.statusCode)）", message: nil)
            }
            return data
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError(statusCode: nil, statusMessage: "网络错误：\(error.localizedDescription)", message: nil)
        }
    }

    /// POST /api/auth/refresh：依靠 auth-refresh-token Cookie 刷新会话。
    @discardableResult
    func refreshSession() async -> Bool {
        do {
            let _: User = try await request("/api/auth/refresh", method: .post, refreshOn401: false)
            return true
        } catch {
            return false
        }
    }
}
