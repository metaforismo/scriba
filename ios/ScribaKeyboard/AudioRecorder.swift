import AVFoundation
import Foundation

/// Captures microphone audio and produces 16 kHz / mono / 16-bit PCM WAV data,
/// matching what the backend expects. Publishes a normalized input level so the
/// keyboard can render a live waveform.
///
/// Works inside the keyboard extension only when the container app has been
/// granted microphone permission AND "Allow Full Access" is enabled.
///
/// Not `@MainActor`: the audio tap fires on a real-time thread. The converter is
/// configured before the tap is installed and only read from the tap (serial);
/// the accumulated samples are guarded by a lock; published UI state is updated
/// on the main queue.
final class AudioRecorder: ObservableObject {
    @Published private(set) var isRecording = false
    @Published private(set) var level: Float = 0

    /// Called (on the main queue) when the capture is cut short by the system —
    /// an interruption (phone call, another app) or a route change like AirPods
    /// being removed. The owner should finalize so the audio captured so far
    /// isn't silently lost (a common long-form/AirPods complaint).
    var onInterrupted: (() -> Void)?

    /// Called from the audio tap with each raw input buffer, so a live transcriber
    /// can stream it (only one tap is allowed per node, so we fan out here).
    var onBuffer: ((AVAudioPCMBuffer) -> Void)?

    private let engine = AVAudioEngine()
    private let targetSampleRate: Double = 16_000
    private var converter: AVAudioConverter?
    private let lock = NSLock()
    private var pcmSamples = [Int16]()
    private var sessionObservers: [NSObjectProtocol] = []
    /// Caps level publishes at ~15 Hz; touched only from the serial tap callback.
    private var levelLimiter = RateLimiter(interval: 1.0 / 15.0)

    enum RecorderError: Error {
        case microphoneDenied
        case engineFailed(Error)
    }

    /// Requests permission (no-op if already granted) and starts capture.
    func start() async throws {
        let granted = await Self.requestPermission()
        guard granted else { throw RecorderError.microphoneDenied }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
        try session.setActive(true, options: [])
        observeInterruptions(session: session)

        lock.withLock { pcmSamples.removeAll(keepingCapacity: true) }

        let input = engine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        guard
            let outputFormat = AVAudioFormat(
                commonFormat: .pcmFormatInt16,
                sampleRate: targetSampleRate,
                channels: 1,
                interleaved: true
            )
        else { throw RecorderError.engineFailed(NSError(domain: "audio", code: -1)) }
        converter = AVAudioConverter(from: inputFormat, to: outputFormat)

        input.installTap(onBus: 0, bufferSize: 2048, format: inputFormat) {
            [weak self] buffer, _ in
            self?.onBuffer?(buffer)
            self?.process(buffer: buffer, outputFormat: outputFormat)
        }

        engine.prepare()
        do {
            try engine.start()
        } catch {
            // Tear down everything we set up so a retry starts clean (otherwise
            // the observers leak and the session stays active).
            input.removeTap(onBus: 0)
            removeSessionObservers()
            try? session.setActive(false, options: [.notifyOthersOnDeactivation])
            throw RecorderError.engineFailed(error)
        }
        publish(isRecording: true, level: 0)
    }

    /// Stops capture and returns the recorded utterance as WAV data.
    func stop() -> Data {
        removeSessionObservers()
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(
            false, options: [.notifyOthersOnDeactivation])
        publish(isRecording: false, level: 0)
        // Take the samples and clear them, so a second stop (e.g. a racing
        // interruption) can't return the same audio twice.
        let samples = lock.withLock {
            let taken = pcmSamples
            pcmSamples.removeAll(keepingCapacity: true)
            return taken
        }
        return WAVEncoder.encode(samples: samples, sampleRate: Int(targetSampleRate))
    }

    // MARK: - Interruptions / route changes

    private func observeInterruptions(session: AVAudioSession) {
        let center = NotificationCenter.default
        let notify: (Notification) -> Void = { [weak self] _ in
            self?.onInterrupted?()
        }
        sessionObservers.append(
            center.addObserver(
                forName: AVAudioSession.interruptionNotification,
                object: session, queue: .main
            ) { note in
                guard
                    let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey]
                        as? UInt,
                    AVAudioSession.InterruptionType(rawValue: raw) == .began
                else { return }
                notify(note)
            })
        sessionObservers.append(
            center.addObserver(
                forName: AVAudioSession.routeChangeNotification,
                object: session, queue: .main
            ) { note in
                // The previous input (e.g. AirPods) went away mid-recording.
                guard
                    let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey]
                        as? UInt,
                    AVAudioSession.RouteChangeReason(rawValue: raw)
                        == .oldDeviceUnavailable
                else { return }
                notify(note)
            })
    }

    private func removeSessionObservers() {
        sessionObservers.forEach(NotificationCenter.default.removeObserver)
        sessionObservers.removeAll()
    }

    // MARK: - Conversion (audio thread)

    private func process(buffer: AVAudioPCMBuffer, outputFormat: AVAudioFormat) {
        guard let converter else { return }
        let ratio = outputFormat.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1
        guard
            let outBuffer = AVAudioPCMBuffer(
                pcmFormat: outputFormat, frameCapacity: capacity)
        else { return }

        var consumed = false
        var error: NSError?
        converter.convert(to: outBuffer, error: &error) { _, status in
            if consumed {
                status.pointee = .noDataNow
                return nil
            }
            consumed = true
            status.pointee = .haveData
            return buffer
        }
        if error != nil { return }

        guard let channel = outBuffer.int16ChannelData else { return }
        let frames = Int(outBuffer.frameLength)
        guard frames > 0 else { return }
        var samples = [Int16](repeating: 0, count: frames)
        for i in 0..<frames { samples[i] = channel[0][i] }

        lock.withLock { pcmSamples.append(contentsOf: samples) }

        // Publish an RMS level (0...1) for the waveform, throttled to ~15 Hz so
        // the UI isn't re-evaluated for every audio buffer (~25-50/sec). Only
        // accessed from the (serial) tap callback.
        guard levelLimiter.shouldFire(at: CFAbsoluteTimeGetCurrent()) else { return }
        var sumOfSquares = 0.0
        for sample in samples {
            let x = Double(sample) / 32767.0
            sumOfSquares += x * x
        }
        let rms = sqrt(sumOfSquares / Double(frames))
        let normalized = Float(min(1.0, rms * 4))
        publish(level: normalized)
    }

    // MARK: - Helpers

    private func publish(isRecording: Bool? = nil, level: Float? = nil) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if let isRecording { self.isRecording = isRecording }
            if let level { self.level = level }
        }
    }

    private static func requestPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }
}
