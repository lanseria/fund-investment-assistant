import SwiftUI

// MARK: - 启动参数（用于 UI 测试 / 直达指定页面）

enum LaunchArgs {
    static func value(_ name: String) -> String? {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: name), index + 1 < args.count else { return nil }
        return args[index + 1]
    }

    /// -FATab 0..3 → 初始 tab（持仓/收益/定投/设置）
    static var initialTab: Int { Int(value("-FATab") ?? "") ?? 0 }

    /// -FAFund 161725 → 启动后直接打开该基金详情
    static var fundCode: String? { value("-FAFund") }

    /// -FAScrollAnchor top|center|bottom → 详情页初始滚动锚点（截图辅助）
    static var scrollAnchor: UnitPoint? {
        switch value("-FAScrollAnchor") {
        case "top": .top
        case "center": .center
        case "bottom": .bottom
        default: nil
        }
    }
}

// MARK: - 交易类型（用于 sheet(item:)）

enum TradeType: String, Identifiable {
    case buy, sell
    var id: String { rawValue }

    var label: String { self == .buy ? "买入" : "卖出" }
}

// MARK: - Toast

extension View {
    /// 轻提示：显示 2.5 秒后自动消失
    func toast(_ message: String?) -> some View {
        modifier(ToastModifier(message: message))
    }
}

struct ToastModifier: ViewModifier {
    let message: String?
    @State private var hiddenMessage: String?

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            if let message, message != hiddenMessage {
                Text(message)
                    .font(.subheadline)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.thinMaterial, in: Capsule())
                    .shadow(radius: 4, y: 2)
                    .padding(.bottom, 24)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .animation(.easeInOut(duration: 0.2), value: hiddenMessage)
                    .task(id: message) {
                        try? await Task.sleep(for: .seconds(2.5))
                        withAnimation { hiddenMessage = message }
                    }
            }
        }
    }
}

// MARK: - 持仓行滑动操作

enum HoldingActions {
    /// 持仓列表行滑动手势：卖出 / 转换 / 编辑 / 清仓 / 删除
    @ViewBuilder
    static func rowActions(
        holding: Holding,
        buy: ((Holding) -> Void)? = nil,
        sell: ((Holding) -> Void)? = nil,
        convert: ((Holding) -> Void)? = nil,
        edit: ((Holding) -> Void)? = nil,
        clear: ((Holding) -> Void)? = nil,
        delete: ((Holding) -> Void)? = nil
    ) -> some View {
        if let delete {
            Button(role: .destructive) { delete(holding) } label: {
                Label("删除", systemImage: "trash")
            }
        }
        if let clear, !holding.isWatchOnly {
            Button { clear(holding) } label: {
                Label("清仓", systemImage: "archivebox")
            }
            .tint(.brown)
        }
        if let edit {
            Button { edit(holding) } label: {
                Label("编辑", systemImage: "pencil")
            }
            .tint(.blue)
        }
        if let convert, !holding.isWatchOnly {
            Button { convert(holding) } label: {
                Label("转换", systemImage: "arrow.left.arrow.right")
            }
            .tint(.orange)
        }
        if let sell, !holding.isWatchOnly {
            Button { sell(holding) } label: {
                Label("卖出", systemImage: "minus.circle")
            }
            .tint(.green)
        }
        if let buy, !holding.isWatchOnly {
            Button { buy(holding) } label: {
                Label("买入", systemImage: "plus.circle")
            }
            .tint(.red)
        }
    }
}

// MARK: - 可用份额计算（与网页端 useTradeModals 一致）

extension Holding {
    /// 可用份额 = 持有份额 − 待确认/草稿的卖出与转出冻结份额
    var availableShares: Double {
        guard let shares, shares > 0 else { return 0 }
        let frozen = (pendingTransactions ?? [])
            .filter { $0.type == .sell || $0.type == .convertOut }
            .compactMap(\.orderShares)
            .reduce(0, +)
        return max(shares - frozen, 0)
    }
}
