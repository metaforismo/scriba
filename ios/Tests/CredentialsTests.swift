import XCTest

final class CredentialsTests: XCTestCase {
    private func creds(expiresAt: Date?) -> Credentials {
        Credentials(accessToken: "a", refreshToken: "r", expiresAt: expiresAt)
    }

    // MARK: isExpired

    func testIsExpired() {
        XCTAssertTrue(creds(expiresAt: Date().addingTimeInterval(-10)).isExpired)
        XCTAssertFalse(creds(expiresAt: Date().addingTimeInterval(60)).isExpired)
        // No expiry known -> treat as not expired.
        XCTAssertFalse(creds(expiresAt: nil).isExpired)
    }

    // MARK: expiresSoon

    func testExpiresSoonWithinDefaultWindow() {
        // Inside the 2-min window -> refresh proactively.
        XCTAssertTrue(creds(expiresAt: Date().addingTimeInterval(60)).expiresSoon())
        // Comfortably ahead -> not soon.
        XCTAssertFalse(creds(expiresAt: Date().addingTimeInterval(300)).expiresSoon())
        // Already expired -> definitely soon.
        XCTAssertTrue(creds(expiresAt: Date().addingTimeInterval(-10)).expiresSoon())
        XCTAssertFalse(creds(expiresAt: nil).expiresSoon())
    }

    func testExpiresSoonHonorsCustomWindow() {
        let c = creds(expiresAt: Date().addingTimeInterval(200))
        XCTAssertFalse(c.expiresSoon(within: 120))
        XCTAssertTrue(c.expiresSoon(within: 300))
    }

    // MARK: Codable (stored as JSON in the Keychain)

    func testCodableRoundTrip() throws {
        let original = Credentials(
            accessToken: "tok", refreshToken: "ref",
            expiresAt: Date(timeIntervalSince1970: 1_700_000_000))
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Credentials.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func testCodableRoundTripWithNilOptionals() throws {
        let original = Credentials(
            accessToken: "tok", refreshToken: nil, expiresAt: nil)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(Credentials.self, from: data)
        XCTAssertEqual(decoded, original)
    }
}
