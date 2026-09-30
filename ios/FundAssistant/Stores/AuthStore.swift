import Foundation
import SwiftUI

@MainActor
@Observable
final class AuthStore {
    var user: User?
    var isCheckingSession = true

    private let api = APIClient.shared

    var isLoggedIn: Bool { user != nil }

    /// 启动时恢复会话：-FALogin 自动登录，否则先 /me，失败则尝试 refresh 后重试。
    func bootstrap() async {
        defer { isCheckingSession = false }
        if let args = LaunchArgs.autoLogin {
            try? await login(username: args.username, password: args.password)
            if isLoggedIn { return }
        }
        if let me: User = try? await api.request("/api/auth/me") {
            user = me
            return
        }
        guard await api.refreshSession() else { return }
        user = try? await api.request("/api/auth/me")
    }

    func login(username: String, password: String) async throws {
        let resp: LoginResponse = try await api.request(
            "/api/auth/login",
            method: .post,
            body: ["username": username, "password": password],
            refreshOn401: false
        )
        user = resp.user
    }

    func logout() async {
        try? await api.requestVoid("/api/auth/logout", method: .post, refreshOn401: false)
        user = nil
        HTTPCookieStorage.shared.removeCookies(since: .distantPast)
    }
}
