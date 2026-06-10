import SwiftUI

/// The custom keyboard surface: a large mic button to dictate (à la Wispr Flow),
/// a live waveform, status text, and a small utility row (globe / space / delete
/// / return). Text insertion itself is handled by the host view controller.
struct KeyboardView: View {
    @ObservedObject var dictation: DictationController
    @ObservedObject var recorder: AudioRecorder
    @ObservedObject var context: KeyboardContext

    var needsInputModeSwitch: Bool
    var onAdvanceKeyboard: () -> Void
    var onDelete: () -> Void
    var onReturn: () -> Void
    var onSpace: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            if context.fieldMode == .voice {
                statusLine
                micButton
            } else {
                fallbackView
            }
            utilityRow
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity)
        .background(Color(white: 0.13))
    }

    // MARK: - Fallback (numeric / secure fields)

    private var fallbackView: some View {
        VStack(spacing: 8) {
            Image(systemName: context.fieldMode == .secure ? "lock.fill" : "number")
                .font(.system(size: 22))
                .foregroundColor(.white.opacity(0.8))
            Text(
                context.fieldMode == .secure
                    ? "Use the system keyboard for secure fields"
                    : "Use the system keyboard for numbers"
            )
            .font(.footnote)
            .foregroundColor(.white.opacity(0.7))
            .multilineTextAlignment(.center)
            Button(action: onAdvanceKeyboard) {
                Label("Switch keyboard", systemImage: "globe")
                    .font(.footnote.weight(.medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color.accentColor)
                    .cornerRadius(8)
            }
            .buttonStyle(.plain)
        }
        .frame(height: 96)
    }

    // MARK: - Status

    private var statusLine: some View {
        Group {
            switch dictation.state {
            case .idle:
                Text("Tap to dictate")
                    .foregroundColor(.white.opacity(0.6))
            case .recording:
                Waveform(level: recorder.level)
            case .transcribing:
                Label("Transcribing…", systemImage: "waveform")
                    .foregroundColor(.white.opacity(0.8))
            case .error(let message):
                Label(message, systemImage: "exclamationmark.triangle")
                    .foregroundColor(.red.opacity(0.9))
                    .multilineTextAlignment(.center)
            }
        }
        .font(.footnote)
        .frame(height: 24)
    }

    // MARK: - Mic

    private var micButton: some View {
        Button { dictation.toggle() } label: {
            ZStack {
                Circle()
                    .fill(micColor)
                    .frame(width: 64, height: 64)
                if dictation.state == .transcribing {
                    ProgressView().tint(.white)
                } else {
                    Image(systemName: dictation.state == .recording ? "stop.fill" : "mic.fill")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundColor(.white)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(dictation.state == .recording ? "Stop dictation" : "Start dictation")
        .disabled(dictation.state == .transcribing)
    }

    private var micColor: Color {
        switch dictation.state {
        case .recording: return .red
        case .error: return Color(white: 0.3)
        default: return Color.accentColor
        }
    }

    // MARK: - Utility row

    private var utilityRow: some View {
        HStack(spacing: 8) {
            if needsInputModeSwitch {
                utilityButton(system: "globe", action: onAdvanceKeyboard)
                    .accessibilityLabel("Next keyboard")
            }
            Button(action: onSpace) {
                Text("space")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color(white: 0.22))
                    .foregroundColor(.white)
                    .cornerRadius(8)
            }
            .buttonStyle(.plain)
            utilityButton(system: "delete.left", action: onDelete)
                .accessibilityLabel("Delete")
            utilityButton(system: "return", action: onReturn)
                .accessibilityLabel("Return")
        }
    }

    private func utilityButton(system: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: system)
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(.white)
                .frame(width: 48, height: 40)
                .background(Color(white: 0.22))
                .cornerRadius(8)
        }
        .buttonStyle(.plain)
    }
}

/// A lightweight bar waveform driven by the recorder's normalized level.
private struct Waveform: View {
    var level: Float
    private let bars = 13

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<bars, id: \.self) { index in
                Capsule()
                    .fill(Color.accentColor)
                    .frame(width: 3, height: height(for: index))
            }
        }
        .animation(.easeOut(duration: 0.12), value: level)
    }

    private func height(for index: Int) -> CGFloat {
        // Taller toward the center for a classic waveform shape.
        let distance = abs(Double(index) - Double(bars - 1) / 2)
        let falloff = 1 - distance / Double(bars)
        let base = 4.0
        return base + CGFloat(Double(level) * 20 * falloff)
    }
}
