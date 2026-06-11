import AVFoundation
import SwiftUI

/// Walks the user through enabling the Scriba keyboard and granting the
/// permissions it needs, mirroring the Wispr Flow setup flow.
struct EnableKeyboardView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var micGranted = AVAudioApplication.shared.recordPermission == .granted
    @State private var keyboardAdded = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Set up Scriba")
                            .font(.title2).bold()
                        Text("Dictate into any app with a tap — like Wispr Flow.")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }

                Section("1 · Add the keyboard") {
                    if keyboardAdded {
                        Label("Keyboard added", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        step("Make sure Allow Full Access is enabled (for the microphone and network)")
                    } else {
                        step("Open the Settings app")
                        step("Go to General › Keyboard › Keyboards › Add New Keyboard…")
                        step("Choose Scriba")
                        step("Tap Scriba in the list and enable Allow Full Access (needed for the microphone and network)")
                        Button("Open Settings") { openSettings() }
                    }
                }

                Section("2 · Allow the microphone") {
                    if micGranted {
                        Label("Microphone access granted", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    } else {
                        step("Scriba records your voice to transcribe it")
                        Button("Allow microphone") { requestMic() }
                    }
                }

                Section("3 · Use it anywhere") {
                    step("Open any app with a text field")
                    step("Touch and hold the 🌐 globe key, then choose Scriba")
                    step("Tap the 🎙 mic button, speak, then tap again to insert your text")
                }
            }
            .navigationTitle("Scriba")
        }
        .onAppear(perform: refreshState)
        .onChange(of: scenePhase) { _, phase in
            // Re-check when returning from Settings (where the keyboard is added /
            // permissions are toggled).
            if phase == .active { refreshState() }
        }
    }

    private func refreshState() {
        micGranted = AVAudioApplication.shared.recordPermission == .granted
        keyboardAdded = Self.isKeyboardAdded()
    }

    /// Whether the Scriba keyboard has been added in Settings. Uses the standard
    /// `AppleKeyboards` list; if it's unavailable this returns false and the setup
    /// instructions simply stay visible (graceful fallback).
    private static func isKeyboardAdded() -> Bool {
        guard
            let keyboards = UserDefaults.standard.object(forKey: "AppleKeyboards")
                as? [String]
        else { return false }
        return keyboards.contains { $0.contains("ai.scriba.app.keyboard") }
    }

    private func step(_ text: String) -> some View {
        Label(text, systemImage: "circle.fill")
            .labelStyle(BulletLabelStyle())
    }

    private func requestMic() {
        AVAudioApplication.requestRecordPermission { granted in
            DispatchQueue.main.async { micGranted = granted }
        }
    }

    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
}

/// Small bullet style so steps read as a checklist.
private struct BulletLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: "circle.fill")
                .font(.system(size: 5))
                .foregroundStyle(.tertiary)
            configuration.title
        }
    }
}

#Preview {
    EnableKeyboardView()
}
