import SwiftUI
import UIKit

/// What kind of text field the keyboard is currently editing — drives whether we
/// show the dictation UI or prompt the user to switch to the system keyboard.
/// Like Wispr Flow, voice dictation isn't useful for number/phone or secure
/// (password) fields, so we step aside there.
enum FieldMode: Equatable {
    case voice
    case numeric
    case secure
}

@MainActor
final class KeyboardContext: ObservableObject {
    @Published var fieldMode: FieldMode = .voice

    /// Recompute from the host text field's input traits.
    func update(from proxy: UITextDocumentProxy) {
        if proxy.isSecureTextEntry {
            fieldMode = .secure
        } else if Self.isNumeric(proxy.keyboardType) {
            fieldMode = .numeric
        } else {
            fieldMode = .voice
        }
    }

    private static func isNumeric(_ type: UIKeyboardType?) -> Bool {
        switch type {
        case .numberPad, .phonePad, .decimalPad, .asciiCapableNumberPad:
            return true
        default:
            return false
        }
    }
}
