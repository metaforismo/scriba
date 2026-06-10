import Foundation
import SwiftUI

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

    /// Called with the final transcript so the host can insert it.
    var onTranscript: ((String) -> Void)?

    var isBusy: Bool {
        switch state {
        case .recording, .transcribing: return true
        default: return false
        }
    }

    func toggle() {
        switch state {
        case .idle, .error:
            Task { await startRecording() }
        case .recording:
            Task { await finishRecording() }
        case .transcribing:
            break // ignore taps while transcribing
        }
    }

    private func startRecording() async {
        do {
            try await recorder.start()
            state = .recording
        } catch AudioRecorder.RecorderError.microphoneDenied {
            state = .error("Enable microphone access in Settings")
        } catch {
            state = .error("Couldn't start recording")
        }
    }

    private func finishRecording() async {
        let audio = recorder.stop()
        guard !audio.isEmpty else {
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
            state = .error(error.errorDescription ?? "Transcription failed")
        } catch {
            state = .error("Transcription failed")
        }
    }

    /// Resets a transient error back to idle (e.g. after showing it briefly).
    func clearError() {
        if case .error = state { state = .idle }
    }
}
