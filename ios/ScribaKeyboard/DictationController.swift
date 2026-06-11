import Foundation
import SwiftUI
import UIKit

/// Orchestrates a single dictation: record → transcribe → hand the text back to
/// the keyboard for insertion. Owns the recorder and exposes a simple state
/// machine the keyboard UI binds to.
@MainActor
final class DictationController: ObservableObject {
    enum State: Equatable {
        case idle
        case recording
        case transcribing
        case error(String)
    }

    @Published private(set) var state: State = .idle
    let recorder = AudioRecorder()
    /// Live, on-device interim transcription for a Wispr-style streaming preview.
    /// The accurate final transcript still comes from the server.
    let live = LiveTranscriber()

    /// Called with the final transcript so the host can insert it.
    var onTranscript: ((String) -> Void)?

    // Tactile feedback, à la Wispr Flow (works because the keyboard requires Full
    // Access). Impact on start/stop taps; an error notification when a dictation
    // fails.
    private let impact = UIImpactFeedbackGenerator(style: .medium)
    private let notify = UINotificationFeedbackGenerator()

    // Guards against a double-start: `state` only flips to `.recording` after the
    // async `recorder.start()`, so a second quick tap would otherwise also start
    // and install a second audio tap (an uncatchable crash).
    private var isStarting = false

    init() {
        // If the system cuts the recording short (call, another app, AirPods
        // removed), finalize what we captured rather than losing it.
        recorder.onInterrupted = { [weak self] in
            Task { @MainActor in self?.handleInterruption() }
        }
        // Fan the recorder's raw audio out to the live transcriber. Capture the
        // transcriber instance (not self) so this runs off the audio thread
        // without touching the @MainActor controller.
        recorder.onBuffer = { [live] buffer in live.append(buffer) }
        LiveTranscriber.requestAuthorization()
    }

    private func handleInterruption() {
        guard state == .recording else { return }
        Task { await finishRecording() }
    }

    private func setError(_ message: String) {
        notify.notificationOccurred(.error)
        state = .error(message)
    }

    var isBusy: Bool {
        switch state {
        case .recording, .transcribing: return true
        default: return false
        }
    }

    func toggle() {
        switch state {
        case .idle, .error:
            impact.impactOccurred()
            Task { await startRecording() }
        case .recording:
            impact.impactOccurred()
            Task { await finishRecording() }
        case .transcribing:
            break // ignore taps while transcribing
        }
    }

    private func startRecording() async {
        // Ignore a second start that races the first (state is still .idle until
        // the await below completes).
        if isStarting || state == .recording { return }
        isStarting = true
        defer { isStarting = false }
        do {
            try await recorder.start()
            live.start() // live preview; no-op if speech permission isn't granted
            state = .recording
        } catch AudioRecorder.RecorderError.microphoneDenied {
            setError("Enable microphone access in Settings")
        } catch {
            setError("Couldn't start recording")
        }
    }

    private func finishRecording() async {
        live.stop()
        let audio = recorder.stop()
        // A header-only WAV (no captured samples) isn't worth a round-trip — it'd
        // just come back as "no speech". Treat it as a silent no-op.
        guard audio.count > WAVEncoder.headerSize else {
            state = .idle
            return
        }
        state = .transcribing
        do {
            let transcript = try await TranscriptionClient().transcribe(audio: audio)
            let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { onTranscript?(transcript) }
            state = .idle
        } catch let error as TranscriptionError {
            setError(error.errorDescription ?? "Transcription failed")
        } catch {
            setError("Transcription failed")
        }
    }

    /// Resets a transient error back to idle (e.g. after showing it briefly).
    func clearError() {
        if case .error = state { state = .idle }
    }
}
