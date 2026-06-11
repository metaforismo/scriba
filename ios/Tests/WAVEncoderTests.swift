import XCTest

final class WAVEncoderTests: XCTestCase {
    private func u32(_ data: Data, _ offset: Int) -> UInt32 {
        data.subdata(in: offset..<offset + 4).withUnsafeBytes {
            $0.load(as: UInt32.self).littleEndian
        }
    }
    private func u16(_ data: Data, _ offset: Int) -> UInt16 {
        data.subdata(in: offset..<offset + 2).withUnsafeBytes {
            $0.load(as: UInt16.self).littleEndian
        }
    }
    private func ascii(_ data: Data, _ offset: Int, _ length: Int) -> String {
        String(decoding: data.subdata(in: offset..<offset + length), as: UTF8.self)
    }

    func testHeaderLayoutForKnownSamples() {
        let samples: [Int16] = [0, 1000, -1000, 32767, -32768]
        let data = WAVEncoder.encode(samples: samples, sampleRate: 16_000)

        XCTAssertEqual(ascii(data, 0, 4), "RIFF")
        XCTAssertEqual(ascii(data, 8, 4), "WAVE")
        XCTAssertEqual(ascii(data, 12, 4), "fmt ")
        XCTAssertEqual(u32(data, 16), 16) // PCM chunk size
        XCTAssertEqual(u16(data, 20), 1) // PCM format
        XCTAssertEqual(u16(data, 22), 1) // mono
        XCTAssertEqual(u32(data, 24), 16_000) // sample rate
        XCTAssertEqual(u32(data, 28), 32_000) // byte rate = rate * 2
        XCTAssertEqual(u16(data, 32), 2) // block align
        XCTAssertEqual(u16(data, 34), 16) // bits per sample
        XCTAssertEqual(ascii(data, 36, 4), "data")

        let dataSize = samples.count * 2
        XCTAssertEqual(Int(u32(data, 40)), dataSize)
        XCTAssertEqual(Int(u32(data, 4)), 36 + dataSize) // RIFF chunk size
        XCTAssertEqual(data.count, WAVEncoder.headerSize + dataSize)
    }

    func testSamplesRoundTripLittleEndian() {
        let samples: [Int16] = [0, 1234, -1, -32768, 32767]
        let data = WAVEncoder.encode(samples: samples, sampleRate: 16_000)
        for (i, sample) in samples.enumerated() {
            let raw = u16(data, WAVEncoder.headerSize + i * 2)
            XCTAssertEqual(Int16(bitPattern: raw), sample)
        }
    }

    func testEmptySamplesProduceBareHeader() {
        let data = WAVEncoder.encode(samples: [], sampleRate: 16_000)
        XCTAssertEqual(data.count, WAVEncoder.headerSize)
        XCTAssertEqual(u32(data, 40), 0) // data chunk size
    }
}
