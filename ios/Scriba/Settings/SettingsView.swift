import SwiftUI

struct SettingsView: View {
    @ObservedObject var auth: AuthManager

    @State private var cleanupLevel = CleanupLevel.current
    @State private var backendURL = BackendConfig.baseURL.absoluteString
    @State private var devToken = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    if auth.isSignedIn {
                        Label("Signed in", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Button("Sign out", role: .destructive) { auth.signOut() }
                    } else {
                        // TODO: replace with the real Auth0 flow (see ios/README.md).
                        SecureField("Developer access token", text: $devToken)
                        Button("Sign in") {
                            auth.signIn(devToken: devToken)
                            devToken = ""
                        }
                        .disabled(devToken.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }

                Section("Dictation cleanup") {
                    Picker("Cleanup", selection: $cleanupLevel) {
                        ForEach(CleanupLevel.allCases) { level in
                            Text(level.title).tag(level)
                        }
                    }
                    .pickerStyle(.segmented)
                    Text(cleanupLevel.subtitle)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    .onChange(of: cleanupLevel) { _, newValue in
                        CleanupLevel.set(newValue)
                    }
                }

                Section("Server") {
                    TextField("Backend URL", text: $backendURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    Button("Save URL") {
                        BackendConfig.setBaseURL(
                            backendURL.trimmingCharacters(in: .whitespacesAndNewlines))
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}

#Preview {
    SettingsView(auth: AuthManager())
}
