export interface TranscriptionOptions {
  fileType?: string
  asrModel?: string
  vocabulary?: string[]
  noSpeechThreshold?: number
  /** ISO-639-1 language code to force, or 'auto'/undefined to auto-detect. */
  language?: string
}
