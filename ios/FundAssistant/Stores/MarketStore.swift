import Foundation

@MainActor
@Observable
final class MarketStore {
    /// 首页横滑条重点指数（A 股三大指数 + 沪深300 + 港股恒指 + 美股两大指数）
    static let featuredCodes = [
        "sh000001", "sz399001", "sz399006", "sh000300", "hkHSI", "usIXIC", "usDJI",
    ]

    var indices: [MarketIndex] = []
    var isLoading = false
    var lastUpdated: Date?

    private let api = APIClient.shared

    func load() async {
        isLoading = indices.isEmpty
        defer { isLoading = false }
        guard let resp: [String: MarketIndex] = try? await api.request("/api/market/") else { return }
        let featured = Self.featuredCodes.compactMap { resp[$0] }
        // 兜底：若重点代码缺失，取接口返回的前 7 个
        indices = featured.isEmpty ? Array(resp.values.prefix(7)) : featured
        lastUpdated = Date()
    }
}
