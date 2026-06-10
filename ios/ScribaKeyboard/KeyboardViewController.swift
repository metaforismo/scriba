import SwiftUI
import UIKit

/// Hosts the SwiftUI keyboard and bridges it to the text document proxy.
/// Requires "Allow Full Access" (set in Info.plist via `RequestsOpenAccess`) so
/// the extension can reach the network and the microphone.
final class KeyboardViewController: UIInputViewController {
    private let dictation = DictationController()
    private var hostingController: UIHostingController<KeyboardView>?

    override func viewDidLoad() {
        super.viewDidLoad()

        // Insert the final transcript at the cursor.
        dictation.onTranscript = { [weak self] transcript in
            self?.textDocumentProxy.insertText(transcript)
        }

        let keyboard = KeyboardView(
            dictation: dictation,
            recorder: dictation.recorder,
            needsInputModeSwitch: needsInputModeSwitchKey,
            onAdvanceKeyboard: { [weak self] in self?.advanceToNextInputMode() },
            onDelete: { [weak self] in self?.textDocumentProxy.deleteBackward() },
            onReturn: { [weak self] in self?.textDocumentProxy.insertText("\n") },
            onSpace: { [weak self] in self?.textDocumentProxy.insertText(" ") }
        )

        let host = UIHostingController(rootView: keyboard)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        addChild(host)
        view.addSubview(host.view)
        host.didMove(toParent: self)

        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        hostingController = host
    }
}
