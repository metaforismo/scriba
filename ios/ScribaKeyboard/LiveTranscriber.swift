import AVFoundation
import Foundation
import Speech

/// Live, on-device interim transcription (à la Wispr Flow's streaming feel) using
/// Apple's Speech framework. This is a *preview only* — it shows words as they're
/// spoken; the accurate final transcript still comes from the server. So if
/// speech permission is denied or unavailable, dictation degrades gracefully to
/// the server path with no live preview.
///
/// Not `@MainActor`: audio buffers are appended from the recorder's real-time
/// tap. The request is guarded by a lock; the published `interim` is updated on
/// the main queue.
final class LiveTranscriber: ObservableObject {
    @Published private(set) var interim = ""

    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let lock = NSLock()

    /// Asks for speech-recognition permission if it hasn't been decided yet.
    static func requestAuthorization() {
        guard SFSpeechRecognizer.authorizationStatus() == .notDetermined else {
            return
        }
        SFSpeechRecognizer.requestAuthorization { _ in }
    }

    /// Begins a live recognition session. No-op (server path still works) if
    /// permission isn't granted or a recognizer isn't available.
    func start() {
        // Clear any leftover preview first, so an unavailable recognizer (early
        // return below) can't leave a previous session's words on screen.
        publish("")
        guard SFSpeechRecognizer.authorizationStatus() == .authorized,
            let recognizer = SFSpeechRecognizer(locale: Self.locale()),
            recognizer.isAvailable
        else { return }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        // Keep the live preview on-device (private, no network) when supported.
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        lock.withLock { self.request = request }

        task = recognizer.recognitionTask(with: request) { [weak self] result, _ in
            guard let self,
                let text = result?.bestTranscription.formattedString,
                // A late result can arrive after `stop()` (or after a new session
                // started); only the current request may publish, so a stale one
                // can't resurrect old interim text.
                self.lock.withLock({ self.request === request })
            else { return }
            self.publish(text)
        }
    }

    /// Feed an audio buffer from the recorder's tap.
    func append(_ buffer: AVAudioPCMBuffer) {
        lock.withLock { request?.append(buffer) }
    }

    func stop() {
        lock.withLock {
            request?.endAudio()
            request = nil
        }
        task?.cancel()
        task = nil
        publish("")
    }

    private func publish(_ text: String) {
        DispatchQueue.main.async { [weak self] in self?.interim = text }
    }

    /// Recognize in the user's chosen language, or the device locale for 'auto'.
    private static func locale() -> Locale {
        let code = TranscriptionLanguage.current
        return code == "auto" ? Locale.current : Locale(identifier: code)
    }
}
