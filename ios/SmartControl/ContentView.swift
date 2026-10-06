import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var session: AppSession
    @State private var token = ""

    var body: some View {
        NavigationStack {
            List {
                Section("Consent & Session") {
                    Text("Smart Control requires explicit user-controlled sessions. This companion does not bypass iOS permissions or system confirmation.")
                        .font(.footnote)
                    SecureField("Firebase ID token", text: $token)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button("Use Token for Session") {
                        session.setAuthenticationToken(token)
                    }
                    .disabled(token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                Section("Backend") {
                    HStack {
                        Text("Authenticated")
                        Spacer()
                        Image(systemName: session.authenticated ? "checkmark.circle.fill" : "xmark.circle")
                    }

                    Button("Check Backend Health") {
                        Task { await session.refresh() }
                    }

                    if let health = session.lastHealth {
                        LabeledContent("Service", value: health.service)
                        LabeledContent("Healthy", value: health.ok ? "Yes" : "No")
                        LabeledContent("Checked", value: health.timestamp)
                    }

                    if let errorMessage = session.errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle("Smart Control")
        }
    }
}
