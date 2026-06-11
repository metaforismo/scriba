import CryptoKit
import Foundation
import Security

/// A PKCE pair (RFC 7636) plus a random `state` for an OAuth authorization-code
/// flow.
struct PKCE {
    let verifier: String
    let challenge: String
    let state: String

    init() {
        verifier = Self.randomURLSafe(byteCount: 64)
        state = Self.randomURLSafe(byteCount: 32)
        challenge = Self.challenge(for: verifier)
    }

    /// The S256 code challenge for a verifier: base64url(SHA256(verifier)), per
    /// RFC 7636 §4.2. Pure, so it's verifiable against the spec's test vector.
    static func challenge(for verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest).base64URLEncodedString()
    }

    private static func randomURLSafe(byteCount: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        _ = SecRandomCopyBytes(kSecRandomDefault, byteCount, &bytes)
        return Data(bytes).base64URLEncodedString()
    }
}

extension Data {
    /// base64url encoding without padding (RFC 4648 §5).
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
