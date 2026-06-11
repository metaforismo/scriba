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
            live: dictation.live,
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

        // Custom keyboards default to the system keyboard height, which can clip
        // taller content (e.g. the numeric-field number pad). Request an explicit
        // height that fits all field modes. High (not required) priority so it
        // never conflicts with the system's keyboard layout constraints.
        let heightConstraint = view.heightAnchor.constraint(equalToConstant: 280)
        heightConstraint.priority = .defaultHigh
        heightConstraint.isActive = true

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

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        // The keyboard is going away mid-dictation: stop the mic (otherwise the
        // audio engine keeps it hot), end the live preview, and drop any pending
        // transcript so it isn't inserted into whatever field comes next.
        dictation.cancel()
    }

    override func textDidChange(_ textInput: UITextInput?) {
        super.textDidChange(textInput)
        // The host field (and its keyboard type / secure flag) can change as the
        // user moves between inputs — keep the fallback prompt in sync.
        context.update(from: textDocumentProxy)
    }
}
