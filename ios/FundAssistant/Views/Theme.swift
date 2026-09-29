import SwiftUI

// MARK: - 主题（金融风格：深蓝主色 + 涨红跌绿）

enum Theme {
    /// 品牌深蓝（导航/渐变深端）
    static let brandDeep = Color(red: 0.06, green: 0.16, blue: 0.34)
    /// 品牌蓝（渐变浅端）
    static let brandMid = Color(red: 0.10, green: 0.29, blue: 0.58)
    /// 亮蓝点缀
    static let brandSoft = Color(red: 0.20, green: 0.47, blue: 0.85)
    /// 金色点缀（星级/徽标）
    static let gold = Color(red: 0.90, green: 0.72, blue: 0.32)

    /// 资产总览卡渐变
    static let heroGradient = LinearGradient(
        colors: [brandDeep, brandMid],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
}

// MARK: - 卡片样式

extension View {
    /// 通用卡片容器
    func cardStyle(padding: CGFloat = 14) -> some View {
        self
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: - 资产隐私遮罩

extension AppSettings {
    private static let hideAssetsKey = "hideAssets"

    var hideAssets: Bool {
        get { UserDefaults.standard.bool(forKey: Self.hideAssetsKey) }
        set {
            UserDefaults.standard.set(newValue, forKey: Self.hideAssetsKey)
            objectWillChange.send()
        }
    }
}

/// 金额文本：隐私模式下以"¥ ✱✱✱✱"展示
struct AmountText: View {
    let value: Double?
    var signed: Bool = false
    var font: Font = .subheadline.weight(.semibold)
    var color: Color = .primary
    var showSignColor: Bool = false
    /// 深色背景（渐变卡）上使用亮色涨跌变体
    var darkBackground: Bool = false

    @ObservedObject private var settings = AppSettings.shared

    var body: some View {
        Text(displayText)
            .font(font)
            .foregroundStyle(resolvedColor)
            .monospacedDigit()
    }

    private var resolvedColor: Color {
        if showSignColor { return darkBackground ? changeColorOnDark(value) : changeColor(value) }
        return color
    }

    private var displayText: String {
        guard settings.hideAssets else {
            guard let value else { return "--" }
            return (signed && value > 0 ? "+" : "") + value.moneyText
        }
        return signed ? "+ ✱✱✱" : "✱✱✱✱"
    }
}
