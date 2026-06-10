import Groq from 'groq-sdk'
import { toFile } from 'groq-sdk/uploads'
import * as dotenv from 'dotenv'
import { createTranscriptionPrompt } from '../prompts/transcription.js'
import {
  ClientApiKeyError,
  ClientUnavailableError,
  ClientModelError,
  ClientNoSpeechError,
  ClientAudioTooShortError,
  ClientApiError,
  ClientError,
} from './errors.js'
import { ClientProvider } from './providers.js'
import { LlmProvider } from './llmProvider.js'
import { TranscriptionOptions } from './asrConfig.js'
import { IntentTranscriptionOptions } from './intentTranscriptionConfig.js'
import { DEFAULT_ADVANCED_SETTINGS } from '../constants/generated-defaults.js'

// Load environment variables from .env file
dotenv.config()
export const scribaVocabulary = ['Scriba', 'Hey Scriba']

/**
 * A TypeScript client for interacting with the Groq API, inspired by your Python implementation.
 */
class GroqClient implements LlmProvider {
  private readonly _client: Groq
  private readonly _userCommandModel: string
  private readonly _isValid: boolean

  constructor(apiKey: string, userCommandModel: string) {
    if (!apiKey) {
      throw new ClientApiKeyError(ClientProvider.GROQ)
    }
    this._client = new Groq({ apiKey })
    this._userCommandModel = userCommandModel
    this._isValid = true
  }

  /**
   * Checks if the client is configured correctly.
   */
  public get isAvailable(): boolean {
    return this._isValid
  }

  /**
   * Uses a thinking model to adjust/improve a transcript.
   * @param transcript The original transcript text.
   * @returns The adjusted transcript.
   */
  public async adjustTranscript(
    userPrompt: string,
    options?: IntentTranscriptionOptions,
  ): Promise<string> {
    if (!this.isAvailable) {
      throw new ClientUnavailableError(ClientProvider.GROQ)
    }

    const temperature = options?.temperature ?? 0.7
    const model = options?.model || this._userCommandModel
    const systemPrompt =
      options?.prompt ||
      'Adjust and improve this transcript for clarity and accuracy.'

    try {
      const completion = await this._client.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        model,
        temperature,
      })

      // Empty output -> return empty string (not a lone space). The caller skips
      // insertion for an empty transcript; a space would fail the text inserter
      // and surface a confusing "insert failed" instead.
      return completion.choices[0]?.message?.content?.trim() || ''
    } catch (error: any) {
      console.error('An error occurred during transcript adjustment:', error)
      if (error instanceof ClientError) {
        throw error
      }
      // Surface the failure instead of returning the raw prompt scaffold,
      // which would otherwise be pasted into the user's document.
      throw new ClientApiError(
        error.message || 'An unknown error occurred',
        ClientProvider.GROQ,
        error,
        error.status || error.statusCode,
      )
    }
  }

  /**
   * Transcribes an audio buffer using the Groq API.
   * @param audioBuffer The audio data as a Node.js Buffer.
   * @param options Optional transcription configuration.
   * @returns The transcribed text as a string.
   */
  public async transcribeAudio(
    audioBuffer: Buffer,
    options?: TranscriptionOptions,
  ): Promise<string> {
    console.log('Transcribing audio with options:', options)
    const fileType = options?.fileType || 'webm'
    const asrModel = options?.asrModel
    const vocabulary = options?.vocabulary
    const noSpeechThreshold =
      options?.noSpeechThreshold ?? DEFAULT_ADVANCED_SETTINGS.noSpeechThreshold

    // Fail fast on configuration before doing any work.
    if (!this.isAvailable) {
      throw new ClientUnavailableError(ClientProvider.GROQ)
    }
    if (!asrModel) {
      throw new ClientModelError(ClientProvider.GROQ)
    }

    try {
      // Inside the try so a toFile() failure is wrapped as a ClientApiError
      // instead of escaping as a raw, unclassified error.
      const file = await toFile(audioBuffer, `audio.${fileType}`)

      console.log(
        `Transcribing ${audioBuffer.length} bytes of audio using model ${asrModel}...`,
      )

      const fullVocabulary = [...scribaVocabulary, ...(vocabulary || [])]

      // Create a concise but effective transcription prompt
      const transcriptionPrompt = createTranscriptionPrompt(fullVocabulary)

      const transcription = await this._client.audio.transcriptions.create({
        // The toFile helper correctly handles buffers for multipart/form-data uploads.
        // Providing a filename with the correct extension is crucial for the API.
        file,
        model: asrModel,
        prompt: transcriptionPrompt,
        response_format: 'verbose_json',
      })

      const segments = (transcription as any).segments
      if (segments && segments.length > 0) {
        // Flag "no speech" only when EVERY segment is above the threshold — i.e.
        // there is no speech anywhere in the recording. Inspecting only
        // segments[0] (the previous behavior) wrongly rejected a dictation that
        // merely started with a breath/noise (losing valid speech), and handled
        // trailing silence after real speech inconsistently.
        const probs: number[] = segments.map(
          (s: any) => s?.no_speech_prob ?? 0,
        )
        const allNoSpeech = probs.every(p => p > noSpeechThreshold)
        if (allNoSpeech) {
          // Report the most speech-like segment's prob (the strongest signal
          // that still failed the threshold).
          const minProb = Math.min(...probs)
          console.log(
            'No speech detected across all segments. Lowest no_speech_prob:',
            minProb,
          )
          throw new ClientNoSpeechError(ClientProvider.GROQ, minProb)
        }
      }

      // The Node SDK returns the full object, the text is in the `text` property.
      return transcription.text.trim()
    } catch (error: any) {
      console.log(
        `Failed to transcribe audio of size ${audioBuffer.length} bytes.`,
      )
      console.error('An error occurred during Groq transcription:', error)
      if (error instanceof ClientError) {
        throw error
      }

      const errorMessage = error.message || 'An unknown error occurred'

      // Check for specific audio too short error
      if (errorMessage.includes('Audio file is too short')) {
        throw new ClientAudioTooShortError(ClientProvider.GROQ)
      }

      // Re-throw the error to be handled by the caller (e.g., the gRPC service handler).
      throw new ClientApiError(
        errorMessage,
        ClientProvider.GROQ,
        error,
        error.status || error.statusCode,
      )
    }
  }
}

// --- Singleton Instance ---
// Create and export a single, pre-configured instance of the client for use across the server.
// Only check for GROQ_API_KEY since ASR model is now provided per-request
if (!process.env.GROQ_API_KEY) {
  console.error(
    'FATAL: GROQ_API_KEY is not set in the .env file. The application cannot start.',
  )
  process.exit(1)
}
const apiKey = process.env.GROQ_API_KEY

// Note: userCommandModel is empty for now as we are only using transcription.
export const groqClient = new GroqClient(apiKey, '')
