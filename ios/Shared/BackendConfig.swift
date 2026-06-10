import Foundation

/// Identifiers shared between the container app and the keyboard extension.
enum AppGroup {
    /// App Group used to share settings + the auth token between the container
    /// app and the keyboard extension. Must match both targets' entitlements.
    static let identifier = "group.ai.scriba.shared"

    /// UserDefaults backed by the shared App Group.
    static var defaults: UserDefaults {
        UserDefaults(suiteName: identifier) ?? .standard
    }
}

/// Backend configuration. The base URL is intentionally **not** hardcoded to a
/// production host — it's set by the user in the app's settings (stored in the
/// shared App Group) or via the `SCRIBA_BACKEND_URL` build setting, so forks and
/// self-hosters can point at their own server.
enum BackendConfig {
    private static let baseURLKey = "backendBaseURL"

    /// The default backend URL, overridable in app settings. Replace with your
    /// own server, or the desktop app's `VITE_GRPC_BASE_URL` host.
    static let defaultBaseURL = "http://localhost:3000"

    static var baseURL: URL {
        let stored = AppGroup.defaults.string(forKey: baseURLKey)
        let raw = (stored?.isEmpty == false ? stored : nil)
            ?? Bundle.main.object(forInfoDictionaryKey: "SCRIBA_BACKEND_URL") as? String
            ?? defaultBaseURL
        return URL(string: raw) ?? URL(string: defaultBaseURL)!
    }

    static func setBaseURL(_ value: String) {
        AppGroup.defaults.set(value, forKey: baseURLKey)
    }

    /// The mobile transcription endpoint added to the server for keyboard use.
    static var transcribeURL: URL {
        baseURL.appendingPathComponent("v1/transcribe")
    }
}
