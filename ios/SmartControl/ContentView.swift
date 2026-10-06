import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var session: AppSession
    @State private var token = ""
    @State private var backendURL = ""

    var body: some View {
        NavigationStack {
            List {
                Section("Backend") {
                    TextField("https://api.example.com", text: $backendURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)

                    Button("Save Backend URL") {
                        session.saveBaseURL(backendURL)
                    }
                    .disabled(backendURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    Button("Check Backend Health") {
                        Task { await session.refresh() }
                    }
                    .disabled(session.isBusy || backendURL.isEmpty)
                }

                Section("Authentication") {
                    if session.authenticated {
                        LabeledContent("Status", value: "Authenticated")
                        if let account = session.account {
                            LabeledContent("User", value: account.email ?? account.phoneNumber ?? account.uid)
                            LabeledContent("Admin", value: account.admin ? "Yes" : "No")
                        }
                        Button("Sign Out", role: .destructive) {
                            session.signOut()
                        }
                    } else {
                        Text("Use a Firebase ID token issued by the configured authentication flow. The token is stored in the iOS Keychain.")
                            .font(.footnote)
                        SecureField("Firebase ID token", text: $token)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Button("Authenticate") {
                            Task {
                                await session.signInWithToken(token)
                                token = ""
                            }
                        }
                        .disabled(session.isBusy || token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }

                if let health = session.lastHealth {
                    Section("Health") {
                        LabeledContent("Service", value: health.service)
                        LabeledContent("Healthy", value: health.ok ? "Yes" : "No")
                        LabeledContent("Checked", value: health.timestamp)
                    }
                }

                if session.authenticated {
                    Section("Devices") {
                        if session.devices.isEmpty {
                            Text("No devices returned by the backend.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(session.devices) { device in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(device.name ?? device.id)
                                        .font(.headline)
                                    Text([device.platform, device.status].compactMap { $0 }.joined(separator: " • "))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }

                    if let status = session.systemStatus {
                        Section("System Status") {
                            LabeledContent("Backend", value: status.ok ? "Healthy" : "Degraded")
                            LabeledContent("Firestore", value: status.firestore)
                            LabeledContent("PostgreSQL", value: status.postgres.ok ? "Healthy" : (status.postgres.configured ? "Unavailable" : "Not configured"))
                        }
                    }
                }

                if let errorMessage = session.errorMessage {
                    Section("Error") {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle("Smart Control")
            .onAppear { backendURL = session.apiBaseURL }
        }
    }
}
