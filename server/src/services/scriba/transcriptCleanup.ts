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
): Promise<string> {
  if (level === 'verbatim' || !transcript.trim()) {
    return transcript
  }

  const instruction = TRANSCRIPT_CLEANUP_PROMPT[level]
  const llmProvider = getLlmProvider(settings.llmProvider)

  try {
    const cleaned = await llmProvider.adjustTranscript(
      `${instruction}\n\nTranscript:\n${transcript}`,
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
