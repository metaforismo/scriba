import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { createTestApp, createTestAppWithAuth } from './__tests__/helpers.js'

const mockTranscribeAudio = mock(() => Promise.resolve('hello world'))

mock.module('../clients/providerUtils.js', () => ({
  getAsrProvider: () => ({
    isAvailable: true,
    transcribeAudio: mockTranscribeAudio,
  }),
  getLlmProvider: () => ({}),
}))

const { registerMobileTranscriptionRoutes } = await import(
  './mobileTranscription.js'
)
const { ClientNoSpeechError } = await import('../clients/errors.js')
const { ClientProvider } = await import('../clients/providers.js')

const b64 = (s: string) => Buffer.from(s).toString('base64')

describe('registerMobileTranscriptionRoutes', () => {
  beforeEach(() => {
    mockTranscribeAudio.mockClear()
    mockTranscribeAudio.mockResolvedValue('hello world')
  })

  it('returns the transcript for valid audio', async () => {
    const app = createTestAppWithAuth()
    await registerMobileTranscriptionRoutes(app, { requireAuth: true })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/transcribe',
      payload: { audio: b64('fake-wav-bytes'), fileType: 'wav' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ transcript: 'hello world' })
    expect(mockTranscribeAudio).toHaveBeenCalledTimes(1)
  })

  it('401s when auth is required but there is no user', async () => {
    const app = createTestApp() // no auth preHandler -> no req.user
    await registerMobileTranscriptionRoutes(app, { requireAuth: true })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/transcribe',
      payload: { audio: b64('x') },
    })

    expect(res.statusCode).toBe(401)
    expect(mockTranscribeAudio).not.toHaveBeenCalled()
  })

  it('400s when audio is missing or empty', async () => {
    const app = createTestAppWithAuth()
    await registerMobileTranscriptionRoutes(app, { requireAuth: true })

    const missing = await app.inject({
      method: 'POST',
      url: '/v1/transcribe',
      payload: { fileType: 'wav' },
    })
    expect(missing.statusCode).toBe(400)

    const empty = await app.inject({
      method: 'POST',
      url: '/v1/transcribe',
      payload: { audio: '' },
    })
    expect(empty.statusCode).toBe(400)
  })

  it('maps known client errors (no speech) to 422 with a stable code', async () => {
    mockTranscribeAudio.mockRejectedValueOnce(
      new ClientNoSpeechError(ClientProvider.GROQ, 0.95),
    )
    const app = createTestAppWithAuth()
    await registerMobileTranscriptionRoutes(app, { requireAuth: true })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/transcribe',
      payload: { audio: b64('x') },
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('CLIENT_NO_SPEECH_DETECTED')
  })

  it('maps unexpected errors to 502 without leaking details', async () => {
    mockTranscribeAudio.mockRejectedValueOnce(new Error('groq exploded: secret'))
    const app = createTestAppWithAuth()
    await registerMobileTranscriptionRoutes(app, { requireAuth: true })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/transcribe',
      payload: { audio: b64('x') },
    })

    expect(res.statusCode).toBe(502)
    expect(res.json()).toEqual({
      error: 'Transcription failed',
      code: 'TRANSCRIPTION_FAILED',
    })
  })

  it('allows requests without a user when auth is disabled', async () => {
    const app = createTestApp()
    await registerMobileTranscriptionRoutes(app, { requireAuth: false })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/transcribe',
      payload: { audio: b64('x') },
    })

    expect(res.statusCode).toBe(200)
  })
})
