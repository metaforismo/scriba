import { DEFAULT_ADVANCED_SETTINGS } from '../../constants/generated-defaults.js'
import { ScribaMode } from '../../generated/scriba_pb.js'

export const SCRIBA_MODE_PROMPT: { [key in ScribaMode]: string } = {
  [ScribaMode.TRANSCRIBE]: DEFAULT_ADVANCED_SETTINGS.transcriptionPrompt,
  [ScribaMode.EDIT]: DEFAULT_ADVANCED_SETTINGS.editingPrompt,
}

export const SCRIBA_MODE_SYSTEM_PROMPT: { [key in ScribaMode]: string } = {
  [ScribaMode.TRANSCRIBE]: 'You are a helpful AI transcription assistant.',
  [ScribaMode.EDIT]: 'You are an AI assistant helping to edit documents.',
}

// System prompt for the optional dictation-mode cleanup pass (light/heavy).
export const TRANSCRIPT_CLEANUP_SYSTEM_PROMPT =
  'You are a dictation cleanup assistant. You receive a raw speech-to-text transcript and return ONLY the cleaned text — no preamble, commentary, explanations, or surrounding quotes.'

// Per-level instructions for the dictation-mode cleanup pass. 'verbatim' is
// handled by skipping the pass entirely, so only light/heavy are defined.
export const TRANSCRIPT_CLEANUP_PROMPT: { light: string; heavy: string } = {
  light: `Clean up this dictation transcript with a LIGHT touch:
- Remove filler words ("uh", "um", "you know", "like") and false starts.
- Fix capitalization and punctuation.
- Resolve obvious self-corrections, keeping the speaker's final phrasing.
- Render clearly-spoken emails, URLs, and @handles in written form (e.g. "john at gmail dot com" -> "john@gmail.com", "github dot com slash scriba" -> "github.com/scriba").
Otherwise keep the user's exact wording, tone, and sentence structure. Do NOT summarize, rephrase, translate, or add anything. Return only the cleaned transcript.`,
  heavy: `Clean up this dictation transcript thoroughly for readability:
- Remove fillers, false starts, and repetition.
- Fix grammar, punctuation, and capitalization.
- Resolve self-corrections, tighten wordy phrasing, and split into paragraphs or bullet lists where it genuinely helps.
- Render clearly-spoken emails, URLs, and @handles in written form (e.g. "john at gmail dot com" -> "john@gmail.com", "github dot com slash scriba" -> "github.com/scriba").
Preserve the user's meaning, intent, key details (names, dates, numbers), and overall tone. Do NOT invent content, answer questions in the text, or add commentary. Return only the cleaned transcript.`,
}

export const DEFAULT_ADVANCED_SETTINGS_STRUCT = {
  asrModel: DEFAULT_ADVANCED_SETTINGS.asrModel,
  asrPrompt: DEFAULT_ADVANCED_SETTINGS.asrPrompt,
  asrProvider: DEFAULT_ADVANCED_SETTINGS.asrProvider,
  llmProvider: DEFAULT_ADVANCED_SETTINGS.llmProvider,
  llmTemperature: DEFAULT_ADVANCED_SETTINGS.llmTemperature,
  llmModel: DEFAULT_ADVANCED_SETTINGS.llmModel,
  transcriptionPrompt: DEFAULT_ADVANCED_SETTINGS.transcriptionPrompt,
  editingPrompt: DEFAULT_ADVANCED_SETTINGS.editingPrompt,
  noSpeechThreshold: DEFAULT_ADVANCED_SETTINGS.noSpeechThreshold,
}
