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
}
