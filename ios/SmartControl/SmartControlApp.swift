import SwiftUI
import Security

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
    @Published private(set) var account: AuthSession?
    @Published private(set) var devices: [SmartDevice] = []
    @Published private(set) var systemStatus: SystemStatus?
    @Published private(set) var isBusy = false
    @Published private(set) var errorMessage: String?
    @Published var apiBaseURL: String

    private let tokenStore = KeychainTokenStore()
    private var client = BackendClient()

    init() {
        apiBaseURL = UserDefaults.standard.string(forKey: "smartcontrol.apiBaseURL") ?? ""
        client.setBaseURL(apiBaseURL)
        if let token = tokenStore.read() {
            client.setBearerToken(token)
            authenticated = true
        }
    }

    func saveBaseURL(_ value: String) {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        apiBaseURL = normalized
        UserDefaults.standard.set(normalized, forKey: "smartcontrol.apiBaseURL")
        client.setBaseURL(normalized)
        errorMessage = nil
    }

    func signInWithToken(_ token: String) async {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        errorMessage = nil
        isBusy = true
        defer { isBusy = false }
        do {
            client.setBearerToken(trimmed)
            let session = try await client.session()
            try tokenStore.save(trimmed)
            account = session
            authenticated = true
            await refreshAuthenticatedData()
        } catch {
            client.clearBearerToken()
            authenticated = false
            errorMessage = error.localizedDescription
        }
    }

    func signOut() {
        tokenStore.delete()
        client.clearBearerToken()
        authenticated = false
        account = nil
        devices = []
        systemStatus = nil
        lastHealth = nil
        errorMessage = nil
    }

    func refresh() async {
        errorMessage = nil
        isBusy = true
        defer { isBusy = false }
        do {
            lastHealth = try await client.health()
            if authenticated {
                await refreshAuthenticatedData()
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func refreshAuthenticatedData() async {
        do {
            async let session = client.session()
            async let deviceResponse = client.devices()
            async let status = client.systemStatus()
            account = try await session
            devices = try await deviceResponse.devices
            systemStatus = try await status
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct BackendHealth: Decodable {
    let ok: Bool
    let service: String
    let timestamp: String
}

struct AuthSession: Decodable {
    let authenticated: Bool
    let uid: String
    let email: String?
    let phoneNumber: String?
    let admin: Bool
}

struct SmartDevice: Decodable, Identifiable {
    let id: String
    let name: String?
    let platform: String?
    let status: String?
}

struct DeviceResponse: Decodable {
    let devices: [SmartDevice]
}

struct SystemStatus: Decodable {
    let ok: Bool
    let service: String
    let firestore: String
    let postgres: PostgresStatus
}

struct PostgresStatus: Decodable {
    let configured: Bool
    let ok: Bool
}

struct BackendError: Decodable {
    let error: String?
}

final class BackendClient {
    private var baseURL: URL?
    private var bearerToken: String?
    private let decoder = JSONDecoder()

    func setBaseURL(_ value: String) {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        baseURL = URL(string: normalized.isEmpty ? "" : normalized)
    }

    func setBearerToken(_ token: String) {
        bearerToken = token
    }

    func clearBearerToken() {
        bearerToken = nil
    }

    func health() async throws -> BackendHealth {
        try await request(path: "healthz", authenticated: false)
    }

    func session() async throws -> AuthSession {
        try await request(path: "api/auth/session", authenticated: true)
    }

    func devices() async throws -> DeviceResponse {
        try await request(path: "api/devices", authenticated: true)
    }

    func systemStatus() async throws -> SystemStatus {
        try await request(path: "api/system/status", authenticated: true)
    }

    private func request<T: Decodable>(path: String, authenticated: Bool) async throws -> T {
        guard let baseURL else { throw ClientError.configuration("Configure the Smart Control backend URL first.") }
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw ClientError.configuration("The backend URL is invalid.")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if authenticated {
            guard let bearerToken, !bearerToken.isEmpty else { throw ClientError.authentication("Authentication token is missing.") }
            request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ClientError.network("Invalid server response.") }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? decoder.decode(BackendError.self, from: data).error) ?? "Backend request failed (HTTP \(http.statusCode))."
            throw ClientError.network(message)
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw ClientError.network("Backend returned an unexpected response.")
        }
    }
}

enum ClientError: LocalizedError {
    case configuration(String)
    case authentication(String)
    case network(String)

    var errorDescription: String? {
        switch self {
        case .configuration(let message), .authentication(let message), .network(let message):
            return message
        }
    }
}

final class KeychainTokenStore {
    private let service = "com.smartcontrol.ios"
    private let account = "firebase-id-token"

    func save(_ token: String) throws {
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { throw ClientError.authentication("Unable to securely store the authentication token.") }
    }

    func read() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func delete() {
        let query: [String: Any] = [
            kSecClass as String,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}
