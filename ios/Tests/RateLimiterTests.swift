import XCTest

final class RateLimiterTests: XCTestCase {
    func testFirstCallFires() {
        var limiter = RateLimiter(interval: 1.0 / 15.0)
        XCTAssertTrue(limiter.shouldFire(at: 0))
    }

    func testCallsWithinIntervalAreSuppressed() {
        var limiter = RateLimiter(interval: 0.1)
        XCTAssertTrue(limiter.shouldFire(at: 0))
        XCTAssertFalse(limiter.shouldFire(at: 0.05))
        XCTAssertFalse(limiter.shouldFire(at: 0.099))
    }

    func testFiresAgainAfterInterval() {
        var limiter = RateLimiter(interval: 0.1)
        XCTAssertTrue(limiter.shouldFire(at: 0))
        XCTAssertTrue(limiter.shouldFire(at: 0.1))
        XCTAssertFalse(limiter.shouldFire(at: 0.15))
        XCTAssertTrue(limiter.shouldFire(at: 0.25))
    }

    func testSuppressedCallsDoNotResetTheWindow() {
        var limiter = RateLimiter(interval: 0.1)
        XCTAssertTrue(limiter.shouldFire(at: 0))
        // Hammering it during the window must not push the next fire back.
        XCTAssertFalse(limiter.shouldFire(at: 0.03))
        XCTAssertFalse(limiter.shouldFire(at: 0.06))
        XCTAssertFalse(limiter.shouldFire(at: 0.09))
        XCTAssertTrue(limiter.shouldFire(at: 0.1))
    }

    func testCapsBurstToExpectedRate() {
        // 50 buffer callbacks over one second → roughly 15 publishes at 15 Hz
        // (a bit fewer in practice: 20 ms callbacks quantize fires to every
        // 80 ms, i.e. 13), and never the full 50.
        var limiter = RateLimiter(interval: 1.0 / 15.0)
        let fires = (0..<50).filter { limiter.shouldFire(at: Double($0) / 50.0) }
        XCTAssertLessThanOrEqual(fires.count, 16)
        XCTAssertGreaterThanOrEqual(fires.count, 12)
    }
}
