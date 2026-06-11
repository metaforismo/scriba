import SwiftUI
import UIKit

/// Tracks what kind of text field the keyboard is currently editing so the UI can
/// adapt (see `FieldMode`).
@MainActor
final class KeyboardContext: ObservableObject {
    @Published var fieldMode: FieldMode = .voice

    /// Recompute from the host text field's input traits.
    func update(from proxy: UITextDocumentProxy) {
        // `isSecureTextEntry` is optional on UITextDocumentProxy; nil means the
        // host didn't declare it, so treat only an explicit true as secure.
        fieldMode = FieldMode.from(
            keyboardType: proxy.keyboardType,
            isSecure: proxy.isSecureTextEntry == true)
    }
}
