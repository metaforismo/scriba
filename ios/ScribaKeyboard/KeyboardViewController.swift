import SwiftUI
import UIKit

/// Hosts the SwiftUI keyboard and bridges it to the text document proxy.
/// Requires "Allow Full Access" (set in Info.plist via `RequestsOpenAccess`) so
/// the extension can reach the network and the microphone.
final class KeyboardViewController: UIInputViewController {
    private let dictation = DictationController()
    private let context = KeyboardContext()
    private var hostingController: UIHostingController<KeyboardView>?

    override func viewDidLoad() {
        super.viewDidLoad()

        // Insert the final transcript at the cursor, with a leading space when it
        // would otherwise jam against the preceding word.
        dictation.onTranscript = { [weak self] transcript in
            guard let self else { return }
            let proxy = self.textDocumentProxy
            let text = TextInsertion.spaced(
                transcript, after: proxy.documentContextBeforeInput)
            proxy.insertText(text)
        }

        let keyboard = KeyboardView(
            dictation: dictation,
            recorder: dictation.recorder,
            context: context,
            needsInputModeSwitch: needsInputModeSwitchKey,
            onAdvanceKeyboard: { [weak self] in self?.advanceToNextInputMode() },
            onDelete: { [weak self] in self?.textDocumentProxy.deleteBackward() },
            onReturn: { [weak self] in self?.textDocumentProxy.insertText("\n") },
            onSpace: { [weak self] in self?.textDocumentProxy.insertText(" ") },
            onInsert: { [weak self] text in
                self?.textDocumentProxy.insertText(text)
            }
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

        context.update(from: textDocumentProxy)
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        context.update(from: textDocumentProxy)
    }

    override func textDidChange(_ textInput: UITextInput?) {
        super.textDidChange(textInput)
        // The host field (and its keyboard type / secure flag) can change as the
        // user moves between inputs — keep the fallback prompt in sync.
        context.update(from: textDocumentProxy)
    }
}
