import SwiftUI

@main
struct SmartControlApp: App {
    @StateObject private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(session)
        }
    }
}

@MainActor
final class AppSession: ObservableObject {
    @Published private(set) var authenticated = false
    @Published private(set) var lastHealth: BackendHealth?
    @Published private(set) var errorMessage: String?

    private let client = BackendClient()

    func refresh() async {
        errorMessage = nil
        do {
            lastHealth = try await client.health()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func setAuthenticationToken(_ token: String) {
        client.setBearerToken(token)
        authenticated = !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

struct BackendHealth: Decodable {
    let ok: Bool
    let service: String
    let timestamp: String
}

struct BackendClient {
    private let baseURL: URL
    private var bearerToken: String?

    init() {
        let configured = Bundle.main.object(forInfoDictionaryKey: "SMARTCONTROL_API_BASE_URL") as? String
        baseURL = URL(string: configured ?? "") ?? URL(string: "https://invalid.smart-control.invalid")!
    }

    mutating func setBearerToken(_ token: String) {
        bearerToken = token
    }

    func health() async throws -> BackendHealth {
        var request = URLRequest(url: baseURL.appendingPathComponent("healthz"))
        request.timeoutInterval = 15
        request.httpMethod = "GET"
        if let bearerToken {
            request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(BackendHealth.self, from: data)
    }
}
