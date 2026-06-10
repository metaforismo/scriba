import Foundation

/// How much the AI polishes a dictation before it's inserted. Mirrors the
/// desktop app's `transcriptCleanupLevel` setting and the server's
/// `transcript-cleanup-level` header.
enum CleanupLevel: String, CaseIterable, Identifiable {
    case verbatim
    case light
    case heavy

    var id: String { rawValue }

    var title: String {
        switch self {
        case .verbatim: return "Verbatim"
        case .light: return "Light"
        case .heavy: return "Heavy"
        }
    }

    var subtitle: String {
        switch self {
        case .verbatim: return "Insert your words exactly as spoken (fastest)"
        case .light: return "Remove filler, fix punctuation"
        case .heavy: return "Tighten and format for readability"
        }
    }

    private static let storageKey = "transcriptCleanupLevel"

    static var current: CleanupLevel {
        let raw = AppGroup.defaults.string(forKey: storageKey) ?? verbatim.rawValue
        return CleanupLevel(rawValue: raw) ?? .verbatim
    }

    static func set(_ level: CleanupLevel) {
        AppGroup.defaults.set(level.rawValue, forKey: storageKey)
    }
}
