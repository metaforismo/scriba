import XCTest

final class OAuthCallbackTests: XCTestCase {
    private func url(_ string: String) -> URL { URL(string: string)! }

    func testReturnsCodeWhenStateMatches() throws {
        let code = try OAuthCallback.code(
            from: url("scriba://callback?code=abc123&state=xyz"),
            expectedState: "xyz")
        XCTAssertEqual(code, "abc123")
    }

    func testRejectsMismatchedState() {
        XCTAssertThrowsError(
            try OAuthCallback.code(
                from: url("scriba://callback?code=abc&state=evil"),
                expectedState: "xyz")
        ) { XCTAssertEqual($0 as? OAuthCallback.CallbackError, .stateMismatch) }
    }

    func testRejectsMissingState() {
        XCTAssertThrowsError(
            try OAuthCallback.code(
                from: url("scriba://callback?code=abc"),
                expectedState: "xyz")
        ) { XCTAssertEqual($0 as? OAuthCallback.CallbackError, .stateMismatch) }
    }

    func testRejectsMissingOrEmptyCode() {
        XCTAssertThrowsError(
            try OAuthCallback.code(
                from: url("scriba://callback?state=xyz"),
                expectedState: "xyz")
        ) { XCTAssertEqual($0 as? OAuthCallback.CallbackError, .invalidCallback) }

        XCTAssertThrowsError(
            try OAuthCallback.code(
                from: url("scriba://callback?code=&state=xyz"),
                expectedState: "xyz")
        ) { XCTAssertEqual($0 as? OAuthCallback.CallbackError, .invalidCallback) }
    }
}
