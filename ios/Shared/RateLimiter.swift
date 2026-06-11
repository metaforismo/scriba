import Foundation

/// Pure rate limiter: caps how often a periodic event fires (e.g. throttling
/// audio-level publishes to the UI). Not thread-safe — use from one queue.
struct RateLimiter {
    private let interval: TimeInterval
    private var last: TimeInterval = -.infinity

    init(interval: TimeInterval) {
        self.interval = interval
    }

    /// Returns true (and arms the next window) if at least `interval` seconds
    /// have passed since the last accepted fire.
    mutating func shouldFire(at now: TimeInterval) -> Bool {
        guard now - last >= interval else { return false }
        last = now
        return true
    }
}
