import Foundation

@MainActor
@Observable
final class DcaPlanStore {
    var plans: [DcaPlan] = []
    var isLoading = false
    var errorMessage: String?

    private let api = APIClient.shared

    func load() async {
        isLoading = plans.isEmpty
        errorMessage = nil
        defer { isLoading = false }
        do {
            plans = try await api.request("/api/fund/dca-plans")
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func create(fundCode: String, amount: Double, frequency: DcaFrequency, anchorDay: Int?) async throws {
        var body: [String: Any] = [
            "fundCode": fundCode,
            "amount": amount,
            "frequency": frequency.rawValue,
        ]
        if let anchorDay { body["anchorDay"] = anchorDay }
        let _: MessageResponse = try await api.request("/api/fund/dca-plans", method: .post, body: body)
        await load()
    }

    func update(_ id: Int, amount: Double? = nil, frequency: DcaFrequency? = nil, anchorDay: Int?? = nil, enabled: Bool? = nil) async throws {
        var body: [String: Any] = [:]
        if let amount { body["amount"] = amount }
        if let frequency { body["frequency"] = frequency.rawValue }
        if let anchorDay { body["anchorDay"] = anchorDay ?? NSNull() }
        if let enabled { body["enabled"] = enabled }
        let _: MessageResponse = try await api.request("/api/fund/dca-plans/\(id)", method: .put, body: body)
        await load()
    }

    func delete(_ id: Int) async throws {
        let _: MessageResponse = try await api.request("/api/fund/dca-plans/\(id)", method: .delete)
        await load()
    }
}
