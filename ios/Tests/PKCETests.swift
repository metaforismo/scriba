import XCTest

final class PKCETests: XCTestCase {
    /// RFC 7636 Appendix B test vector for the S256 code challenge.
    func testChallengeMatchesRFC7636Vector() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        let expected = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        XCTAssertEqual(PKCE.challenge(for: verifier), expected)
    }

    func testChallengeIsBase64URLWithoutPadding() {
        let challenge = PKCE.challenge(for: "any-verifier-value-123")
        XCTAssertFalse(challenge.contains("+"))
        XCTAssertFalse(challenge.contains("/"))
        XCTAssertFalse(challenge.contains("="))
    }

    func testBase64URLEncodingReplacesUnsafeCharacters() {
        // 0xFB 0xFF -> base64 "+/8=" -> base64url "-_8" (no padding).
        let data = Data([0xFB, 0xFF])
        XCTAssertEqual(data.base64URLEncodedString(), "-_8")
    }

    func testGeneratedPairIsInternallyConsistent() {
        let pkce = PKCE()
        XCTAssertFalse(pkce.verifier.isEmpty)
        XCTAssertFalse(pkce.state.isEmpty)
        XCTAssertEqual(pkce.challenge, PKCE.challenge(for: pkce.verifier))
    }
}
