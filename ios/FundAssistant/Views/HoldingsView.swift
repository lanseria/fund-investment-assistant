import SwiftUI

struct HoldingsView: View {
    @Environment(HoldingsStore.self) private var store
    @Environment(MarketStore.self) private var marketStore

    @State private var showAddSheet = false
    @State private var isRefreshingEstimates = false
    @State private var toast: String?

    @State private var rowTrade: RowTrade?
    @State private var rowConvert: Holding?
    @State private var rowEdit: Holding?
    @State private var rowDelete: Holding?
    @State private var rowClear: Holding?
    @State private var path: [String] = []

    struct RowTrade: Identifiable {
        let id = UUID()
        let holding: Holding
        let type: TradeType
    }

    var body: some View {
        @Bindable var store = store

        NavigationStack(path: $path) {
            Group {
                if store.isLoading {
                    ProgressView("加载持仓中…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = store.errorMessage, store.holdings.isEmpty {
                    ContentUnavailableView {
                        Label("加载失败", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("重试") { Task { await loadAll() } }
                    }
                } else if store.holdings.isEmpty {
                    ContentUnavailableView {
                        Label("暂无持仓", systemImage: "tray")
                    } description: {
                        Text("点击右上角 + 添加你的第一只基金")
                    }
                } else {
                    holdingList
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("我的持仓")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarContent }
            .refreshable { await loadAll() }
            .task {
                if store.holdings.isEmpty { await store.load() }
                await marketStore.load()
                if let code = LaunchArgs.fundCode, path.isEmpty { path = [code] }
            }
            .sheet(isPresented: $showAddSheet) {
                AddEditHoldingSheet(mode: .add)
            }
            .sheet(item: $rowTrade) { trade in
                TradeSheet(holding: trade.holding, detail: nil, type: trade.type)
            }
            .sheet(item: $rowConvert) { holding in
                ConvertSheet(fromHolding: holding)
            }
            .sheet(item: $rowEdit) { holding in
                AddEditHoldingSheet(mode: .edit(holding))
            }
            .confirmationDialog(
                "确定删除 \(rowDelete?.name ?? "")？将移除其关注与持仓记录。",
                isPresented: Binding(get: { rowDelete != nil }, set: { if !$0 { rowDelete = nil } }),
                titleVisibility: .visible
            ) {
                Button("删除", role: .destructive) {
                    if let code = rowDelete?.code { perform { try await store.deleteHolding(code) } }
                    rowDelete = nil
                }
            }
            .confirmationDialog(
                "清仓将卖出全部份额并转为仅关注，确定继续？",
                isPresented: Binding(get: { rowClear != nil }, set: { if !$0 { rowClear = nil } }),
                titleVisibility: .visible
            ) {
                Button("清仓转关注", role: .destructive) {
                    if let code = rowClear?.code { perform { try await store.clearPosition(code) } }
                    rowClear = nil
                }
            }
            .toast(toast)
        }
    }

    private func loadAll() async {
        await store.load()
        await marketStore.load()
    }

    private func perform(_ operation: @escaping () async throws -> Void) {
        Task {
            do {
                try await operation()
                toast = "操作成功"
            } catch {
                toast = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
        }
    }

    // MARK: - 列表

    private var holdingList: some View {
        List {
            Section {
                HeroSummaryCard()
                    .listRowInsets(EdgeInsets(top: 6, leading: 10, bottom: 0, trailing: 10))
                    .listRowBackground(Color.clear)
                MarketStrip(indices: marketStore.indices, isLoading: marketStore.isLoading && marketStore.indices.isEmpty)
                    .listRowInsets(EdgeInsets(top: 8, leading: 10, bottom: 4, trailing: 10))
                    .listRowBackground(Color.clear)
            }
            Section {
                ForEach(store.sortedHoldings) { holding in
                    NavigationLink(value: holding.code) {
                        HoldingRowView(holding: holding)
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        HoldingActions.rowActions(
                            holding: holding,
                            buy: { rowTrade = RowTrade(holding: $0, type: .buy) },
                            sell: { rowTrade = RowTrade(holding: $0, type: .sell) },
                            convert: { rowConvert = $0 },
                            edit: { rowEdit = $0 },
                            clear: { rowClear = $0 },
                            delete: { rowDelete = $0 }
                        )
                    }
                }
            } header: {
                HStack {
                    Text("我的基金（\(store.holdings.count)）")
                    Spacer()
                    if store.summary?.staleCount ?? 0 > 0 {
                        TagView(text: "\(store.summary!.staleCount) 只估值未更新", color: .orange)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationDestination(for: String.self) { code in
            FundDetailView(fundCode: code)
        }
    }

    // MARK: - 工具栏

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            sortMenu
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button {
                Task { await refreshEstimates() }
            } label: {
                if isRefreshingEstimates {
                    ProgressView()
                } else {
                    Label("刷新估值", systemImage: "arrow.triangle.2.circlepath")
                }
            }
            .disabled(isRefreshingEstimates)

            Button {
                showAddSheet = true
            } label: {
                Label("添加基金", systemImage: "plus")
            }
        }
    }

    private var sortMenu: some View {
        @Bindable var store = store
        return Menu {
            Picker("排序", selection: $store.sortKey) {
                ForEach(HoldingSortKey.allCases) { key in
                    Text(key.label).tag(key)
                }
            }
            Picker("顺序", selection: $store.sortAscending) {
                Text("降序").tag(false)
                Text("升序").tag(true)
            }
        } label: {
            Label("排序", systemImage: "arrow.up.arrow.down")
        }
    }

    private func refreshEstimates() async {
        isRefreshingEstimates = true
        defer { isRefreshingEstimates = false }
        do {
            toast = try await store.refreshEstimates()
        } catch {
            toast = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

// MARK: - 资产总览卡（深蓝渐变）

struct HeroSummaryCard: View {
    @Environment(HoldingsStore.self) private var store
    @ObservedObject private var settings = AppSettings.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("总资产（元）")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.65))
                Spacer()
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) { settings.hideAssets.toggle() }
                } label: {
                    Image(systemName: settings.hideAssets ? "eye.slash" : "eye")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.75))
                        .padding(6)
                        .background(.white.opacity(0.12), in: Circle())
                }
                .accessibilityLabel(settings.hideAssets ? "显示资产" : "隐藏资产")
            }

            AmountText(
                value: store.summary?.totalAssets,
                font: .system(size: 30, weight: .bold, design: .rounded),
                color: .white
            )

            HStack(spacing: 0) {
                heroMetric("今日预估盈亏", value: store.summary?.totalProfitLoss, signed: true,
                           sub: store.summary.map { $0.totalPercentageChange.signedPctText })
                heroMetric("昨日收益", value: store.summary?.yesterdayProfit, signed: true,
                           sub: store.summary.map { $0.yesterdayProfitRate.signedPctText })
                heroMetric("可用现金", value: store.summary?.cash, signed: false, sub: nil)
            }

            if let s = store.summary {
                HStack(spacing: 12) {
                    Label {
                        Text("市值（估值）\(settings.hideAssets ? "✱✱✱✱" : s.totalEstimateAmount.moneyText)")
                    } icon: {
                        Image(systemName: "chart.pie")
                    }
                    Spacer()
                    Text("共 \(s.count) 只基金")
                }
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.6))
            }
        }
        .padding(14)
        .background(Theme.heroGradient, in: RoundedRectangle(cornerRadius: 16))
    }

    private func heroMetric(_ title: String, value: Double?, signed: Bool, sub: String?) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.65))
            AmountText(
                value: value, signed: signed,
                font: .headline.monospacedDigit(),
                color: .white, showSignColor: signed,
                darkBackground: true
            )
            if let sub {
                Text(settings.hideAssets ? "✱✱%" : sub)
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.55))
                    .monospacedDigit()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - 持仓行（天天基金风格：右侧大字涨跌幅）

struct HoldingRowView: View {
    let holding: Holding
    @Environment(DictStore.self) private var dictStore
    @ObservedObject private var settings = AppSettings.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            topRow
            navInfoRow
            metricsRow
            footerRows
        }
        .padding(.vertical, 4)
    }

    /// 净值 / 估值 / 成本 / 份额 一行小字
    private var navInfoRow: some View {
        Text(navInfoText)
            .font(.caption2)
            .foregroundStyle(.tertiary)
            .monospacedDigit()
            .lineLimit(1)
    }

    private var navInfoText: String {
        var parts: [String] = []
        if holding.yesterdayNav > 0 {
            parts.append("净值 " + holding.yesterdayNav.formatted(.number.precision(.fractionLength(4))))
        }
        if let est = holding.todayEstimateNav {
            parts.append("估 " + est.formatted(.number.precision(.fractionLength(4))))
        }
        if let cost = holding.costPrice {
            parts.append("成本 " + cost.formatted(.number.precision(.fractionLength(4))))
        }
        if let shares = holding.shares {
            parts.append("份额 " + shares.formatted(.number.precision(.fractionLength(2))))
        }
        return parts.joined(separator: " · ")
    }

    // 首行：名称独占（不被标签挤压），右侧大字涨跌幅固定尺寸
    private var topRow: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(holding.name)
                    .font(.system(size: 16, weight: .semibold))
                    .lineLimit(1)
                    .truncationMode(.tail)
                HStack(spacing: 5) {
                    Text(holding.code)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    if let sectorLabel = dictStore.label(DictStore.sectorType, holding.sector) {
                        TagView(text: sectorLabel, color: .indigo)
                    }
                    if holding.attentionLevel >= 2 {
                        Image(systemName: holding.attentionLevel == 3 ? "star.fill" : "star.leadinghalf.filled")
                            .font(.caption2)
                            .foregroundStyle(Theme.gold)
                    }
                    if holding.isWatchOnly {
                        TagView(text: "关注", color: .gray)
                    }
                    if holding.pendingCount > 0 {
                        Label("\(holding.pendingCount) 笔待确认", systemImage: "clock")
                            .font(.caption2)
                            .foregroundStyle(.orange)
                    }
                }
            }
            Spacer(minLength: 10)
            VStack(alignment: .trailing, spacing: 2) {
                ChangeLabel(value: holding.percentageChange)
                    .font(.system(size: 21, weight: .bold))
                if let updateTime = holding.todayEstimateUpdateTime {
                    Text(DateFormat.localShortTime(updateTime))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            .fixedSize(horizontal: true, vertical: false)
        }
    }

    // 三列指标：持有金额 / 持有收益 / 昨日收益
    private var metricsRow: some View {
        HStack(spacing: 0) {
            metric("持有金额") {
                AmountText(
                    value: holding.todayEstimateAmount ?? holding.holdingAmount,
                    font: .caption.weight(.semibold)
                )
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            }
            metric("持有收益") {
                AmountText(
                    value: holding.holdingProfitAmount, signed: true,
                    font: .caption.weight(.semibold),
                    showSignColor: true
                )
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                if let rate = holding.holdingProfitRate {
                    Text(settings.hideAssets ? "✱✱%" : rate.signedPctText)
                        .font(.caption2)
                        .foregroundStyle(changeColor(rate))
                        .monospacedDigit()
                }
            }
            metric("昨日收益") {
                AmountText(
                    value: holding.yesterdayProfit, signed: true,
                    font: .caption.weight(.semibold),
                    showSignColor: true
                )
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                if let rate = holding.yesterdayChangeRate {
                    Text(settings.hideAssets ? "✱✱%" : rate.signedPctText)
                        .font(.caption2)
                        .foregroundStyle(changeColor(rate))
                        .monospacedDigit()
                }
            }
            metric("BIAS20") {
                Text(holding.bias20?.pctText ?? "--")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(changeColor(holding.bias20))
                    .monospacedDigit()
            }
        }
    }

    private func metric(_ title: String, @ViewBuilder value: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.tertiary)
            value()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var footerRows: some View {
        let tags = signalTags
        if !tags.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(tags, id: \.0) { strategy, signal in
                        TagView(
                            text: strategy == "base" ? signal : "\(strategyLabel(strategy))·\(signal)",
                            color: signalColor(signal)
                        )
                    }
                }
            }
        }
    }

    private var signalTags: [(String, String)] {
        holding.signals
            .filter { !$0.value.isEmpty }
            .sorted { $0.key < $1.key }
            .map { ($0.key, $0.value) }
    }

    private func strategyLabel(_ key: String) -> String {
        switch key {
        case "rsi": "RSI"
        case "bollinger_bands": "布林"
        case "base": ""
        default: key
        }
    }
}
