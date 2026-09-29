import SwiftUI

struct DcaPlansView: View {
    @Environment(DcaPlanStore.self) private var store
    @Environment(HoldingsStore.self) private var holdingsStore

    @State private var showCreateSheet = false
    @State private var toast: String?

    var body: some View {
        NavigationStack {
            Group {
                if store.isLoading {
                    ProgressView("加载定投计划…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = store.errorMessage, store.plans.isEmpty {
                    ContentUnavailableView {
                        Label("加载失败", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("重试") { Task { await store.load() } }
                    }
                } else if store.plans.isEmpty {
                    ContentUnavailableView {
                        Label("暂无定投计划", systemImage: "calendar.badge.plus")
                    } description: {
                        Text("创建每日 / 每周 / 每两周 / 每月定投计划")
                    }
                } else {
                    planList
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("定投计划")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showCreateSheet = true } label: { Label("新建计划", systemImage: "plus") }
                }
            }
            .refreshable { await store.load() }
            .task {
                if store.plans.isEmpty { await store.load() }
                if holdingsStore.holdings.isEmpty { await holdingsStore.load() }
            }
            .sheet(isPresented: $showCreateSheet) {
                DcaPlanFormSheet()
            }
            .toast(toast)
        }
    }

    private var planList: some View {
        List {
            ForEach(store.plans) { plan in
                DcaPlanRow(plan: plan) { enabled in
                    perform { try await store.update(plan.id, enabled: enabled) }
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        perform { try await store.delete(plan.id) }
                    } label: {
                        Label("删除", systemImage: "trash")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
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
}

// MARK: - 计划行

struct DcaPlanRow: View {
    let plan: DcaPlan
    let onToggle: (Bool) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(plan.fundName ?? plan.fundCode)
                    .font(.headline)
                    .lineLimit(1)
                Text(plan.fundCode)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Toggle("", isOn: Binding(get: { plan.enabled }, set: onToggle))
                    .labelsHidden()
            }
            HStack(spacing: 8) {
                TagView(text: frequencyText, color: .blue)
                Text("每期 \(plan.amount.moneyText) 元")
                    .font(.subheadline.monospacedDigit())
                Spacer()
            }
            HStack {
                Label("下次扣款 \(plan.nextExecutionDate)", systemImage: "calendar")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                if let last = plan.lastExecutionDate {
                    Text("上次 \(last)")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.vertical, 2)
        .opacity(plan.enabled ? 1 : 0.5)
    }

    private var frequencyText: String {
        var text = plan.frequency.label
        if let anchor = plan.anchorDay {
            switch plan.frequency {
            case .weekly, .biweekly:
                text += "·周\("一二三四五六日".dropFirst(anchor - 1).prefix(1))"
            case .monthly:
                text += "·\(anchor) 日"
            default: break
            }
        }
        return text
    }
}

// MARK: - 新建计划

struct DcaPlanFormSheet: View {
    @Environment(DcaPlanStore.self) private var store
    @Environment(HoldingsStore.self) private var holdingsStore
    @Environment(\.dismiss) private var dismiss

    @State private var fundCode = ""
    @State private var amountText = ""
    @State private var frequency: DcaFrequency = .monthly
    @State private var anchorDay = 1
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("基金代码（6 位，需已在基金库中）", text: $fundCode)
                        .keyboardType(.numberPad)
                    if !holdingsStore.holdings.isEmpty {
                        Menu("从持仓基金中选择") {
                            ForEach(holdingsStore.holdings) { h in
                                Button("\(h.name) (\(h.code))") { fundCode = h.code }
                            }
                        }
                    }
                    TextField("每期金额（元）", text: $amountText)
                        .keyboardType(.decimalPad)
                } header: {
                    Text("基金与金额")
                } footer: {
                    Text("定投按非交易日自动顺延扣款日，服务端每日自动执行")
                }

                Section("频率") {
                    Picker("频率", selection: $frequency) {
                        ForEach(DcaFrequency.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)

                    if frequency == .weekly || frequency == .biweekly {
                        Picker("扣款日", selection: $anchorDay) {
                            ForEach(1...5, id: \.self) { Text("周\("一二三四五".dropFirst($0 - 1).prefix(1))").tag($0) }
                        }
                    }
                    if frequency == .monthly {
                        Stepper(value: $anchorDay, in: 1...28) {
                            Text("每月 \(anchorDay) 日")
                        }
                    }
                }

                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            .navigationTitle("新建定投计划")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Button("创建") { Task { await submit() } }
                            .disabled(!isValid)
                    }
                }
            }
        }
    }

    private var isValid: Bool {
        fundCode.count == 6 && fundCode.allSatisfy(\.isNumber) && (Double(amountText) ?? 0) > 0
    }

    private func submit() async {
        guard let amount = Double(amountText) else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            try await store.create(
                fundCode: fundCode,
                amount: amount,
                frequency: frequency,
                anchorDay: (frequency == .weekly || frequency == .biweekly || frequency == .monthly) ? anchorDay : nil
            )
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
