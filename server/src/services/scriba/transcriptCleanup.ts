import { getLlmProvider } from '../../clients/providerUtils.js'
import {
  TRANSCRIPT_CLEANUP_PROMPT,
  TRANSCRIPT_CLEANUP_SYSTEM_PROMPT,
} from './constants.js'
import type { TranscriptCleanupLevel } from '../../validation/schemas.js'

/** The LLM settings the cleanup pass needs. */
export interface CleanupLlmSettings {
  llmProvider: string
  llmModel: string
  llmTemperature: number
}

/**
 * Builds the cleanup user prompt. When the active app is known, adds a note so
 * the LLM formats appropriately for that medium (à la Wispr Flow's context-aware
 * formatting) — structured for an email client, concise for a chat app — while
 * preserving the user's wording, meaning, and any names/dates/numbers. Pure +
 * exported so it's unit-testable.
 */
export function buildCleanupUserPrompt(
  instruction: string,
  transcript: string,
  appName?: string,
): string {
  const app = appName?.trim()
  const appLine = app
    ? `\n\nThe user is dictating into "${app}". Format appropriately for that medium (e.g. cleaner structure for an email, concise for a chat or messaging app) while preserving the user's wording, meaning, and any names, dates, and numbers.`
    : ''
  return `${instruction}${appLine}\n\nTranscript:\n${transcript}`
}

/**
 * Runs the optional dictation cleanup pass (light/heavy) over a transcript.
 *
 * Shared by the streaming V2 handler and the mobile `/v1/transcribe` endpoint so
 * they can't diverge. Best-effort: a `verbatim` level, an empty transcript, an
 * LLM error, or empty LLM output all return the raw transcript, so cleanup can
 * never lose or blank a dictation.
 */
export async function cleanupTranscript(
  transcript: string,
  level: TranscriptCleanupLevel,
  settings: CleanupLlmSettings,
  appName?: string,
): Promise<string> {
  if (level === 'verbatim' || !transcript.trim()) {
    return transcript
  }

  const instruction = TRANSCRIPT_CLEANUP_PROMPT[level]
  const llmProvider = getLlmProvider(settings.llmProvider)

  try {
    const cleaned = await llmProvider.adjustTranscript(
      buildCleanupUserPrompt(instruction, transcript, appName),
      {
        temperature: settings.llmTemperature,
        model: settings.llmModel,
        prompt: TRANSCRIPT_CLEANUP_SYSTEM_PROMPT,
      },
    )

    console.log(
      `🧹 [${new Date().toISOString()}] Cleaned transcript (${level}): "${cleaned}"`,
    )

    // Never replace a real dictation with empty output.
    return cleaned && cleaned.trim() ? cleaned : transcript
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Transcript cleanup (${level}) failed, using raw transcript:`,
      error,
    )
    return transcript
  }
}
