import Foundation

/// `application/x-www-form-urlencoded` body building for the Auth0 token calls.
/// Pure + dependency-free so it's unit-testable — important because refresh
/// tokens and auth codes are base64 and routinely contain `+ / =`, which MUST be
/// percent-encoded or the token is corrupted in transit.
enum FormURLEncoding {
    static func encode(_ params: [String: String]) -> String {
        params
            .map { key, value in "\(escape(key))=\(escape(value))" }
            .joined(separator: "&")
    }

    static func escape(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .auth0FormAllowed)
            ?? value
    }
}

extension CharacterSet {
    /// Unreserved characters for form-encoded values — everything else (incl.
    /// `+ / =`) is percent-encoded.
    static let auth0FormAllowed: CharacterSet = {
        var set = CharacterSet.alphanumerics
        set.insert(charactersIn: "-._~")
        return set
    }()
}
