import Foundation

/// 持仓列表排序键（与网页端 HoldingList 一致）
enum HoldingSortKey: String, CaseIterable, Identifiable {
    case holdingAmount, percentageChange, holdingProfitRate, bias20

    var id: String { rawValue }

    var label: String {
        switch self {
        case .holdingAmount: "持有金额"
        case .percentageChange: "今日估值涨跌"
        case .holdingProfitRate: "持有收益率"
        case .bias20: "BIAS20"
        }
    }
}

@MainActor
@Observable
final class HoldingsStore {
    var holdings: [Holding] = []
    var summary: HoldingSummary?
    var isLoading = false
    var errorMessage: String?
    var lastUpdated: Date?

    var sortKey: HoldingSortKey = .holdingAmount
    var sortAscending = false

    private let api = APIClient.shared

    var sortedHoldings: [Holding] {
        let key = sortKey
        let sorted = holdings.sorted { a, b in
            let va = Self.sortValue(of: a, key: key) ?? -Double.infinity
            let vb = Self.sortValue(of: b, key: key) ?? -Double.infinity
            return sortAscending ? va < vb : va > vb
        }
        // 与网页端一致：已持仓在前、仅关注在后
        return sorted.sorted { !$0.isWatchOnly && $1.isWatchOnly }
    }

    private static func sortValue(of h: Holding, key: HoldingSortKey) -> Double? {
        switch key {
        case .holdingAmount: h.todayEstimateAmount ?? h.holdingAmount
        case .percentageChange: h.percentageChange
        case .holdingProfitRate: h.holdingProfitRate
        case .bias20: h.bias20
        }
    }

    func load() async {
        isLoading = holdings.isEmpty
        errorMessage = nil
        defer { isLoading = false }
        do {
            let resp: HoldingsResponse = try await api.request("/api/fund/holdings/")
            holdings = resp.holdings
            summary = resp.summary
            lastUpdated = Date()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    // MARK: - 持仓 CRUD

    func addHolding(
        code: String, shares: Double?, costPrice: Double?,
        attentionLevel: Int, operationStrategy: String?, fundType: FundType
    ) async throws {
        var body: [String: Any] = [
            "code": code,
            "attentionLevel": attentionLevel,
            "fundType": fundType.rawValue,
        ]
        if let shares, let costPrice {
            body["shares"] = shares
            body["costPrice"] = costPrice
        }
        if let strategy = operationStrategy?.trimmingCharacters(in: .whitespacesAndNewlines), !strategy.isEmpty {
            body["operationStrategy"] = strategy
        }
        let _: MessageResponse = try await api.request("/api/fund/holdings/", method: .post, body: body)
        await load()
    }

    func updateHolding(
        code: String, shares: Double?, costPrice: Double?,
        attentionLevel: Int, operationStrategy: String?
    ) async throws {
        var body: [String: Any] = ["attentionLevel": attentionLevel]
        if let shares, let costPrice {
            body["shares"] = shares
            body["costPrice"] = costPrice
        }
        if let strategy = operationStrategy?.trimmingCharacters(in: .whitespacesAndNewlines), !strategy.isEmpty {
            body["operationStrategy"] = strategy
        }
        let _: MessageResponse = try await api.request("/api/fund/holdings/\(code)", method: .put, body: body)
        await load()
    }

    func deleteHolding(_ code: String) async throws {
        try await api.requestVoid("/api/fund/holdings/\(code)", method: .delete)
        await load()
    }

    /// 清仓转仅关注
    func clearPosition(_ code: String) async throws {
        let _: MessageResponse = try await api.request("/api/fund/holdings/\(code)/clear-position", method: .post)
        await load()
    }

    func updateSector(_ code: String, sector: String?) async throws {
        try await api.requestVoid("/api/funds/\(code)/sector", method: .put,
                                  body: ["sector": sector ?? NSNull()])
        await load()
    }

    // MARK: - 交易

    @discardableResult
    func submitTrade(fundCode: String, type: TransactionType, amount: Double?, shares: Double?, date: String) async throws -> String {
        var body: [String: Any] = ["fundCode": fundCode, "type": type.rawValue, "date": date]
        if type == .buy, let amount { body["amount"] = amount }
        if type == .sell, let shares { body["shares"] = shares }
        let resp: MessageResponse = try await api.request("/api/fund/transactions", method: .post, body: body)
        await load()
        return resp.statusText ?? "交易请求已记录"
    }

    @discardableResult
    func submitConvert(fromCode: String, toCode: String, shares: Double, date: String) async throws -> String {
        let resp: MessageResponse = try await api.request("/api/fund/convert", method: .post, body: [
            "fromCode": fromCode, "toCode": toCode, "shares": shares, "date": date,
        ])
        await load()
        return resp.message ?? "转换申请已提交"
    }

    /// 撤销待确认/草稿交易（convert_out 会级联删除关联 convert_in）
    func deleteTransaction(_ id: Int) async throws {
        try await api.requestVoid("/api/fund/transactions/\(id)", method: .delete)
        await load()
    }

    func approveTransaction(_ id: Int) async throws {
        let _: MessageResponse = try await api.request("/api/fund/transactions/\(id)/approve", method: .put)
        await load()
    }

    // MARK: - 估值

    /// 刷新全部持仓的盘中估值（scope=user）
    @discardableResult
    func refreshEstimates() async throws -> String {
        let resp: MessageResponse = try await api.request(
            "/api/fund/utils/refresh-estimates", method: .post, body: ["scope": "user"]
        )
        await load()
        let ok = resp.success ?? 0
        let fail = resp.failed ?? 0
        return "刷新完成：成功 \(ok)，失败 \(fail)"
    }

    // MARK: - 策略

    @discardableResult
    func runStrategies(code: String) async throws -> String {
        let resp: MessageResponse = try await api.request("/api/fund/holdings/\(code)/run-strategies", method: .post)
        return resp.message ?? "策略执行完成"
    }

    @discardableResult
    func syncHistory(code: String) async throws -> String {
        let resp: MessageResponse = try await api.request("/api/fund/holdings/\(code)/sync-history", method: .post)
        return resp.message ?? "同步完成"
    }
}
