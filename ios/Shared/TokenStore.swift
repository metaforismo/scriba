import Foundation
import Security

/// Stores the backend `Credentials` (access + refresh tokens) in the Keychain,
/// shared between the container app and the keyboard extension.
///
/// Sharing is configured via entitlements: both targets list the SAME
/// `keychain-access-groups` entry (`<TeamPrefix>.ai.scriba.shared`) as their
/// first group. We deliberately do NOT pass `kSecAttrAccessGroup` here — the
/// `$(AppIdentifierPrefix)` placeholder is only resolved in entitlements, not in
/// Swift — so the item lands in the app's default (first) access group, which is
/// the shared one. The container app writes the tokens; the keyboard reads them.
enum TokenStore {
    private static let service = "ai.scriba.auth"
    private static let account = "credentials"

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    static func save(_ credentials: Credentials) {
        guard let data = try? JSONEncoder().encode(credentials) else { return }
        SecItemDelete(baseQuery as CFDictionary)
        var query = baseQuery
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(query as CFDictionary, nil)
    }

    static func load() -> Credentials? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
            let data = result as? Data
        else { return nil }
        return try? JSONDecoder().decode(Credentials.self, from: data)
    }

    /// Convenience for callers that only need the bearer token (e.g. the keyboard).
    static var accessToken: String? { load()?.accessToken }

    static func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }

    static var hasToken: Bool { accessToken?.isEmpty == false }
}
