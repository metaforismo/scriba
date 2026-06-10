import Foundation

/// Auth0 settings for the iOS app. Read from Info.plist keys so they aren't
/// hardcoded, and so forks can use their own tenant. Register a **Native**
/// application in Auth0 (separate from the desktop app) and add
/// `scriba://callback` to its Allowed Callback URLs.
///
/// Info.plist keys (see Scriba/Resources/Info.plist):
///   AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_AUDIENCE
struct Auth0Config {
    let domain: String
    let clientId: String
    let audience: String

    /// Custom-scheme redirect. The scheme is also declared in CFBundleURLTypes.
    let redirectURI = "scriba://callback"
    let callbackScheme = "scriba"
    let scope = "openid profile email offline_access"

    static func fromBundle(_ bundle: Bundle = .main) -> Auth0Config? {
        func value(_ key: String) -> String? {
            (bundle.object(forInfoDictionaryKey: key) as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard
            let domain = value("AUTH0_DOMAIN"), !domain.isEmpty,
            let clientId = value("AUTH0_CLIENT_ID"), !clientId.isEmpty
        else { return nil }
        return Auth0Config(
            domain: domain,
            clientId: clientId,
            audience: value("AUTH0_AUDIENCE") ?? ""
        )
    }

    var authorizeURL: URL { URL(string: "https://\(domain)/authorize")! }
    var tokenURL: URL { URL(string: "https://\(domain)/oauth/token")! }
}
