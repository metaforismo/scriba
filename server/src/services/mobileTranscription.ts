import { FastifyInstance } from 'fastify'
import { getAsrProvider } from '../clients/providerUtils.js'
import { DEFAULT_ADVANCED_SETTINGS } from '../constants/generated-defaults.js'
import { HeaderValidator } from '../validation/HeaderValidator.js'
import { ClientError } from '../clients/errors.js'
import { cleanupTranscript } from './scriba/transcriptCleanup.js'

interface TranscribeBody {
  audio?: string // base64-encoded audio bytes
  fileType?: string // 'wav' | 'm4a' | 'webm' | ...
  vocabulary?: string[]
}

// 25 MB of base64-decoded audio is far more than a short keyboard utterance;
// this is just a backstop against abuse (mirrors the streaming handlers' cap).
const MAX_AUDIO_BYTES = 25 * 1024 * 1024

/**
 * Simple record-then-transcribe endpoint for the iOS keyboard extension.
 *
 * Keyboard extensions run under tight memory/lifecycle limits, so rather than
 * holding a bidirectional gRPC stream they record a short utterance and POST it
 * here as base64. Reuses the same ASR provider as the desktop streaming path.
 *
 * Auth is applied by the surrounding Fastify context (requireAuth preHandler);
 * the explicit check here is a defensive guard.
 */
export const registerMobileTranscriptionRoutes = async (
  fastify: FastifyInstance,
  options: { requireAuth: boolean },
) => {
  const { requireAuth } = options

  fastify.post('/v1/transcribe', async (request, reply) => {
    const userSub = (requireAuth && (request as any).user?.sub) || undefined
    if (requireAuth && !userSub) {
      reply.code(401).send({ error: 'Unauthorized' })
      return
    }

    const body = (request.body || {}) as TranscribeBody
    if (!body.audio || typeof body.audio !== 'string') {
      reply.code(400).send({ error: 'Missing audio (base64)' })
      return
    }

    const audioBuffer = Buffer.from(body.audio, 'base64')
    if (audioBuffer.length === 0) {
      reply.code(400).send({ error: 'Empty or invalid audio' })
      return
    }
    if (audioBuffer.length > MAX_AUDIO_BYTES) {
      reply.code(413).send({ error: 'Audio too large' })
      return
    }

    try {
      const asrProvider = getAsrProvider(DEFAULT_ADVANCED_SETTINGS.asrProvider)
      const rawTranscript = await asrProvider.transcribeAudio(audioBuffer, {
        fileType: body.fileType || 'wav',
        asrModel: DEFAULT_ADVANCED_SETTINGS.asrModel,
        noSpeechThreshold: DEFAULT_ADVANCED_SETTINGS.noSpeechThreshold,
        vocabulary: HeaderValidator.validateVocabularyArray(
          body.vocabulary ?? [],
        ),
        language: HeaderValidator.validateLanguage(
          request.headers['transcription-language'] as string | undefined,
        ),
      })

      // Apply the same verbatim/light/heavy cleanup as the desktop streaming
      // path, driven by the header the iOS keyboard already sends. Best-effort:
      // returns the raw transcript on verbatim / empty / LLM error.
      const cleanupLevel = HeaderValidator.validateCleanupLevel(
        request.headers['transcript-cleanup-level'] as string | undefined,
      )
      const transcript = await cleanupTranscript(rawTranscript, cleanupLevel, {
        llmProvider: DEFAULT_ADVANCED_SETTINGS.llmProvider,
        llmModel: DEFAULT_ADVANCED_SETTINGS.llmModel,
        llmTemperature: DEFAULT_ADVANCED_SETTINGS.llmTemperature,
      })

      reply.send({ transcript })
    } catch (error: any) {
      // Surface a stable error code for known client errors (e.g. no speech,
      // audio too short) so the app can show a friendly message; never leak
      // internal details.
      fastify.log.error(error)
      if (error instanceof ClientError) {
        reply.code(422).send({ error: 'Transcription failed', code: error.code })
        return
      }
      reply
        .code(502)
        .send({ error: 'Transcription failed', code: 'TRANSCRIPTION_FAILED' })
    }
  })
}
