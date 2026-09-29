import Foundation

/// 全局字典（对应网页端 useDictStore）：/api/dicts/all 为公开接口，
/// 将 dictType 内的 value 映射为展示 label（如 sector 存的是字典值，展示用 label）
@MainActor
@Observable
final class DictStore {
    static let sectorType = "sectors"

    var rawDicts: [String: [DictItem]] = [:]
    var isLoaded = false

    private var labelMaps: [String: [String: String]] = [:]

    private let api = APIClient.shared

    func load() async {
        guard !isLoaded else { return }
        guard let data: [String: [DictItem]] = try? await api.request("/api/dicts/all") else { return }
        rawDicts = data
        labelMaps = data.mapValues { items in
            Dictionary(items.map { ($0.value, $0.label) }, uniquingKeysWith: { _, new in new })
        }
        isLoaded = true
    }

    /// value → label；字典里不存在时回退显示原值；value 为 nil 返回 nil（与网页端 getLabel 一致）
    func label(_ type: String, _ value: String?) -> String? {
        guard let value, !value.isEmpty else { return nil }
        return labelMaps[type]?[value] ?? value
    }

    /// 某类型下的全部字典项（按 sortOrder）
    func items(_ type: String) -> [DictItem] {
        (rawDicts[type] ?? []).sorted { ($0.sortOrder ?? 0) < ($1.sortOrder ?? 0) }
    }
}
