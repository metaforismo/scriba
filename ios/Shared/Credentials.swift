import Foundation

/// The tokens needed to talk to the backend, shared (via the Keychain) between
/// the container app and the keyboard extension.
struct Credentials: Codable, Equatable {
    var accessToken: String
    var refreshToken: String?
    /// Absolute expiry of the access token, if known.
    var expiresAt: Date?

    var isExpired: Bool {
        guard let expiresAt else { return false }
        return Date() >= expiresAt
    }

    /// True when the access token expires within `window` (default 2 min), so the
    /// app can refresh proactively.
    func expiresSoon(within window: TimeInterval = 120) -> Bool {
        guard let expiresAt else { return false }
        return Date().addingTimeInterval(window) >= expiresAt
    }
}
