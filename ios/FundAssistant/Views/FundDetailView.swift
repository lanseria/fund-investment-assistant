import SwiftUI
import Charts

struct FundDetailView: View {
    let fundCode: String

    @Environment(HoldingsStore.self) private var store
    @Environment(DictStore.self) private var dictStore
    @Environment(\.dismiss) private var dismiss

    @State private var detail: FundDetail?
    @State private var performance: PerformanceData?
    @State private var history: [HoldingHistoryPoint] = []
    @State private var historyTransactions: [HistoryTransaction] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var toast: String?

    @State private var chartRange: ChartRange = .sixMonths
    @State private var visibleSeries: Set<String> = ["净值", "MA20"]

    @State private var tradeType: TradeType?
    @State private var showConvert = false
    @State private var showEdit = false
    @State private var showSectorEditor = false
    @State private var confirmDelete: Holding?
    @State private var confirmClear: Holding?

    enum ChartRange: String, CaseIterable, Identifiable {
        case threeMonths = "3月", sixMonths = "6月", oneYear = "1年", twoYears = "2年", all = "全部"
        var id: String { rawValue }

        var days: Int? {
            switch self {
            case .threeMonths: 92
            case .sixMonths: 183
            case .oneYear: 365
            case .twoYears: 730
            case .all: nil
            }
        }
    }

    var body: some View {
        Group {
            if isLoading {
                ProgressView("加载详情中…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                ContentUnavailableView {
                    Label("加载失败", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button("重试") { Task { await loadAll() } }
                }
            } else if let detail {
                detailList(detail)
            } else {
                ContentUnavailableView("无数据", systemImage: "questionmark.folder")
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(detail?.name ?? fundCode)
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadAll() }
        .toast(toast)
        .sheet(item: $tradeType) { type in
            TradeSheet(holding: currentHolding, detail: detail, type: type)
        }
        .sheet(isPresented: $showConvert) {
            ConvertSheet(fromHolding: currentHolding)
        }
        .sheet(isPresented: $showEdit) {
            if let holding = currentHolding {
                AddEditHoldingSheet(mode: .edit(holding))
            }
        }
        .sheet(isPresented: $showSectorEditor) {
            SectorEditSheet(currentSector: detail?.sector) { newSector in
                perform { try await store.updateSector(fundCode, sector: newSector) }
            }
        }
        .confirmationDialog(
            "删除后将移除该基金的关注与持仓记录，确定删除 \(detail?.name ?? fundCode)？",
            isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }),
            titleVisibility: .visible
        ) {
            Button("删除", role: .destructive) {
                if let code = confirmDelete?.code { perform { try await store.deleteHolding(code) } }
                confirmDelete = nil
            }
        }
        .confirmationDialog(
            "清仓将卖出全部份额并转为仅关注，确定继续？",
            isPresented: Binding(get: { confirmClear != nil }, set: { if !$0 { confirmClear = nil } }),
            titleVisibility: .visible
        ) {
            Button("清仓转关注", role: .destructive) {
                if let code = confirmClear?.code { perform { try await store.clearPosition(code) } }
                confirmClear = nil
            }
        }
    }

    private var currentHolding: Holding? {
        store.holdings.first { $0.code == fundCode }
    }

    // MARK: - 加载

    private func loadAll() async {
        isLoading = detail == nil
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let detailTask: FundDetail = APIClient.shared.request("/api/fund/holdings/\(fundCode)/detail")
            async let perfTask: PerformanceData = APIClient.shared.request("/api/fund/holdings/\(fundCode)/performance")
            async let historyTask: HistoryResponse = APIClient.shared.request(
                "/api/fund/holdings/\(fundCode)/history?ma=5,10,20,120"
            )
            let (d, p, h) = try await (detailTask, perfTask, historyTask)
            detail = d
            performance = p
            history = h.history
            historyTransactions = h.transactions ?? []
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func perform(_ operation: @escaping () async throws -> Void) {
        Task {
            do {
                try await operation()
                toast = "操作成功"
                await loadAll()
            } catch {
                toast = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
        }
    }

    // MARK: - 详情列表

    private func detailList(_ detail: FundDetail) -> some View {
        List {
            Section {
                overviewSection(detail)
                    .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12))
            }
            Section("操作") {
                actionButtons
            }
            if let perf = performance {
                Section("区间涨跌") {
                    performanceSection(perf)
                }
            }
            if !history.isEmpty {
                Section("净值走势") {
                    chartSection
                }
            }
            if let stocks = detail.stockHoldings, !stocks.stocks.isEmpty {
                Section {
                    stockHoldingsSection(stocks)
                } header: {
                    Text("重仓股（\(stocks.reportDate) 报告期，覆盖 \(String(format: "%.1f", stocks.coverage))%）")
                }
            }
            if let fees = detail.fees {
                Section("费率") {
                    feesSection(fees)
                }
            }
            if let pending = currentHolding?.pendingTransactions, !pending.isEmpty {
                Section("待确认交易") {
                    ForEach(pending) { tx in
                        PendingTransactionRow(tx: tx) { approve in
                            if approve {
                                perform { try await store.approveTransaction(tx.id) }
                            } else {
                                perform { try await store.deleteTransaction(tx.id) }
                            }
                        }
                    }
                }
            }
            if !historyTransactions.isEmpty {
                Section("最近交易") {
                    ForEach(historyTransactions.prefix(10)) { tx in
                        HistoryTransactionRow(tx: tx)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - 概览

    private func overviewSection(_ detail: FundDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Button {
                        showSectorEditor = true
                    } label: {
                        HStack(spacing: 4) {
                            Text(dictStore.label(DictStore.sectorType, detail.sector) ?? "未设置板块")
                            Image(systemName: "pencil")
                                .font(.caption2)
                        }
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.indigo, in: Capsule())
                    .font(.caption.weight(.medium))
                    .accessibilityHint("点击修改板块")
                    if let type = detail.fundType {
                        TagView(text: type == "open" ? "普通开放式" : "QDII/LOF", color: .teal)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("今日估值 \(detail.percentageChange?.signedPctText ?? "--")")
                        .font(.title2.bold())
                        .foregroundStyle(changeColor(detail.percentageChange))
                    if let estNav = detail.todayEstimateNav {
                        Text("估算净值 \(estNav.formatted(.number.precision(.fractionLength(4))))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text(DateFormat.shortTime(detail.todayEstimateUpdateTime))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }

            Divider()

            HStack(spacing: 0) {
                overStat("最新净值", detail.yesterdayNav.formatted(.number.precision(.fractionLength(4))))
                overStat("持有金额", detail.holdingAmount?.moneyText ?? "--")
                overStat("持有收益", detail.holdingProfitAmount?.signedMoneyText ?? "--",
                         color: changeColor(detail.holdingProfitAmount),
                         sub: detail.holdingProfitRate?.signedPctText)
            }

            if let shares = detail.shares {
                HStack(spacing: 16) {
                    Label("份额 \(shares.formatted(.number.precision(.fractionLength(2))))", systemImage: "circle.grid.2x2")
                    if let cost = detail.costPrice {
                        Label("成本 \(cost.formatted(.number.precision(.fractionLength(4))))", systemImage: "banknote")
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
    }

    private func overStat(_ title: String, _ value: String, color: Color = .primary, sub: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.tertiary)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(color)
                .monospacedDigit()
            if let sub {
                Text(sub)
                    .font(.caption2)
                    .foregroundStyle(color.opacity(0.8))
                    .monospacedDigit()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - 操作按钮

    private var actionButtons: some View {
        VStack(spacing: 10) {
            if let holding = currentHolding, !holding.isWatchOnly {
                HStack(spacing: 10) {
                    actionButton("买入", icon: "plus.circle.fill", color: .red) { tradeType = .buy }
                    actionButton("卖出", icon: "minus.circle.fill", color: .green) { tradeType = .sell }
                    actionButton("转换", icon: "arrow.left.arrow.right.circle.fill", color: .orange) { showConvert = true }
                }
            }
            HStack(spacing: 10) {
                if currentHolding != nil {
                    actionButton("编辑持仓", icon: "pencil.circle.fill", color: .blue) { showEdit = true }
                    if let holding = currentHolding, !holding.isWatchOnly {
                        actionButton("清仓转关注", icon: "archivebox.circle.fill", color: .brown) { confirmClear = holding }
                    }
                    actionButton("删除", icon: "trash.circle.fill", color: .gray) { confirmDelete = currentHolding }
                } else {
                    actionButton("添加持仓", icon: "plus.square.on.square.fill", color: .blue) { showEdit = true }
                }
            }
            HStack(spacing: 10) {
                actionButton("执行策略分析", icon: "brain.head.profile", color: .purple) {
                    perform { _ = try await store.runStrategies(code: fundCode) }
                }
                actionButton("同步历史数据", icon: "arrow.clockwise.circle.fill", color: .indigo) {
                    perform { _ = try await store.syncHistory(code: fundCode) }
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func actionButton(_ title: String, icon: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.title3)
                Text(title)
                    .font(.caption2)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
        }
        .buttonStyle(.bordered)
        .tint(color)
    }

    // MARK: - 区间涨跌

    private func performanceSection(_ perf: PerformanceData) -> some View {
        VStack(spacing: 8) {
            ForEach(perf.entries, id: \.0) { label, value in
                HStack {
                    Text(label)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(width: 60, alignment: .leading)
                    GeometryReader { geo in
                        if let value {
                            let ratio = min(abs(value) / 60.0, 1.0)
                            HStack {
                                Rectangle()
                                    .fill(changeColor(value))
                                    .frame(width: max(geo.size.width * ratio, 2))
                                    .clipShape(Capsule())
                                Text(value.signedPctText)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(changeColor(value))
                                    .monospacedDigit()
                                Spacer(minLength: 0)
                            }
                        } else {
                            Text("--").font(.caption).foregroundStyle(.tertiary)
                        }
                    }
                    .frame(height: 20)
                }
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - 走势图

    private var chartSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("区间", selection: $chartRange) {
                ForEach(ChartRange.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)

            chart

            seriesPicker
        }
        .padding(.vertical, 6)
    }

    private var filteredHistory: [HoldingHistoryPoint] {
        guard let days = chartRange.days else { return history }
        guard let cutoff = Calendar.current.date(byAdding: .day, value: -days, to: Date()) else { return history }
        let formatter = DateFormatter()
        formatter.dateFormat = DateFormat.dayOnly
        let cutoffText = formatter.string(from: cutoff)
        return history.filter { $0.date >= cutoffText }
    }

    private var chart: some View {
        let data = filteredHistory
        let series: [(String, (HoldingHistoryPoint) -> Double?, Color)] = [
            ("净值", { $0.nav }, .primary),
            ("MA5", { $0.ma5 }, .orange),
            ("MA10", { $0.ma10 }, .purple),
            ("MA20", { $0.ma20 }, .blue),
            ("MA120", { $0.ma120 }, .teal),
        ]
        return Chart {
            ForEach(series, id: \.0) { entry in
                if visibleSeries.contains(entry.0) {
                    ForEach(data) { point in
                        if let value = entry.1(point) {
                            LineMark(
                                x: .value("日期", point.date),
                                y: .value(entry.0, value)
                            )
                            .foregroundStyle(entry.2)
                            .lineStyle(entry.0 == "净值" ? StrokeStyle(lineWidth: 2) : StrokeStyle(lineWidth: 1))
                            .interpolationMethod(.catmullRom)
                            .symbol(.circle)
                        }
                    }
                }
            }
        }
        .chartForegroundStyleScale(domain: series.map(\.0), range: series.map(\.2))
        .chartYAxis {
            AxisMarks(position: .trailing) { value in
                AxisGridLine()
                AxisValueLabel {
                    if let v = value.as(Double.self) {
                        Text(v.formatted(.number.precision(.fractionLength(2))))
                            .font(.caption2)
                    }
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .month)) { _ in
                AxisGridLine()
                AxisValueLabel(format: .dateTime.month().year(.twoDigits))
                    .font(.caption2)
            }
        }
        .frame(height: 240)
    }

    private var seriesPicker: some View {
        HStack(spacing: 8) {
            ForEach(["净值", "MA5", "MA10", "MA20", "MA120"], id: \.self) { name in
                Button {
                    if visibleSeries.contains(name), name != "净值" {
                        visibleSeries.remove(name)
                    } else {
                        visibleSeries.insert(name)
                    }
                } label: {
                    Text(name)
                        .font(.caption2.weight(.medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            visibleSeries.contains(name) ? Color.blue.opacity(0.2) : Color(.tertiarySystemFill),
                            in: Capsule()
                        )
                        .foregroundStyle(visibleSeries.contains(name) ? .blue : .secondary)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - 重仓股

    private func stockHoldingsSection(_ stocks: FundStockHoldingsSummary) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(stocks.stocks.enumerated()), id: \.element.id) { index, stock in
                HStack {
                    Text("\(index + 1)")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .frame(width: 18, alignment: .leading)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(stock.stockName)
                            .font(.subheadline)
                        Text("\(stock.stockCode) · 占净值 \(String(format: "%.2f", stock.pct))%")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(stock.price?.formatted(.number.precision(.fractionLength(2))) ?? "--")
                            .font(.subheadline.monospacedDigit())
                        Text(stock.changePct?.signedPctText ?? "--")
                            .font(.caption)
                            .foregroundStyle(changeColor(stock.changePct))
                            .monospacedDigit()
                    }
                }
                .padding(.vertical, 6)
                if index < stocks.stocks.count - 1 {
                    Divider()
                }
            }
        }
    }

    // MARK: - 费率

    private func feesSection(_ fees: FundFees) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 16) {
                if let purchase = fees.purchaseFee {
                    Label("申购 \(purchase)", systemImage: "cart")
                }
                if let management = fees.managementFee {
                    Label("管理 \(management)", systemImage: "building.columns")
                }
                if let custody = fees.custodyFee {
                    Label("托管 \(custody)", systemImage: "lock")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if let tiers = fees.redemptionFees, !tiers.isEmpty {
                VStack(spacing: 4) {
                    ForEach(Array(tiers.enumerated()), id: \.offset) { _, tier in
                        HStack {
                            Text(tier.holdingPeriod)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Spacer()
                            Text(tier.rate)
                                .font(.caption.monospacedDigit())
                        }
                    }
                }
                Text("赎回费率（按持有期）")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            } else if let raw = fees.rawText, !raw.isEmpty {
                Text(raw)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
    }
}

// MARK: - 待确认交易行

struct PendingTransactionRow: View {
    let tx: PendingTransaction
    let onAction: (Bool) -> Void // true=approve, false=delete

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(tx.type.label)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(changeColor(tx.type == .buy ? 1 : -1))
                    TagView(text: tx.status.label, color: tx.status == .draft ? .purple : .orange)
                }
                Text(orderText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("日期 \(tx.orderDate)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            Spacer()
            VStack(spacing: 6) {
                if tx.status == .draft {
                    Button("批准") { onAction(true) }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                        .tint(.orange)
                }
                Button("撤销", role: .destructive) { onAction(false) }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
        }
    }

    private var orderText: String {
        switch tx.type {
        case .buy:
            if let amount = tx.orderAmount { "金额 \(amount.moneyText) 元" }
            else { "金额 --" }
        case .sell:
            if let shares = tx.orderShares { "份额 \(shares.formatted(.number.precision(.fractionLength(2))))" }
            else { "份额 --" }
        default: "份额 \(tx.orderShares?.formatted(.number.precision(.fractionLength(2))) ?? "--")"
        }
    }
}

// MARK: - 历史交易行

struct HistoryTransactionRow: View {
    let tx: HistoryTransaction

    var body: some View {
        HStack {
            Text(tx.type.label)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(changeColor(tx.type == .buy ? 1 : -1))
                .frame(width: 44, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                if let shares = tx.confirmedShares {
                    Text("份额 \(shares.formatted(.number.precision(.fractionLength(2))))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let note = tx.note, !note.isEmpty {
                    Text(note)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(tx.confirmedAmount?.signedMoneyText ?? "--")
                    .font(.subheadline.monospacedDigit())
                HStack(spacing: 4) {
                    if let nav = tx.confirmedNav {
                        Text("净值 \(nav.formatted(.number.precision(.fractionLength(4))))")
                    }
                    Text(tx.orderDate ?? "")
                }
                .font(.caption2)
                .foregroundStyle(.tertiary)
            }
        }
    }
}
