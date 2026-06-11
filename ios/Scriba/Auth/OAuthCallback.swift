import Foundation

/// Parsing + validation of the OAuth authorization-code redirect, split out of
/// AuthService so the security-critical bits (CSRF `state` check, `code`
/// extraction) are pure and unit-testable.
enum OAuthCallback {
    enum CallbackError: Error, Equatable {
        /// The returned `state` is missing or doesn't match the one we sent —
        /// treated as a possible CSRF/forgery and rejected.
        case stateMismatch
        /// No authorization `code` in the callback.
        case invalidCallback
    }

    /// Validates the callback's `state` against `expectedState` and returns the
    /// authorization `code`.
    static func code(from url: URL, expectedState: String) throws -> String {
        let items =
            URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems ?? []
        guard
            let state = items.first(where: { $0.name == "state" })?.value,
            state == expectedState
        else { throw CallbackError.stateMismatch }
        guard
            let code = items.first(where: { $0.name == "code" })?.value,
            !code.isEmpty
        else { throw CallbackError.invalidCallback }
        return code
    }
}
