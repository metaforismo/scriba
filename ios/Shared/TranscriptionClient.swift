import Foundation

/// Errors surfaced to the UI from a transcription request.
enum TranscriptionError: LocalizedError {
    case notSignedIn
    case noSpeech
    case server(code: String?)
    case network(Error)

    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "Please sign in"
        case .noSpeech: return "No speech detected"
        case .server: return "Transcription failed"
        case .network: return "Network error"
        }
    }
}

/// Sends a recorded utterance to the backend's `/v1/transcribe` endpoint and
/// returns the transcript. Keyboard extensions can't comfortably hold a bidi
/// gRPC stream (tight memory/lifecycle limits), so this records a short clip and
/// POSTs it as base64.
struct TranscriptionClient {
    /// - Parameters:
    ///   - audio: WAV (16 kHz, mono, 16-bit PCM) audio data.
    ///   - cleanupLevel: forwarded as the `transcript-cleanup-level` header.
    func transcribe(
        audio: Data,
        fileType: String = "wav",
        cleanupLevel: CleanupLevel = .current
    ) async throws -> String {
        try await transcribe(
            audio: audio, fileType: fileType, cleanupLevel: cleanupLevel,
            allowRefresh: true)
    }

    private func transcribe(
        audio: Data,
        fileType: String,
        cleanupLevel: CleanupLevel,
        allowRefresh: Bool
    ) async throws -> String {
        // Read the token fresh each attempt so a refresh-then-retry uses the new one.
        guard let token = TokenStore.accessToken, !token.isEmpty else {
            throw TranscriptionError.notSignedIn
        }

        var request = URLRequest(url: BackendConfig.transcribeURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(
            cleanupLevel.rawValue, forHTTPHeaderField: "transcript-cleanup-level")
        request.setValue(
            TranscriptionLanguage.current,
            forHTTPHeaderField: "transcription-language")
        request.timeoutInterval = 30

        let body: [String: Any] = [
            "audio": audio.base64EncodedString(),
            "fileType": fileType,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw TranscriptionError.network(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw TranscriptionError.server(code: nil)
        }

        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]

        switch http.statusCode {
        case 200:
            if let transcript = json?["transcript"] as? String { return transcript }
            throw TranscriptionError.server(code: nil)
        case 401:
            // Token likely expired — refresh once and retry before giving up.
            if allowRefresh, await TokenRefresher.refresh() != nil {
                return try await transcribe(
                    audio: audio, fileType: fileType, cleanupLevel: cleanupLevel,
                    allowRefresh: false)
            }
            throw TranscriptionError.notSignedIn
        case 422 where (json?["code"] as? String) == "CLIENT_NO_SPEECH_DETECTED":
            throw TranscriptionError.noSpeech
        default:
            throw TranscriptionError.server(code: json?["code"] as? String)
        }
    }
}
