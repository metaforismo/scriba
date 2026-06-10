import Foundation
import Security

/// Stores the backend auth token in the Keychain, shared between the container
/// app and the keyboard extension.
///
/// Sharing is configured via entitlements: both targets list the SAME
/// `keychain-access-groups` entry (`<TeamPrefix>.ai.scriba.shared`) as their
/// first group. We deliberately do NOT pass `kSecAttrAccessGroup` here — the
/// `$(AppIdentifierPrefix)` placeholder is only resolved in entitlements, not in
/// Swift — so the item lands in the app's default (first) access group, which is
/// the shared one. The container app writes the token; the keyboard reads it.
enum TokenStore {
    private static let service = "ai.scriba.auth"
    private static let account = "accessToken"

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    static func save(_ token: String) {
        SecItemDelete(baseQuery as CFDictionary)
        var query = baseQuery
        query[kSecValueData as String] = Data(token.utf8)
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(query as CFDictionary, nil)
    }

    static func load() -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
            let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }

    static var hasToken: Bool { load() != nil }
}
