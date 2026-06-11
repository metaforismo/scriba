import Foundation

/// Wraps raw 16-bit mono PCM samples in a minimal WAV (RIFF) container — the
/// format the backend expects. Pure + dependency-free so it's unit-testable
/// (kept out of AudioRecorder, which pulls in AVFoundation).
enum WAVEncoder {
    /// The fixed size of a canonical PCM WAV header, in bytes.
    static let headerSize = 44

    static func encode(samples: [Int16], sampleRate: Int) -> Data {
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
