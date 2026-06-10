import { HeaderValidator } from '../../validation/HeaderValidator.js'
import { ScribaContext } from './types.js'
import { SCRIBA_MODE_PROMPT } from './constants.js'
import { DEFAULT_ADVANCED_SETTINGS } from '../../constants/generated-defaults.js'
import { ScribaMode } from '../../generated/scriba_pb.js'
import {
  END_APP_NAME_MARKER,
  END_CONTEXT_MARKER,
  END_USER_COMMAND_MARKER,
  END_WINDOW_TITLE_MARKER,
  START_APP_NAME_MARKER,
  START_CONTEXT_MARKER,
  START_USER_COMMAND_MARKER,
  START_WINDOW_TITLE_MARKER,
} from '../../constants/markers.js'

export function createUserPromptWithContext(
  transcript: string,
  context?: ScribaContext,
): string {
  let contextPrompt = ''
  if (context) {
    if (context.windowTitle) {
      contextPrompt += `\n${START_WINDOW_TITLE_MARKER}\n${context.windowTitle}\n${END_WINDOW_TITLE_MARKER}`
    }
    if (context.appName) {
      contextPrompt += `\n${START_APP_NAME_MARKER}\n${context.appName}\n${END_APP_NAME_MARKER}`
    }
  }
  const userPrompt = `
    ${contextPrompt}${context?.contextText ? '\n' : ''}
    ${START_CONTEXT_MARKER}
    ${context?.contextText || ''}
    ${END_CONTEXT_MARKER}
    ${START_USER_COMMAND_MARKER}
    ${transcript}
    ${END_USER_COMMAND_MARKER}
  `
  return userPrompt
}

function validateAndTransformHeaderValue<T>(
  headers: Headers,
  headerName: string,
  defaultValue: T,
  validator: (value: T) => T,
  logName: string,
): T {
  const headerValue = headers.get(headerName)
  let valueToValidate = (headerValue || defaultValue) as T
  if (typeof defaultValue === 'number') {
    valueToValidate = Number(valueToValidate) as T
  }
  const validatedValue = validator(valueToValidate)
  console.log(
    `[Transcription] Using validated ${logName}: ${typeof validatedValue === 'string' ? validatedValue.slice(0, 50) + '...' : validatedValue} (source: ${headerValue ? 'header' : 'default'})`,
  )
  return validatedValue
}

export function getAdvancedSettingsHeaders(headers: Headers) {
  const asrModel = validateAndTransformHeaderValue(
    headers,
    'asr-model',
    DEFAULT_ADVANCED_SETTINGS.asrModel,
    HeaderValidator.validateAsrModel,
    'ASR model',
  )

  const asrProvider = validateAndTransformHeaderValue(
    headers,
    'asr-provider',
    DEFAULT_ADVANCED_SETTINGS.asrProvider,
    HeaderValidator.validateAsrProvider,
    'ASR Provider',
  )

  const asrPrompt = validateAndTransformHeaderValue(
    headers,
    'asr-prompt',
    DEFAULT_ADVANCED_SETTINGS.asrPrompt,
    HeaderValidator.validateAsrPrompt,
    'ASR prompt',
  )

  const llmProvider = validateAndTransformHeaderValue(
    headers,
    'llm-provider',
    DEFAULT_ADVANCED_SETTINGS.llmProvider,
    HeaderValidator.validateLlmProvider,
    'LLM Provider',
  )

  const llmModel = validateAndTransformHeaderValue(
    headers,
    'llm-model',
    DEFAULT_ADVANCED_SETTINGS.llmModel,
    HeaderValidator.validateLlmModel,
    'LLM model',
  )

  const llmTemperature = validateAndTransformHeaderValue(
    headers,
    'llm-temperature',
    DEFAULT_ADVANCED_SETTINGS.llmTemperature,
    HeaderValidator.validateLlmTemperature,
    'LLM temperature',
  )

  const transcriptionPrompt = validateAndTransformHeaderValue(
    headers,
    'transcription-prompt',
    DEFAULT_ADVANCED_SETTINGS.transcriptionPrompt,
    HeaderValidator.validateTranscriptionPrompt,
    'Transcription prompt',
  )

  const editingPrompt = validateAndTransformHeaderValue(
    headers,
    'editing-prompt',
    DEFAULT_ADVANCED_SETTINGS.editingPrompt,
    HeaderValidator.validateEditingPrompt,
    'Editing prompt',
  )

  const noSpeechThreshold = validateAndTransformHeaderValue(
    headers,
    'no-speech-threshold',
    DEFAULT_ADVANCED_SETTINGS.noSpeechThreshold,
    HeaderValidator.validateNoSpeechThreshold,
    'No speech threshold',
  )

  return {
    asrModel,
    asrProvider,
    asrPrompt,
    llmProvider,
    llmModel,
    llmTemperature,
    transcriptionPrompt,
    editingPrompt,
    noSpeechThreshold,
  }
}

// Numeric values that are actually members of the ScribaMode enum, derived from
// the generated enum so it stays correct if modes are added.
const VALID_SCRIBA_MODES = new Set(
  Object.values(ScribaMode).filter(
    (value): value is number => typeof value === 'number',
  ),
)

export function getScribaMode(input: unknown): ScribaMode | undefined {
  const inputNumber = Number(input)
  // Reject NaN/Infinity *and* in-range-looking numbers that aren't real enum
  // members (e.g. "7"), which would otherwise index SCRIBA_MODE_PROMPT[mode] as
  // undefined downstream.
  if (!Number.isFinite(inputNumber) || !VALID_SCRIBA_MODES.has(inputNumber)) {
    return undefined
  }
  return inputNumber as ScribaMode
}

// The "hey scriba" command wake phrase, accepted only at the START of the
// utterance (a wake word is always spoken first). Tolerates leading
// punctuation/whitespace, a comma or space between the two words, and the most
// common ASR mishearings of "scriba" (scribe / scribah / scribba). Anchoring to
// the start avoids false EDIT triggers when the phrase lands mid-dictation,
// e.g. "I told him hey Scriba is great".
const COMMAND_WAKE_PHRASE = /^[\s,.!?-]*hey[\s,]+scri(?:ba|be|bah|bba|bbah)\b/i

export function detectScribaMode(transcript: string): ScribaMode {
  return COMMAND_WAKE_PHRASE.test(transcript.trim())
    ? ScribaMode.EDIT
    : ScribaMode.TRANSCRIBE
}

export function getPromptForMode(
  mode: ScribaMode,
  advancedSettingsHeaders: ReturnType<typeof getAdvancedSettingsHeaders>,
): string {
  switch (mode) {
    case ScribaMode.EDIT:
      return (
        // TODO: Figure out how to version advanced settings such that we can overwrite user settings when a significant change is made
        // advancedSettingsHeaders.editingPrompt || SCRIBA_MODE_PROMPT[ScribaMode.EDIT]
        SCRIBA_MODE_PROMPT[ScribaMode.EDIT]
      )
    case ScribaMode.TRANSCRIBE:
      return (
        advancedSettingsHeaders.transcriptionPrompt ||
        SCRIBA_MODE_PROMPT[ScribaMode.TRANSCRIBE]
      )
    default:
      return SCRIBA_MODE_PROMPT[ScribaMode.TRANSCRIBE]
  }
}
