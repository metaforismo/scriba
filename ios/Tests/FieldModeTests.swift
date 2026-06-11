import UIKit
import XCTest

final class FieldModeTests: XCTestCase {
    func testSecureOverridesKeyboardType() {
        XCTAssertEqual(
            FieldMode.from(keyboardType: .numberPad, isSecure: true), .secure)
        XCTAssertEqual(
            FieldMode.from(keyboardType: .default, isSecure: true), .secure)
    }

    func testNumericKeyboardTypes() {
        let numeric: [UIKeyboardType] = [
            .numberPad, .phonePad, .decimalPad, .asciiCapableNumberPad,
        ]
        for type in numeric {
            XCTAssertEqual(
                FieldMode.from(keyboardType: type, isSecure: false), .numeric)
        }
    }

    func testVoiceForTextTypes() {
        let textual: [UIKeyboardType] = [.default, .emailAddress, .URL, .twitter]
        for type in textual {
            XCTAssertEqual(
                FieldMode.from(keyboardType: type, isSecure: false), .voice)
        }
        XCTAssertEqual(FieldMode.from(keyboardType: nil, isSecure: false), .voice)
    }
}
