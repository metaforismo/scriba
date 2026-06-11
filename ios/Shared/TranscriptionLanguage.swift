import Foundation

/// The transcription language. Mirrors the desktop app's `transcriptionLanguage`
/// setting and the server's `transcription-language` header: 'auto' lets Whisper
/// detect the language; an ISO-639-1 code forces it for better accuracy.
struct LanguageOption: Identifiable, Hashable {
    let code: String
    let label: String
    var id: String { code }
}

enum TranscriptionLanguage {
    static let options: [LanguageOption] = [
        LanguageOption(code: "auto", label: "Auto-detect"),
        LanguageOption(code: "en", label: "English"),
        LanguageOption(code: "es", label: "Spanish"),
        LanguageOption(code: "fr", label: "French"),
        LanguageOption(code: "de", label: "German"),
        LanguageOption(code: "it", label: "Italian"),
        LanguageOption(code: "pt", label: "Portuguese"),
        LanguageOption(code: "nl", label: "Dutch"),
        LanguageOption(code: "pl", label: "Polish"),
        LanguageOption(code: "ru", label: "Russian"),
        LanguageOption(code: "uk", label: "Ukrainian"),
        LanguageOption(code: "tr", label: "Turkish"),
        LanguageOption(code: "ar", label: "Arabic"),
        LanguageOption(code: "hi", label: "Hindi"),
        LanguageOption(code: "zh", label: "Chinese"),
        LanguageOption(code: "ja", label: "Japanese"),
        LanguageOption(code: "ko", label: "Korean"),
    ]

    private static let storageKey = "transcriptionLanguage"

    /// The selected ISO-639-1 code, or "auto".
    static var current: String {
        AppGroup.defaults.string(forKey: storageKey) ?? "auto"
    }

    static func set(_ code: String) {
        AppGroup.defaults.set(code, forKey: storageKey)
    }
}
