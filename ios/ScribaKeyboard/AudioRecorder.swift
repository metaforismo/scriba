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

    private let engine = AVAudioEngine()
    private let targetSampleRate: Double = 16_000
    private var converter: AVAudioConverter?
    private let lock = NSLock()
    private var pcmSamples = [Int16]()

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
            self?.process(buffer: buffer, outputFormat: outputFormat)
        }

        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            throw RecorderError.engineFailed(error)
        }
        publish(isRecording: true, level: 0)
    }

    /// Stops capture and returns the recorded utterance as WAV data.
    func stop() -> Data {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(
            false, options: [.notifyOthersOnDeactivation])
        publish(isRecording: false, level: 0)
        let samples = lock.withLock { pcmSamples }
        return Self.wav(from: samples, sampleRate: Int(targetSampleRate))
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

        // RMS level (0...1) for the waveform.
        let rms = sqrt(
            samples.reduce(0.0) { $0 + pow(Double($1) / 32767.0, 2) } / Double(frames))
        let normalized = Float(min(1.0, rms * 4))

        lock.withLock { pcmSamples.append(contentsOf: samples) }
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

    // MARK: - WAV

    /// Wraps raw 16-bit mono PCM samples in a minimal WAV container.
    private static func wav(from samples: [Int16], sampleRate: Int) -> Data {
        let bytesPerSample = 2
        let dataSize = samples.count * bytesPerSample
        let byteRate = sampleRate * bytesPerSample

        var data = Data()
        func append(_ string: String) { data.append(contentsOf: string.utf8) }
        func append(le32 value: UInt32) {
            var v = value.littleEndian
            withUnsafeBytes(of: &v) { data.append(contentsOf: $0) }
        }
        func append(le16 value: UInt16) {
            var v = value.littleEndian
            withUnsafeBytes(of: &v) { data.append(contentsOf: $0) }
        }

        append("RIFF")
        append(le32: UInt32(36 + dataSize))
        append("WAVE")
        append("fmt ")
        append(le32: 16) // PCM chunk size
        append(le16: 1) // PCM format
        append(le16: 1) // mono
        append(le32: UInt32(sampleRate))
        append(le32: UInt32(byteRate))
        append(le16: UInt16(bytesPerSample)) // block align
        append(le16: 16) // bits per sample
        append("data")
        append(le32: UInt32(dataSize))
        samples.forEach { append(le16: UInt16(bitPattern: $0)) }
        return data
    }
}
