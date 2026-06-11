import Foundation

/// Decides how to splice a freshly dictated transcript into whatever text already
/// precedes the cursor, so dictating mid-sentence doesn't jam words together
/// (à la Wispr Flow). Pure + dependency-free so it's unit-testable.
enum TextInsertion {
    /// Returns the transcript, prefixed with a single space when it would
    /// otherwise butt up against a word or sentence-ending punctuation.
    ///
    /// - Parameters:
    ///   - transcript: the text to insert.
    ///   - before: `documentContextBeforeInput` — the text just before the cursor.
    static func spaced(_ transcript: String, after before: String?) -> String {
        guard let last = before?.last, let first = transcript.first else {
            return transcript
        }
        // The transcript already starts with whitespace — nothing to add.
        if first.isWhitespace { return transcript }
        // Only add a space after a word or sentence punctuation, so we don't
        // insert one right after an opening bracket/quote or existing space.
        let needsSpace = last.isLetter || last.isNumber || ".,!?;:".contains(last)
        return needsSpace ? " " + transcript : transcript
    }
}
