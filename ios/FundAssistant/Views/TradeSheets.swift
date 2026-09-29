import SwiftUI

// MARK: - 修改板块

struct SectorEditSheet: View {
    let currentSector: String?
    let onSave: (String?) -> Void

    @Environment(DictStore.self) private var dictStore
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("板块名称（如：消费、医药、美股）", text: $text)
                    if !dictStore.items(DictStore.sectorType).isEmpty {
                        Picker("从字典选择", selection: $text) {
                            Text("自定义（手动输入）").tag("")
                            ForEach(dictStore.items(DictStore.sectorType)) { item in
                                Text(item.label).tag(item.value)
                            }
                        }
                    }
                } header: {
                    Text("基金板块")
                } footer: {
                    Text("板块为基金库全局属性，所有用户共享；清空表示移除板块")
                }
            }
            .navigationTitle("修改板块")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                        onSave(trimmed.isEmpty ? nil : trimmed)
                        dismiss()
                    }
                }
            }
            .onAppear { text = currentSector ?? "" }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - 买入 / 卖出表单

struct TradeSheet: View {
    let holding: Holding?
    let detail: FundDetail?
    let type: TradeType

    @Environment(HoldingsStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var amountText = ""
    @State private var sharesText = ""
    @State private var date = Date()
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private var availableShares: Double { holding?.availableShares ?? 0 }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("基金", value: "\(holding?.name ?? detail?.name ?? "") (\(holding?.code ?? detail?.code ?? ""))")
                    if type == .buy {
                        TextField("买入金额（元）", text: $amountText)
                            .keyboardType(.decimalPad)
                    } else {
                        TextField("卖出份额", text: $sharesText)
                            .keyboardType(.decimalPad)
                        HStack {
                            Text("可用份额 \(availableShares.formatted(.number.precision(.fractionLength(2))))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Spacer()
                            Button("全部卖出") {
                                sharesText = availableShares.formatted(.number.precision(.fractionLength(2)))
                            }
                            .font(.caption)
                            .buttonStyle(.borderless)
                        }
                    }
                    DatePicker("交易日期", selection: $date, displayedComponents: .date)
                } header: {
                    Text(type == .buy ? "买入" : "卖出")
                } footer: {
                    Text(type == .buy
                         ? "按金额买入，提交后记录为待确认交易，服务端每日按净值结算。"
                         : "卖出以份额计。提交后冻结相应份额，待服务端按净值结算；赎回费按持有期阶梯计算。")
                }

                if holding?.isWatchOnly == true {
                    Section {
                        Text("当前为仅关注状态，无法交易")
                            .foregroundStyle(.secondary)
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("\(type.label) · \(holding?.name ?? detail?.name ?? "")")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Button("提交") { Task { await submit() } }
                            .disabled(!isValid)
                    }
                }
            }
        }
    }

    private var isValid: Bool {
        switch type {
        case .buy: Double(amountText) ?? 0 > 0
        case .sell: Double(sharesText) ?? 0 > 0
        }
    }

    private func submit() async {
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            switch type {
            case .buy:
                _ = try await store.submitTrade(
                    fundCode: holding?.code ?? detail?.code ?? "",
                    type: .buy,
                    amount: Double(amountText),
                    shares: nil,
                    date: DateFormat.string(from: date)
                )
            case .sell:
                _ = try await store.submitTrade(
                    fundCode: holding?.code ?? detail?.code ?? "",
                    type: .sell,
                    amount: nil,
                    shares: Double(sharesText),
                    date: DateFormat.string(from: date)
                )
            }
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

// MARK: - 基金转换表单

struct ConvertSheet: View {
    let fromHolding: Holding?

    @Environment(HoldingsStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var toCode = ""
    @State private var sharesText = ""
    @State private var date = Date()
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private var targetCandidates: [Holding] {
        store.holdings.filter { $0.code != fromHolding?.code }
    }

    private var availableShares: Double { fromHolding?.availableShares ?? 0 }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("转出基金", value: "\(fromHolding?.name ?? "--") (\(fromHolding?.code ?? "--"))")
                    HStack {
                        Text("可用份额 \(availableShares.formatted(.number.precision(.fractionLength(2))))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button("全部") { sharesText = availableShares.formatted(.number.precision(.fractionLength(2))) }
                            .font(.caption)
                            .buttonStyle(.borderless)
                    }
                    TextField("转出份额", text: $sharesText)
                        .keyboardType(.decimalPad)
                }

                Section("转入基金") {
                    if targetCandidates.isEmpty {
                        Text("暂无其他持仓基金，可手动输入代码").font(.caption).foregroundStyle(.secondary)
                    }
                    TextField("转入基金代码（6 位）", text: $toCode)
                        .keyboardType(.numberPad)
                    if !targetCandidates.isEmpty {
                        Menu("从持仓中选择") {
                            ForEach(targetCandidates) { h in
                                Button("\(h.name) (\(h.code))") { toCode = h.code }
                            }
                        }
                    }
                }

                Section {
                    DatePicker("转换日期", selection: $date, displayedComponents: .date)
                }

                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            .navigationTitle("基金转换")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Button("提交") { Task { await submit() } }
                            .disabled((Double(sharesText) ?? 0) <= 0 || toCode.count < 6)
                    }
                }
            }
        }
    }

    private func submit() async {
        guard let from = fromHolding, let shares = Double(sharesText) else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            _ = try await store.submitConvert(
                fromCode: from.code, toCode: toCode, shares: shares, date: DateFormat.string(from: date)
            )
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

// MARK: - 添加 / 编辑持仓

struct AddEditHoldingSheet: View {
    enum Mode {
        case add
        case edit(Holding)

        var holding: Holding? {
            if case .edit(let h) = self { return h }
            return nil
        }
    }

    let mode: Mode

    @Environment(HoldingsStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var code = ""
    @State private var sharesText = ""
    @State private var costPriceText = ""
    @State private var attentionLevel = 1
    @State private var strategy = ""
    @State private var fundType: FundType = .open
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private var editing: Bool { mode.holding != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("基金代码（6 位数字）", text: $code)
                        .keyboardType(.numberPad)
                        .disabled(editing)
                    if !editing {
                        Picker("基金类型", selection: $fundType) {
                            ForEach(FundType.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                    }
                } header: {
                    Text("基金")
                } footer: {
                    Text(editing ? "代码不可修改" : "输入 6 位基金代码；份额与成本价可留空（即仅关注）")
                }

                Section("我的持仓") {
                    TextField("持有份额", text: $sharesText)
                        .keyboardType(.decimalPad)
                    TextField("成本单价", text: $costPriceText)
                        .keyboardType(.decimalPad)
                    if sharesInvalid {
                        Text("份额与成本价需同时填写或同时留空")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }

                Section("关注等级") {
                    Picker("等级", selection: $attentionLevel) {
                        Text("普通").tag(1)
                        Text("重点").tag(2)
                        Text("核心").tag(3)
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    TextEditor(text: $strategy)
                        .frame(minHeight: 80)
                } header: {
                    Text("操作策略")
                } footer: {
                    Text("操作策略为全局共享（所有用户可见），作为 AI 分析参考")
                }

                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            .navigationTitle(editing ? "编辑持仓" : "添加基金")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Button(editing ? "保存" : "添加") { Task { await submit() } }
                            .disabled(!isValid)
                    }
                }
            }
            .onAppear(perform: fillFromHolding)
        }
    }

    private var sharesInvalid: Bool {
        let hasShares = Double(sharesText) != nil
        let hasCost = Double(costPriceText) != nil
        return hasShares != hasCost
    }

    private var isValid: Bool {
        if editing {
            return !sharesInvalid
        }
        let validCode = code.count == 6 && code.allSatisfy(\.isNumber)
        return validCode && !sharesInvalid
    }

    private func fillFromHolding() {
        guard let holding = mode.holding else { return }
        code = holding.code
        if let shares = holding.shares { sharesText = shares.formatted(.number) }
        if let cost = holding.costPrice { costPriceText = cost.formatted(.number) }
        attentionLevel = holding.attentionLevel
        strategy = holding.operationStrategy ?? ""
    }

    private func submit() async {
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        let shares = Double(sharesText)
        let cost = Double(costPriceText)
        do {
            if let holding = mode.holding {
                try await store.updateHolding(
                    code: holding.code,
                    shares: shares, costPrice: cost,
                    attentionLevel: attentionLevel,
                    operationStrategy: strategy
                )
            } else {
                try await store.addHolding(
                    code: code,
                    shares: shares, costPrice: cost,
                    attentionLevel: attentionLevel,
                    operationStrategy: strategy,
                    fundType: fundType
                )
            }
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
