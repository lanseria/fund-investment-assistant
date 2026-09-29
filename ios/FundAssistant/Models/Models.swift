import Foundation

// MARK: - 用户

struct User: Codable, Sendable {
    var id: Int
    var username: String
    var role: String?
    var aiMode: String?
    var aiSystemPrompt: String?
    var availableCash: Double?

    var isAdmin: Bool { role == "admin" }
}

struct LoginResponse: Codable, Sendable {
    var user: User
    var token: String?
}

// MARK: - 持仓

struct Holding: Codable, Sendable, Identifiable {
    var id: String { code }
    var code: String
    var name: String
    var sector: String?
    var attentionLevel: Int
    var operationStrategy: String?
    var shares: Double?
    var costPrice: Double?
    var yesterdayNav: Double
    var holdingAmount: Double?
    var holdingProfitAmount: Double?
    var holdingProfitRate: Double?
    var todayEstimateNav: Double?
    var todayEstimateAmount: Double?
    var percentageChange: Double?
    var todayEstimateUpdateTime: String?
    var yesterdayChangeRate: Double?
    var yesterdayProfit: Double?
    var prevNav: Double?
    var signals: [String: String]
    var bias20: Double?
    var pendingTransactions: [PendingTransaction]?
    var recentTransactions: [RecentTransaction]?
    var fees: FundFees?

    var isWatchOnly: Bool { shares == nil || shares == 0 }
    var pendingCount: Int { pendingTransactions?.count ?? 0 }
}

struct PendingTransaction: Codable, Sendable, Identifiable {
    var id: Int
    var type: TransactionType
    var status: TransactionStatus
    var orderAmount: Double?
    var orderShares: Double?
    var orderDate: String
    var createdAt: String
}

struct RecentTransaction: Codable, Sendable, Identifiable {
    var id: Int
    var type: TransactionType
    var date: String
    var amount: Double?
    var shares: Double?
    var nav: Double?
}

struct RedemptionFeeItem: Codable, Sendable {
    var holdingPeriod: String
    var rate: String
}

struct FundFees: Codable, Sendable {
    var fundCode: String
    var purchaseFee: String?
    var redemptionFees: [RedemptionFeeItem]?
    var managementFee: String?
    var custodyFee: String?
    var rawText: String?
}

struct HoldingSummary: Codable, Sendable {
    var totalHoldingAmount: Double
    var totalEstimateAmount: Double
    var totalProfitLoss: Double
    var totalPercentageChange: Double
    var count: Int
    var cash: Double
    var totalAssets: Double
    var staleCount: Int
    var yesterdayProfit: Double
    var yesterdayProfitRate: Double
}

struct HoldingsResponse: Codable, Sendable {
    var holdings: [Holding]
    var summary: HoldingSummary
}

// MARK: - 重仓股

struct FundStockHoldingStock: Codable, Sendable, Identifiable {
    var id: String { stockCode }
    var stockCode: String
    var stockName: String
    var pct: Double
    var price: Double?
    var changePct: Double?
    var quoteDate: String?
    var quoteTime: String?
}

struct FundStockHoldingsSummary: Codable, Sendable {
    var reportDate: String
    var coverage: Double
    var stocks: [FundStockHoldingStock]
}

// MARK: - 基金详情

struct FundDetail: Codable, Sendable {
    var code: String
    var name: String
    var sector: String?
    var fundType: String?
    var yesterdayNav: Double
    var todayEstimateNav: Double?
    var percentageChange: Double?
    var todayEstimateUpdateTime: String?
    var stockHoldings: FundStockHoldingsSummary?
    var shares: Double?
    var costPrice: Double?
    var holdingAmount: Double?
    var holdingProfitAmount: Double?
    var holdingProfitRate: Double?
    var fees: FundFees?
}

// MARK: - 历史与业绩

struct HoldingHistoryPoint: Codable, Sendable, Identifiable {
    var id: String { date }
    var date: String
    var nav: Double
    var ma5: Double?
    var ma10: Double?
    var ma20: Double?
    var ma120: Double?
}

struct HistoryResponse: Codable, Sendable {
    var history: [HoldingHistoryPoint]
    var signals: [StrategySignal]?
    var transactions: [HistoryTransaction]?
}

struct StrategySignal: Codable, Sendable, Identifiable {
    var id: Int
    var fundCode: String?
    var strategyName: String?
    var signal: String?
    var reason: String?
    var latestDate: String?
    var latestClose: Double?
}

struct HistoryTransaction: Codable, Sendable, Identifiable {
    var id: Int
    var type: TransactionType
    var status: TransactionStatus?
    var orderDate: String?
    var confirmedAmount: Double?
    var confirmedShares: Double?
    var confirmedNav: Double?
    var note: String?
}

/// GET /api/fund/holdings/{code}/performance → { "1m": 2.3, "3m": null, ... }
struct PerformanceData: Codable, Sendable {
    var oneM: Double?
    var threeM: Double?
    var sixM: Double?
    var oneY: Double?
    var twoY: Double?
    var fiveY: Double?
    var all: Double?

    enum CodingKeys: String, CodingKey {
        case oneM = "1m", threeM = "3m", sixM = "6m"
        case oneY = "1y", twoY = "2y", fiveY = "5y", all
    }

    var entries: [(String, Double?)] {
        [("近1月", oneM), ("近3月", threeM), ("近6月", sixM), ("近1年", oneY), ("近2年", twoY), ("近5年", fiveY), ("成立以来", all)]
    }
}

// MARK: - 定投计划

enum DcaFrequency: String, Codable, CaseIterable, Sendable {
    case daily, weekly, biweekly, monthly

    var label: String {
        switch self {
        case .daily: "每日"
        case .weekly: "每周"
        case .biweekly: "每两周"
        case .monthly: "每月"
        }
    }
}

struct DcaPlan: Codable, Sendable, Identifiable {
    var id: Int
    var fundCode: String
    var fundName: String?
    var amount: Double
    var frequency: DcaFrequency
    var anchorDay: Int?
    var enabled: Bool
    var nextExecutionDate: String
    var lastExecutionDate: String?
}

// MARK: - 收益

struct FundProfitRow: Codable, Sendable, Identifiable {
    var id: String { code }
    var code: String
    var name: String
    var sector: String?
    var status: String // held / sold
    var firstTradeDate: String?
    var lastTradeDate: String?
    var shares: Double?
    var costPrice: Double?
    var totalCost: Double?
    var holdingAmount: Double?
    var dayProfit: Double?
    var dayProfitRate: Double?
    var estimateProfit: Double?
    var holdingProfit: Double?
    var holdingProfitRate: Double?
    var totalProfit: Double
    var latestNav: Double?

    var isHeld: Bool { status == "held" }
}

struct FundProfitSummary: Codable, Sendable {
    var fundCount: Int
    var heldCount: Int
    var soldCount: Int
    var totalHoldingAmount: Double
    var totalProfit: Double
}

struct FundProfitsData: Codable, Sendable {
    var funds: [FundProfitRow]
    var summary: FundProfitSummary
}

struct ProfitSummary: Codable, Sendable {
    var yesterdayProfit: Double
    var yearProfit: Double
    var totalProfitRate: Double
    var totalAssets: Double
}

struct DailyProfitPoint: Codable, Sendable, Identifiable {
    var id: String { date }
    var date: String
    var totalAssets: Double
    var dayProfit: Double
    var dayProfitRate: Double
    var totalProfit: Double
    var totalProfitRate: Double
}

struct ProfitAnalysisData: Codable, Sendable {
    var summary: ProfitSummary
    var history: [DailyProfitPoint]
    var calendar: [String: Double]
}

// MARK: - 通用响应

struct MessageResponse: Codable, Sendable {
    var message: String?
    var statusText: String?
    var record: FundTransactionRecord?
    var count: Int?
    var success: Int?
    var failed: Int?
    var total: Int?
    var skipped: Int?
}

struct FundTransactionRecord: Codable, Sendable {
    var id: Int?
    var fundCode: String?
    var type: TransactionType?
    var status: TransactionStatus?
    var orderAmount: Double?
    var orderShares: Double?
    var orderDate: String?
}

// MARK: - 交易枚举

enum TransactionType: String, Codable, Sendable, CaseIterable {
    case buy, sell
    case convertOut = "convert_out"
    case convertIn = "convert_in"

    var label: String {
        switch self {
        case .buy: "买入"
        case .sell: "卖出"
        case .convertOut: "转出"
        case .convertIn: "转入"
        }
    }
}

enum TransactionStatus: String, Codable, Sendable {
    case draft, pending, confirmed, failed

    var label: String {
        switch self {
        case .draft: "AI 草稿"
        case .pending: "待确认"
        case .confirmed: "已确认"
        case .failed: "失败"
        }
    }
}

enum FundType: String, Codable, CaseIterable, Sendable {
    case open
    case qdiiLof = "qdii_lof"

    var label: String {
        switch self {
        case .open: "普通开放式"
        case .qdiiLof: "QDII / LOF"
        }
    }
}
