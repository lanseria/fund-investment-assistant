import SwiftUI

// MARK: - 数值格式化

extension Double {
    /// 金额：12,345.67
    var moneyText: String {
        self.formatted(.number.precision(.fractionLength(2)).grouping(.automatic))
    }

    /// 带符号金额：+123.45 / -123.45
    var signedMoneyText: String {
        let sign = self > 0 ? "+" : ""
        return sign + moneyText
    }

    /// 百分比：2.35%
    var pctText: String {
        self.formatted(.number.precision(.fractionLength(2))) + "%"
    }

    /// 带符号百分比：+2.35% / -2.35%
    var signedPctText: String {
        let sign = self > 0 ? "+" : ""
        return sign + pctText
    }
}

// MARK: - 涨跌颜色（A股惯例：红涨绿跌）

func changeColor(_ value: Double?) -> Color {
    guard let value, value != 0 else { return .secondary }
    return value > 0 ? .red : .green
}

/// 深色背景（渐变卡）上的涨跌亮色变体
func changeColorOnDark(_ value: Double?) -> Color {
    guard let value, value != 0 else { return .white.opacity(0.65) }
    return value > 0 ? Color(red: 1.0, green: 0.48, blue: 0.48) : Color(red: 0.38, green: 0.85, blue: 0.60)
}

func moneyColor(_ value: Double?) -> Color {
    changeColor(value)
}

// MARK: - 信号标签配色

func signalColor(_ signal: String?) -> Color {
    switch signal {
    case .some(let s) where s.contains("买") || s.contains("持有") || s.contains("抢筹") || s.contains("建仓"):
        .red
    case .some(let s) where s.contains("卖") || s.contains("出货") || s.contains("规避"):
        .green
    case .some(let s) where s.contains("观望") || s.contains("洗盘"):
        .orange
    case .none:
        .secondary.opacity(0.3)
    case .some:
        .blue
    }
}

// MARK: - 涨跌文本

struct ChangeLabel: View {
    let value: Double?
    var style: Style = .percent

    enum Style { case percent, money }

    var body: some View {
        Text(text)
            .foregroundStyle(changeColor(value))
            .monospacedDigit()
    }

    private var text: String {
        guard let value else { return "--" }
        return switch style {
        case .percent: value.signedPctText
        case .money: value.signedMoneyText
        }
    }
}

// MARK: - 指标卡片

struct StatCard: View {
    let title: String
    let value: String
    var color: Color = .primary
    var subText: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title3.bold())
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            if let subText {
                Text(subText)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - 标签

struct TagView: View {
    let text: String
    var color: Color = .blue

    var body: some View {
        Text(text)
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }
}

// MARK: - 日期工具

enum DateFormat {
    static let dayOnly = "yyyy-MM-dd"

    static func todayString() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = dayOnly
        return formatter.string(from: Date())
    }

    static func string(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = dayOnly
        return formatter.string(from: date)
    }

    /// "2026-09-28 15:00:00" → "09-28 15:00"
    static func shortTime(_ raw: String?) -> String {
        guard let raw, raw.count >= 16 else { return raw ?? "--" }
        return String(raw.dropFirst(5).prefix(11))
    }
}
