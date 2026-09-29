import SwiftUI

/// 首页大盘指数横滑条（上证/深成/创业板/沪深300/恒指/纳指/道指）
struct MarketStrip: View {
    let indices: [MarketIndex]
    let isLoading: Bool

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 18)
            } else if !indices.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(indices) { index in
                            MarketIndexCard(index: index)
                        }
                    }
                    .padding(.horizontal, 2)
                    .padding(.vertical, 2)
                }
            }
        }
    }
}

struct MarketIndexCard: View {
    let index: MarketIndex

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 4) {
                Text(index.name)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                if index.delayed {
                    Text("延")
                        .font(.system(size: 8, weight: .semibold))
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 3)
                        .padding(.vertical, 1)
                        .background(Color.orange.opacity(0.12), in: Capsule())
                }
            }
            Text(index.value.formatted(.number.precision(.fractionLength(2))))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(changeColor(index.changeRate))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(index.changeRate.signedPctText)
                .font(.caption.weight(.medium))
                .foregroundStyle(changeColor(index.changeRate))
                .monospacedDigit()
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .frame(width: 102, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 11))
    }
}
