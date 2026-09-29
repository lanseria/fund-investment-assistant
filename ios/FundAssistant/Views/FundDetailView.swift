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
    @State private var scrubIndex: Int?

    @State private var tradeType: TradeType?
    @State private var showConvert = false
    @State private var showEdit = false
    @State private var showSectorEditor = false
    @State private var confirmDelete: Holding?
    @State private var confirmClear: Holding?

    enum ChartRange: String, CaseIterable, Identifiable {
        case oneMonth = "1月", threeMonths = "3月", sixMonths = "6月", oneYear = "1年", twoYears = "2年", all = "全部"
        var id: String { rawValue }

        var days: Int? {
            switch self {
            case .oneMonth: 31
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

    // MARK: - 详情（卡片式滚动布局）

    private func detailList(_ detail: FundDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                overviewSection(detail)
                    .cardStyle(padding: 12)
                actionsCard
                if let perf = performance {
                    sectionCard("区间涨跌") {
                        performanceSection(perf)
                    }
                }
                if !history.isEmpty {
                    sectionCard("净值走势") {
                        chartSection
                    }
                }
                if let stocks = detail.stockHoldings, !stocks.stocks.isEmpty {
                    sectionCard("重仓股 · \(stocks.reportDate) 报告期 · 覆盖 \(String(format: "%.1f", stocks.coverage))%") {
                        stockHoldingsSection(stocks)
                    }
                }
                if let fees = detail.fees {
                    sectionCard("费率") {
                        feesSection(fees)
                    }
                }
                if let pending = currentHolding?.pendingTransactions, !pending.isEmpty {
                    sectionCard("待确认交易") {
                        VStack(spacing: 0) {
                            ForEach(Array(pending.enumerated()), id: \.element.id) { index, tx in
                                PendingTransactionRow(tx: tx) { approve in
                                    if approve {
                                        perform { try await store.approveTransaction(tx.id) }
                                    } else {
                                        perform { try await store.deleteTransaction(tx.id) }
                                    }
                                }
                                if index < pending.count - 1 {
                                    Divider()
                                }
                            }
                        }
                    }
                }
                if !historyTransactions.isEmpty {
                    sectionCard("最近交易") {
                        VStack(spacing: 0) {
                            ForEach(Array(historyTransactions.prefix(10).enumerated()), id: \.element.id) { index, tx in
                                HistoryTransactionRow(tx: tx)
                                    .padding(.vertical, 8)
                                if index < min(historyTransactions.count, 10) - 1 {
                                    Divider()
                                }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 10)
            .padding(.top, 4)
            .padding(.bottom, 16)
        }
        .defaultScrollAnchor(LaunchArgs.scrollAnchor)
    }

    /// 小节标题 + 卡片
    private func sectionCard<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.leading, 4)
            content()
                .cardStyle(padding: 12)
        }
    }

    private var actionsCard: some View {
        sectionCard("操作") {
            actionButtons
        }
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
                    Text(DateFormat.localShortTime(detail.todayEstimateUpdateTime))
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
                HStack(spacing: 10) {
                    Text(label)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(width: 56, alignment: .leading)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color(.tertiarySystemFill))
                            if let value {
                                let ratio = min(abs(value) / 60.0, 1.0)
                                Capsule()
                                    .fill(changeColor(value))
                                    .frame(width: max(geo.size.width * ratio, 6))
                            }
                        }
                    }
                    .frame(height: 8)
                    Text(value?.signedPctText ?? "--")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(changeColor(value))
                        .monospacedDigit()
                        .frame(width: 70, alignment: .trailing)
                }
            }
        }
        .padding(.vertical, 2)
    }

    // MARK: - 走势图

    private var chartSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("区间", selection: $chartRange) {
                ForEach(ChartRange.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)

            scrubHeader
            chart
            seriesPicker
        }
        .padding(.vertical, 6)
    }

    /// 手势扫动时的信息条（日期 / 净值 / 较区间起点涨跌）
    @ViewBuilder
    private var scrubHeader: some View {
        if let point = scrubbedPoint, let baseline = filteredHistory.first?.nav, baseline > 0 {
            HStack(spacing: 10) {
                Text(point.date)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text("净值 \(point.nav.formatted(.number.precision(.fractionLength(4))))")
                    .font(.caption.weight(.semibold))
                    .monospacedDigit()
                Text((((point.nav - baseline) / baseline) * 100).signedPctText)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(changeColor(point.nav - baseline))
                    .monospacedDigit()
                Spacer()
                Text("松开返回")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
            .transition(.opacity.combined(with: .scale(scale: 0.98, anchor: .top)))
        }
    }

    private var scrubbedPoint: HoldingHistoryPoint? {
        guard let scrubIndex, filteredHistory.indices.contains(scrubIndex) else { return nil }
        return filteredHistory[scrubIndex]
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
            ("净值", { $0.nav }, Theme.brandSoft),
            ("MA5", { $0.ma5 }, .orange),
            ("MA10", { $0.ma10 }, .purple),
            ("MA20", { $0.ma20 }, .blue),
            ("MA120", { $0.ma120 }, .teal),
        ]
        return Chart {
            if visibleSeries.contains("净值") {
                ForEach(data) { point in
                    AreaMark(
                        x: .value("日期", point.date),
                        y: .value("净值", point.nav)
                    )
                    .interpolationMethod(.catmullRom)
                }
                .foregroundStyle(.linearGradient(
                    colors: [Theme.brandSoft.opacity(0.28), Theme.brandSoft.opacity(0.02)],
                    startPoint: .top, endPoint: .bottom
                ))
            }
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
                        }
                    }
                }
            }
            if let index = scrubIndex, data.indices.contains(index) {
                RuleMark(x: .value("选中", data[index].date))
                    .foregroundStyle(Color.secondary.opacity(0.6))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
            }
        }
        .chartYScale(domain: chartYDomain)
        .chartForegroundStyleScale(domain: series.map(\.0), range: series.map(\.2))
        .chartLegend(.hidden)
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: 5)) { value in
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
        .chartOverlay { proxy in
            GeometryReader { geo in
                Rectangle()
                    .fill(.clear)
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                scrubIndex = nearestIndex(atX: value.location.x, in: geo, proxy: proxy, count: data.count)
                            }
                            .onEnded { _ in scrubIndex = nil }
                    )
            }
        }
        .frame(height: 216)
        .clipped()
        .animation(.easeOut(duration: 0.15), value: scrubIndex)
    }

    /// Y 轴范围：只覆盖可见系列的数据（净值 ~1.8-2.0 不应从 0 画起）
    private var chartYDomain: ClosedRange<Double> {
        let data = filteredHistory
        var values: [Double] = []
        if visibleSeries.contains("净值") { values += data.map(\.nav) }
        if visibleSeries.contains("MA5") { values += data.compactMap(\.ma5) }
        if visibleSeries.contains("MA10") { values += data.compactMap(\.ma10) }
        if visibleSeries.contains("MA20") { values += data.compactMap(\.ma20) }
        if visibleSeries.contains("MA120") { values += data.compactMap(\.ma120) }
        guard let lo = values.min(), let hi = values.max(), hi > lo else { return 0...1 }
        let pad = (hi - lo) * 0.1
        return (lo - pad)...(hi + pad)
    }

    /// 由手势横坐标反推最近的数据点下标（分类轴等距分布）
    private func nearestIndex(atX x: CGFloat, in geo: GeometryProxy, proxy: ChartProxy, count: Int) -> Int? {
        guard count > 0, let plotFrame = proxy.plotFrame else { return nil }
        let plotWidth = geo[plotFrame].width
        guard plotWidth > 0 else { return nil }
        let ratio = min(max(x / plotWidth, 0), 1)
        // 分类轴两端各留半格，居中对齐
        let position = ratio * CGFloat(count - 1)
        return Int((position).rounded())
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
