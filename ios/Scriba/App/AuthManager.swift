import Foundation
import SwiftUI

/// Owns the signed-in state for the container app and shares the resulting
/// tokens with the keyboard extension via `TokenStore` (shared Keychain).
///
/// Uses the real Auth0 flow when the app is configured (AUTH0_* Info.plist keys);
/// otherwise falls back to a pasted developer token so the end-to-end path can be
/// exercised without an Auth0 tenant.
@MainActor
final class AuthManager: ObservableObject {
    @Published private(set) var isSignedIn: Bool = TokenStore.hasToken
    @Published var errorMessage: String?

    private let authService: AuthService?

    init() {
        if let config = Auth0Config.fromBundle() {
            authService = AuthService(config: config)
        } else {
            authService = nil
        }
    }

    var isAuth0Configured: Bool { authService != nil }

    func signIn() async {
        guard let authService else {
            errorMessage = "Auth0 isn't configured (set AUTH0_* in Info.plist)"
            return
        }
        do {
            try await authService.signIn()
            isSignedIn = true
            errorMessage = nil
        } catch AuthService.AuthError.cancelled {
            // User dismissed the sheet — not an error.
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Keep the shared access token fresh; call on app launch / foreground.
    func refreshIfNeeded() async {
        guard let authService else { return }
        _ = try? await authService.refreshIfNeeded()
        isSignedIn = TokenStore.hasToken
    }

    /// Developer fallback: store a pasted access token directly.
    func signIn(devToken: String) {
        let trimmed = devToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        TokenStore.save(Credentials(accessToken: trimmed, refreshToken: nil, expiresAt: nil))
        isSignedIn = true
    }

    func signOut() {
        TokenStore.clear()
        isSignedIn = false
    }
}
