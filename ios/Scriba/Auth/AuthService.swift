import AuthenticationServices
import Foundation
import UIKit

/// Drives the Auth0 authorization-code-with-PKCE flow via
/// `ASWebAuthenticationSession`, mirroring the desktop app: open Auth0's
/// `/authorize`, receive the code on the `scriba://callback` redirect, exchange
/// it at `/oauth/token`, and persist the resulting `Credentials`. Also refreshes
/// the access token using the stored refresh token.
@MainActor
final class AuthService: NSObject {
    enum AuthError: LocalizedError {
        case cancelled
        case invalidCallback
        case stateMismatch
        case tokenExchangeFailed

        var errorDescription: String? {
            switch self {
            case .cancelled: return "Sign-in was cancelled"
            case .invalidCallback: return "Invalid sign-in response"
            case .stateMismatch: return "Sign-in could not be verified"
            case .tokenExchangeFailed: return "Couldn't complete sign-in"
            }
        }
    }

    private let config: Auth0Config
    private var webAuthSession: ASWebAuthenticationSession?

    init(config: Auth0Config) {
        self.config = config
        super.init()
    }

    /// Runs the interactive sign-in and persists the credentials.
    @discardableResult
    func signIn() async throws -> Credentials {
        let pkce = PKCE()
        let callbackURL = try await startWebAuth(url: buildAuthorizeURL(pkce: pkce))

        let items =
            URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
            .queryItems ?? []
        guard
            let state = items.first(where: { $0.name == "state" })?.value,
            state == pkce.state
        else { throw AuthError.stateMismatch }
        guard let code = items.first(where: { $0.name == "code" })?.value else {
            throw AuthError.invalidCallback
        }

        let credentials = try await exchangeCode(code, verifier: pkce.verifier)
        TokenStore.save(credentials)
        return credentials
    }

    /// Refreshes the access token if it's expiring soon. Returns the current
    /// credentials, or nil if there's nothing to refresh.
    @discardableResult
    func refreshIfNeeded() async throws -> Credentials? {
        guard let current = TokenStore.load(), current.refreshToken != nil else {
            return nil
        }
        guard current.expiresSoon() else { return current }
        return await TokenRefresher.refresh()
    }

    // MARK: - Authorize URL

    private func buildAuthorizeURL(pkce: PKCE) -> URL {
        var comps = URLComponents(
            url: config.authorizeURL, resolvingAgainstBaseURL: false)!
        var items = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: config.clientId),
            URLQueryItem(name: "redirect_uri", value: config.redirectURI),
            URLQueryItem(name: "scope", value: config.scope),
            URLQueryItem(name: "state", value: pkce.state),
            URLQueryItem(name: "code_challenge", value: pkce.challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
        ]
        if !config.audience.isEmpty {
            items.append(URLQueryItem(name: "audience", value: config.audience))
        }
        comps.queryItems = items
        return comps.url!
    }

    // MARK: - Web auth

    private func startWebAuth(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url, callbackURLScheme: config.callbackScheme
            ) { callbackURL, error in
                if let error {
                    let cancelled =
                        (error as? ASWebAuthenticationSessionError)?.code
                        == .canceledLogin
                    continuation.resume(
                        throwing: cancelled ? AuthError.cancelled : error)
                    return
                }
                guard let callbackURL else {
                    continuation.resume(throwing: AuthError.invalidCallback)
                    return
                }
                continuation.resume(returning: callbackURL)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            webAuthSession = session
            if !session.start() {
                continuation.resume(throwing: AuthError.cancelled)
            }
        }
    }

    // MARK: - Token endpoint

    private func exchangeCode(_ code: String, verifier: String) async throws
        -> Credentials
    {
        var params = [
            "grant_type": "authorization_code",
            "client_id": config.clientId,
            "code": code,
            "redirect_uri": config.redirectURI,
            "code_verifier": verifier,
        ]
        if !config.audience.isEmpty { params["audience"] = config.audience }
        do {
            return try await Auth0TokenEndpoint.post(params, config: config)
        } catch {
            throw AuthError.tokenExchangeFailed
        }
    }
}

extension AuthService: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession)
        -> ASPresentationAnchor
    {
        let scene = UIApplication.shared.connectedScenes
            .first { $0.activationState == .foregroundActive } as? UIWindowScene
        return scene?.keyWindow ?? ASPresentationAnchor()
    }
}
