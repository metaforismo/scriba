import Foundation
import SwiftUI

/// Owns the signed-in state for the container app and shares the resulting token
/// with the keyboard extension via `TokenStore` (shared Keychain).
///
/// NOTE: the real Auth0 login flow (ASWebAuthenticationSession against the
/// server's `/login` route + token exchange) is a follow-up — see ios/README.md.
/// For now `signIn(devToken:)` lets you paste an access token to exercise the
/// end-to-end path during development.
@MainActor
final class AuthManager: ObservableObject {
    @Published private(set) var isSignedIn: Bool = TokenStore.hasToken

    func signIn(devToken: String) {
        let trimmed = devToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        TokenStore.save(trimmed)
        isSignedIn = true
    }

    func signOut() {
        TokenStore.clear()
        isSignedIn = false
    }
}
