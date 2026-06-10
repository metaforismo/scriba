import SwiftUI

struct RootView: View {
    @StateObject private var auth = AuthManager()

    var body: some View {
        TabView {
            EnableKeyboardView()
                .tabItem { Label("Setup", systemImage: "keyboard") }

            SettingsView(auth: auth)
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .task {
            // Keep the shared access token fresh for the keyboard extension.
            await auth.refreshIfNeeded()
        }
    }
}

#Preview {
    RootView()
}
