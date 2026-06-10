import Foundation

/// Calls Auth0's `/oauth/token` endpoint and parses the result into `Credentials`.
/// Shared by the interactive sign-in (code exchange) and the non-interactive
/// refresh so the two can't diverge.
enum Auth0TokenEndpoint {
    struct TokenError: Error {}

    static func post(_ params: [String: String], config: Auth0Config) async throws
        -> Credentials
    {
        var request = URLRequest(url: config.tokenURL)
        request.httpMethod = "POST"
        request.setValue(
            "application/x-www-form-urlencoded",
            forHTTPHeaderField: "Content-Type")
        request.httpBody =
            params
            .map { key, value in
                let encoded =
                    value.addingPercentEncoding(
                        withAllowedCharacters: .auth0FormAllowed) ?? value
                return "\(key)=\(encoded)"
            }
            .joined(separator: "&")
            .data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard
            let http = response as? HTTPURLResponse,
            (200..<300).contains(http.statusCode),
            let json = try? JSONSerialization.jsonObject(with: data)
                as? [String: Any],
            let accessToken = json["access_token"] as? String
        else { throw TokenError() }

        let expiresAt = (json["expires_in"] as? Double)
            .map { Date().addingTimeInterval($0) }
        return Credentials(
            accessToken: accessToken,
            refreshToken: json["refresh_token"] as? String,
            expiresAt: expiresAt
        )
    }
}

/// Non-interactive access-token refresh, usable from **both** the container app
/// and the keyboard extension (so the keyboard can self-heal a 401 instead of
/// forcing the user back into the app). Best-effort: returns nil if there's no
/// refresh token / Auth0 config, or the refresh fails.
enum TokenRefresher {
    @discardableResult
    static func refresh() async -> Credentials? {
        guard
            let config = Auth0Config.fromBundle(),
            let current = TokenStore.load(),
            let refreshToken = current.refreshToken
        else { return nil }

        var params = [
            "grant_type": "refresh_token",
            "client_id": config.clientId,
            "refresh_token": refreshToken,
        ]
        if !config.audience.isEmpty { params["audience"] = config.audience }

        guard var refreshed = try? await Auth0TokenEndpoint.post(params, config: config)
        else { return nil }

        // Auth0 may omit a new refresh token; keep the existing one.
        if refreshed.refreshToken == nil { refreshed.refreshToken = refreshToken }
        TokenStore.save(refreshed)
        return refreshed
    }
}

extension CharacterSet {
    /// Unreserved characters for `application/x-www-form-urlencoded` values —
    /// everything else (incl. `+ / =`) is percent-encoded.
    static let auth0FormAllowed: CharacterSet = {
        var set = CharacterSet.alphanumerics
        set.insert(charactersIn: "-._~")
        return set
    }()
}
