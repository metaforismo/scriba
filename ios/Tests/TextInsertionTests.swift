import XCTest

final class TextInsertionTests: XCTestCase {
    func testPrependsSpaceAfterAWord() {
        XCTAssertEqual(TextInsertion.spaced("world", after: "hello"), " world")
    }

    func testPrependsSpaceAfterSentencePunctuation() {
        XCTAssertEqual(TextInsertion.spaced("Next", after: "Done."), " Next")
    }

    func testNoSpaceAfterExistingWhitespace() {
        XCTAssertEqual(TextInsertion.spaced("world", after: "hello "), "world")
    }

    func testNoSpaceAtStartOfDocument() {
        XCTAssertEqual(TextInsertion.spaced("hello", after: nil), "hello")
        XCTAssertEqual(TextInsertion.spaced("hello", after: ""), "hello")
    }

    func testNoSpaceAfterOpeningBracket() {
        XCTAssertEqual(TextInsertion.spaced("hello", after: "("), "hello")
    }

    func testNoDoubleSpaceWhenTranscriptLeadsWithSpace() {
        XCTAssertEqual(TextInsertion.spaced(" world", after: "hello"), " world")
    }

    func testNoSpaceBetweenCJKText() {
        // CJK doesn't separate words with spaces.
        XCTAssertEqual(TextInsertion.spaced("世界", after: "你好"), "世界")
        XCTAssertEqual(TextInsertion.spaced("です", after: "こんにちは"), "です")
        XCTAssertEqual(TextInsertion.spaced("세요", after: "안녕하"), "세요")
    }

    func testStillSpacesAccentedLatin() {
        // Space-using scripts (incl. accented Latin) keep getting a space.
        XCTAssertEqual(TextInsertion.spaced("café", after: "un"), " café")
        XCTAssertEqual(TextInsertion.spaced("über", after: "das"), " über")
    }
}
