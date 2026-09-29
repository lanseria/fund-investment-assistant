import SwiftUI

struct HoldingsView: View {
    @Environment(HoldingsStore.self) private var store

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
                        Button("重试") { Task { await store.load() } }
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
            .navigationBarTitleDisplayMode(.large)
            .toolbar { toolbarContent }
            .refreshable { await store.load() }
            .task {
                if store.holdings.isEmpty { await store.load() }
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
                SummaryCard()
                    .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
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
                    Text("持仓列表（\(store.holdings.count)）")
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

// MARK: - 资产汇总卡

struct SummaryCard: View {
    @Environment(HoldingsStore.self) private var store

    var body: some View {
        VStack(spacing: 12) {
            if let s = store.summary {
                HStack(spacing: 8) {
                    StatCard(title: "总资产", value: s.totalAssets.moneyText, subText: "现金 \(s.cash.moneyText)")
                    StatCard(
                        title: "今日预估盈亏",
                        value: s.totalProfitLoss.signedMoneyText,
                        color: changeColor(s.totalProfitLoss),
                        subText: "预估涨跌 " + s.totalPercentageChange.signedPctText
                    )
                }
                HStack(spacing: 8) {
                    StatCard(
                        title: "持仓市值（估值）",
                        value: s.totalEstimateAmount.moneyText,
                        subText: "按净值 " + s.totalHoldingAmount.moneyText
                    )
                    StatCard(
                        title: "昨日收益",
                        value: s.yesterdayProfit.signedMoneyText,
                        color: changeColor(s.yesterdayProfit),
                        subText: "收益率 " + s.yesterdayProfitRate.signedPctText
                    )
                }
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
    }
}

// MARK: - 持仓行

struct HoldingRowView: View {
    let holding: Holding
    @Environment(DictStore.self) private var dictStore

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            header
            mainRow
            statRow
            if !signalTags.isEmpty {
                signalRow
            }
            if holding.pendingCount > 0 {
                pendingRow
            }
        }
        .padding(.vertical, 4)
    }

    private var header: some View {
        HStack(spacing: 6) {
            Text(holding.name)
                .font(.headline)
                .lineLimit(1)
            Text(holding.code)
                .font(.caption)
                .foregroundStyle(.secondary)
            if let sectorLabel = dictStore.label(DictStore.sectorType, holding.sector) {
                TagView(text: sectorLabel, color: .indigo)
            }
            if holding.attentionLevel >= 2 {
                Image(systemName: holding.attentionLevel == 3 ? "star.fill" : "star.leadinghalf.filled")
                    .font(.caption)
                    .foregroundStyle(.yellow)
            }
            if holding.isWatchOnly {
                TagView(text: "关注", color: .gray)
            }
            Spacer()
        }
    }

    private var mainRow: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("今日估值")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            ChangeLabel(value: holding.percentageChange)
                .font(.title3.bold())
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                if let amount = holding.todayEstimateAmount ?? holding.holdingAmount {
                    Text(amount.moneyText)
                        .font(.headline)
                        .monospacedDigit()
                }
                if let updateTime = holding.todayEstimateUpdateTime {
                    Text(DateFormat.shortTime(updateTime))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
    }

    private var statRow: some View {
        HStack(spacing: 0) {
            statItem("持有收益", value: holding.holdingProfitAmount?.signedMoneyText ?? "--",
                     color: changeColor(holding.holdingProfitAmount),
                     sub: holding.holdingProfitRate?.signedPctText ?? "")
            statItem("昨日收益", value: holding.yesterdayProfit?.signedMoneyText ?? "--",
                     color: changeColor(holding.yesterdayProfit),
                     sub: holding.yesterdayChangeRate?.signedPctText ?? "")
            statItem("BIAS20", value: holding.bias20?.pctText ?? "--",
                     color: changeColor(holding.bias20), sub: "")
        }
    }

    private func statItem(_ title: String, value: String, color: Color, sub: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.tertiary)
            Text(value)
                .font(.caption.weight(.semibold))
                .foregroundStyle(color)
                .monospacedDigit()
            if !sub.isEmpty {
                Text(sub)
                    .font(.caption2)
                    .foregroundStyle(color.opacity(0.8))
                    .monospacedDigit()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var signalTags: [(String, String)] {
        holding.signals
            .filter { !$0.value.isEmpty }
            .sorted { $0.key < $1.key }
            .map { ($0.key, $0.value) }
    }

    private var signalRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(signalTags, id: \.0) { strategy, signal in
                    TagView(
                        text: strategy == "base" ? signal : "\(strategyLabel(strategy))·\(signal)",
                        color: signalColor(signal)
                    )
                }
            }
        }
    }

    private func strategyLabel(_ key: String) -> String {
        switch key {
        case "rsi": "RSI"
        case "bollinger_bands": "布林"
        case "base": ""
        default: key
        }
    }

    private var pendingRow: some View {
        HStack(spacing: 4) {
            Image(systemName: "clock.badge.exclamationmark")
                .font(.caption2)
            Text("\(holding.pendingCount) 笔待确认交易")
                .font(.caption)
        }
        .foregroundStyle(.orange)
    }
}
