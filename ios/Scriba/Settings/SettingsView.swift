import SwiftUI

struct SettingsView: View {
    @ObservedObject var auth: AuthManager

    @State private var cleanupLevel = CleanupLevel.current
    @State private var language = TranscriptionLanguage.current
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
                        if auth.isAuth0Configured {
                            Button {
                                Task { await auth.signIn() }
                            } label: {
                                Label("Sign in", systemImage: "person.crop.circle")
                            }
                        }
                        if let error = auth.errorMessage {
                            Text(error)
                                .font(.footnote)
                                .foregroundStyle(.red)
                        }
                    }
                }

                if !auth.isSignedIn {
                    Section("Developer") {
                        SecureField("Paste access token", text: $devToken)
                        Button("Use token") {
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

                Section("Language") {
                    Picker("Language", selection: $language) {
                        ForEach(TranscriptionLanguage.options) { option in
                            Text(option.label).tag(option.code)
                        }
                    }
                    .onChange(of: language) { _, newValue in
                        TranscriptionLanguage.set(newValue)
                    }
                    Text("Force a transcription language, or auto-detect.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
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
