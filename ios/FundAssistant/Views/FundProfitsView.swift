import SwiftUI

struct FundProfitsView: View {
    @State private var data: FundProfitsData?
    @State private var isLoading = false
    @State private var errorMessage: String?

    @State private var filter: Filter = .all

    enum Filter: String, CaseIterable, Identifiable {
        case all = "全部", held = "持有中", sold = "已清仓"
        var id: String { rawValue }
    }

    private var funds: [FundProfitRow] {
        guard let data else { return [] }
        switch filter {
        case .all: return data.funds
        case .held: return data.funds.filter(\.isHeld)
        case .sold: return data.funds.filter { !$0.isHeld }
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && data == nil {
                    ProgressView("加载收益数据…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let errorMessage, data == nil {
                    ContentUnavailableView {
                        Label("加载失败", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(errorMessage)
                    } actions: {
                        Button("重试") { Task { await load() } }
                    }
                } else {
                    content
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("收益总览")
            .refreshable { await load() }
            .task { if data == nil { await load() } }
        }
    }

    private var content: some View {
        List {
            if let data {
                Section {
                    summarySection(data.summary)
                        .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                        .listRowBackground(Color.clear)
                }
                Section {
                    Picker("筛选", selection: $filter) {
                        ForEach(Filter.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                }
                Section {
                    ForEach(funds) { row in
                        ProfitRowView(row: row)
                    }
                } header: {
                    Text("\(filter == .all ? "全部基金" : filter.rawValue)（\(funds.count)）")
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func summarySection(_ s: FundProfitSummary) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("累计收益（元）")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.65))
                Spacer()
                Text("共 \(s.fundCount) 只基金")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.65))
            }

            AmountText(
                value: s.totalProfit, signed: true,
                font: .system(size: 30, weight: .bold, design: .rounded),
                color: .white, showSignColor: true,
                darkBackground: true
            )

            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("持有市值（元）")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.65))
                    AmountText(
                        value: s.totalHoldingAmount,
                        font: .headline.monospacedDigit(),
                        color: .white
                    )
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .leading, spacing: 3) {
                    Text("持仓分布")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.65))
                    Text("持有中 \(s.heldCount) 只 · 已清仓 \(s.soldCount) 只")
                        .font(.headline.monospacedDigit())
                        .foregroundStyle(.white)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(18)
        .background(Theme.heroGradient, in: RoundedRectangle(cornerRadius: 18))
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            data = try await APIClient.shared.request("/api/user/fund-profits")
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

// MARK: - 单基金收益行

struct ProfitRowView: View {
    let row: FundProfitRow
    @Environment(DictStore.self) private var dictStore

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(row.name)
                    .font(.headline)
                    .lineLimit(1)
                Text(row.code)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TagView(text: row.isHeld ? "持有中" : "已清仓", color: row.isHeld ? .blue : .gray)
                if let sectorLabel = dictStore.label(DictStore.sectorType, row.sector) {
                    TagView(text: sectorLabel, color: .indigo)
                }
                Spacer()
            }

            HStack(spacing: 0) {
                item("持有收益", row.holdingProfit?.signedMoneyText ?? "--",
                     color: changeColor(row.holdingProfit), sub: row.holdingProfitRate?.signedPctText)
                item("今日估算", row.estimateProfit?.signedMoneyText ?? "--",
                     color: changeColor(row.estimateProfit), sub: row.dayProfitRate?.signedPctText)
                item("累计收益", row.totalProfit.signedMoneyText,
                     color: changeColor(row.totalProfit), sub: nil)
            }

            HStack(spacing: 12) {
                if let nav = row.latestNav {
                    Label("净值 \(nav.formatted(.number.precision(.fractionLength(4))))", systemImage: "chart.line.uptrend.xyaxis")
                }
                if let last = row.lastTradeDate {
                    Label("最近交易 \(last)", systemImage: "clock")
                }
            }
            .font(.caption2)
            .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 2)
    }

    private func item(_ title: String, _ value: String, color: Color, sub: String?) -> some View {
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
}
