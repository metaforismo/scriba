import { describe, it, expect, mock, beforeEach } from 'bun:test'

const mockAdjust = mock(() => Promise.resolve('cleaned text'))

mock.module('../../clients/providerUtils.js', () => ({
  getLlmProvider: () => ({ adjustTranscript: mockAdjust }),
  getAsrProvider: () => ({}),
}))

const { cleanupTranscript, buildCleanupUserPrompt } = await import(
  './transcriptCleanup.js'
)

const settings = { llmProvider: 'groq', llmModel: 'model', llmTemperature: 0.1 }

describe('buildCleanupUserPrompt', () => {
  it('omits the app line when no app is provided', () => {
    const prompt = buildCleanupUserPrompt('INSTR', 'hello world')
    expect(prompt).toBe('INSTR\n\nTranscript:\nhello world')
    expect(prompt).not.toMatch(/dictating into/i)
  })

  it('omits the app line for an empty/whitespace app name', () => {
    expect(buildCleanupUserPrompt('INSTR', 'hi', '   ')).toBe(
      'INSTR\n\nTranscript:\nhi',
    )
  })

  it('adds app-aware formatting guidance when the app is known', () => {
    const prompt = buildCleanupUserPrompt('INSTR', 'hi', 'Mail')
    expect(prompt).toContain('dictating into "Mail"')
    expect(prompt).toContain('Format appropriately')
    expect(prompt).toContain('Transcript:\nhi')
  })
})

describe('cleanupTranscript', () => {
  beforeEach(() => {
    mockAdjust.mockClear()
    mockAdjust.mockResolvedValue('cleaned text')
  })

  it('passes the active app into the LLM prompt', async () => {
    await cleanupTranscript('hello there', 'light', settings, 'Slack')
    expect(mockAdjust).toHaveBeenCalledTimes(1)
    expect((mockAdjust.mock.calls[0] as any)[0]).toContain(
      'dictating into "Slack"',
    )
  })

  it('returns the raw transcript for verbatim without calling the LLM', async () => {
    const out = await cleanupTranscript('hello there', 'verbatim', settings)
    expect(out).toBe('hello there')
    expect(mockAdjust).not.toHaveBeenCalled()
  })

  it('returns empty/whitespace transcripts unchanged', async () => {
    expect(await cleanupTranscript('   ', 'light', settings)).toBe('   ')
    expect(mockAdjust).not.toHaveBeenCalled()
  })

  it('runs the LLM for light/heavy and returns the cleaned text', async () => {
    mockAdjust.mockResolvedValueOnce('Polished sentence.')
    const out = await cleanupTranscript('uh hello', 'light', settings)
    expect(out).toBe('Polished sentence.')
    expect(mockAdjust).toHaveBeenCalledTimes(1)
  })

  it('falls back to the raw transcript on an LLM error', async () => {
    mockAdjust.mockRejectedValueOnce(new Error('llm down'))
    const out = await cleanupTranscript('hello', 'heavy', settings)
    expect(out).toBe('hello')
  })

  it('falls back to the raw transcript when the LLM returns empty output', async () => {
    mockAdjust.mockResolvedValueOnce('   ')
    const out = await cleanupTranscript('hello', 'light', settings)
    expect(out).toBe('hello')
  })
})
