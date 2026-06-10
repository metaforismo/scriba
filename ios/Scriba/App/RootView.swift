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
    }
}

#Preview {
    RootView()
}
