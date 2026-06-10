import { z } from 'zod'
import { ClientProvider } from '../clients/providers.js'

// ASR model schema - allows known models or any string matching pattern
export const AsrModelSchema = z
  .string()
  .transform(val => val.trim())
  .refine(val => val.length > 0, 'ASR model cannot be empty')
  .refine(val => val.length <= 100, 'ASR model too long')
  .refine(
    val => /^[a-zA-Z0-9\-_.]+$/.test(val),
    'ASR model contains invalid characters',
  )

export const AsrProviderSchema = z.preprocess(
  val => (typeof val === 'string' ? val.trim() : val),
  z.enum([ClientProvider.GROQ]),
)

export const AsrPromptSchema = z.string().trim().max(100, 'ASR prompt too long')

export const LlmProviderSchema = z.preprocess(
  val => (typeof val === 'string' ? val.trim() : val),
  z.enum([ClientProvider.GROQ, ClientProvider.CEREBRAS]),
)

export const LlmModelSchema = z
  .string()
  .transform(val => val.trim())
  .refine(val => val.length > 0, 'LLM model cannot be empty')
  .refine(val => val.length <= 100, 'LLM model too long')
  .refine(
    val => /^[a-zA-Z0-9\-_./]+$/.test(val),
    'LLM model contains invalid characters',
  )

export const LLMTemperatureSchema = z
  .number()
  .min(0, 'Temperature must be at least 0')
  .max(2, 'Temperature cannot exceed 2')

export const LlmPromptSchema = z
  .string()
  .trim()
  .max(1500, 'LLM prompt too long')

export const NoSpeechThresholdSchema = z
  .number()
  .min(0, 'No speech probability must be at least 0')
  .max(1, 'No speech probability cannot exceed 1')

// Individual vocabulary word schema
export const VocabularyWordSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9\-_.\s']+$/, 'Invalid vocabulary word characters')

// Vocabulary list schema
export const VocabularySchema = z
  .string()
  .trim()
  .max(5000, 'Vocabulary list too long')
  .transform(str => {
    if (!str) return []

    return str
      .split(',')
      .map(word => word.trim())
      .filter(word => word.length > 0)
      .slice(0, 500) // Limit number of words
      .filter(word => {
        // Validate each word individually
        try {
          VocabularyWordSchema.parse(word)
          return true
        } catch {
          return false
        }
      })
  })

// Vocabulary provided as a repeated field (the V2 stream's StreamConfig.vocabulary
// arrives as a string[]). Mirrors VocabularySchema's per-word validation and caps,
// but for array input, and filters bad words instead of rejecting the whole stream.
export const VocabularyArraySchema = z
  .array(z.string())
  .catch([]) // a non-array (shouldn't happen via protobuf) degrades to empty
  .transform(words =>
    words
      .slice(0, 500) // cap the count before any per-word work
      .map(word => word.trim())
      .filter(word => word.length > 0)
      .filter(word => {
        try {
          VocabularyWordSchema.parse(word)
          return true
        } catch {
          return false
        }
      }),
  )

// Transcript cleanup level for dictation mode. Never throws: any unknown value
// (or a missing header) degrades to the safe 'verbatim' default.
export const TranscriptCleanupLevelSchema = z
  .preprocess(
    val => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z.enum(['verbatim', 'light', 'heavy']),
  )
  .catch('verbatim')

export type TranscriptCleanupLevel = z.infer<typeof TranscriptCleanupLevelSchema>

// Header validation schema
export const HeaderSchema = z.object({
  asrModel: AsrModelSchema.optional(),
  vocabulary: VocabularySchema.optional(),
})

export type ValidatedHeaders = z.infer<typeof HeaderSchema>
