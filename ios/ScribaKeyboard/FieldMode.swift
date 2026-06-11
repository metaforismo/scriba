import UIKit

/// What kind of text field the keyboard is editing — drives the keyboard surface:
/// the dictation UI for normal text, a number pad for numeric fields, and a
/// system-keyboard prompt for secure (password) fields. Like Wispr Flow, voice
/// dictation isn't useful for number or secure fields, so we adapt there.
enum FieldMode: Equatable {
    case voice
    case numeric
    case secure

    /// Classifies a field from its input traits. Pure, so it's unit-testable.
    static func from(keyboardType: UIKeyboardType?, isSecure: Bool) -> FieldMode {
        if isSecure { return .secure }
        switch keyboardType {
        case .numberPad, .phonePad, .decimalPad, .asciiCapableNumberPad:
            return .numeric
        default:
            return .voice
        }
    }
}
