import XCTest

final class FormURLEncodingTests: XCTestCase {
    func testEscapesBase64TokenCharacters() {
        // Refresh tokens/auth codes are base64 — '+', '/', '=' MUST be encoded.
        XCTAssertEqual(FormURLEncoding.escape("aB/c+d=ef"), "aB%2Fc%2Bd%3Def")
    }

    func testKeepsUnreservedCharacters() {
        XCTAssertEqual(FormURLEncoding.escape("Aa0-._~"), "Aa0-._~")
    }

    func testEscapesSpacesAndAmpersands() {
        XCTAssertEqual(FormURLEncoding.escape("a b&c"), "a%20b%26c")
    }

    func testEncodesParamsAsKeyValuePairs() {
        let body = FormURLEncoding.encode([
            "grant_type": "refresh_token",
            "refresh_token": "tok/with+special=chars",
        ])
        let pairs = Set(body.split(separator: "&").map(String.init))
        XCTAssertTrue(pairs.contains("grant_type=refresh_token"))
        XCTAssertTrue(
            pairs.contains("refresh_token=tok%2Fwith%2Bspecial%3Dchars"))
    }
}
