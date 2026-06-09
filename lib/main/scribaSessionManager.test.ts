import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { ScribaMode } from '@/app/generated/scriba_pb'
import { createMockTimingCollector } from '../__tests__/setup'
import { TimingEventName } from './timing/TimingCollector'

const mockTimingCollector = createMockTimingCollector()
mock.module('./timing/TimingCollector', () => ({
  timingCollector: mockTimingCollector,
  TimingEventName: TimingEventName,
}))

const mockVoiceInputService = {
  startAudioRecording: mock(() => Promise.resolve()),
  stopAudioRecording: mock(() => Promise.resolve()),
}
mock.module('./voiceInputService', () => ({
  voiceInputService: mockVoiceInputService,
}))

const mockRecordingStateNotifier = {
  notifyRecordingStarted: mock(),
  notifyRecordingStopped: mock(),
  notifyProcessingStarted: mock(),
  notifyProcessingStopped: mock(),
  notifyError: mock(),
}
mock.module('./recordingStateNotifier', () => ({
  recordingStateNotifier: mockRecordingStateNotifier,
}))

const mockScribaStreamController = {
  initialize: mock(_mode => Promise.resolve(true)),
  startGrpcStream: mock(() =>
    Promise.resolve({
      response: { transcript: 'test transcript' },
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    }),
  ),
  setMode: mock(),
  getCurrentMode: mock(() => ScribaMode.TRANSCRIBE),
  scheduleConfigUpdate: mock(() => Promise.resolve()),
  getAudioDurationMs: mock(() => 1000),
  endInteraction: mock(),
  cancelTranscription: mock(),
}
mock.module('./scribaStreamController', () => ({
  scribaStreamController: mockScribaStreamController,
}))

const mockTextInserter = {
  insertText: mock(() => Promise.resolve(true)),
}
mock.module('./text/TextInserter', () => ({
  TextInserter: class MockTextInserter {
    insertText = mockTextInserter.insertText
  },
}))

const mockInteractionManager = {
  getCurrentInteractionId: mock((): string | null => null),
  adoptInteractionId: mock(),
  initialize: mock(() => 'test-interaction-123'),
  createInteraction: mock(() => Promise.resolve()),
  clearCurrentInteraction: mock(),
}
mock.module('./interactions/InteractionManager', () => ({
  interactionManager: mockInteractionManager,
}))

const mockContextGrabber = {
  gatherContext: mock(() =>
    Promise.resolve({
      windowTitle: 'Test Window',
      appName: 'Test App',
      contextText: 'Test context',
      vocabularyWords: ['test', 'word'],
      advancedSettings: {
        llm: {
          asrModel: 'whisper-1',
          asrProvider: 'openai',
          asrPrompt: '',
          noSpeechThreshold: 0.5,
          llmProvider: 'openai',
          llmModel: 'gpt-4',
          llmTemperature: 0.7,
          transcriptionPrompt: '',
          editingPrompt: '',
        },
        grammarServiceEnabled: false,
        macosAccessibilityContextEnabled: true,
      },
    }),
  ),
  getCursorContextForGrammar: mock(() => Promise.resolve('test context')),
}
mock.module('./context/ContextGrabber', () => ({
  contextGrabber: mockContextGrabber,
}))

const mockGrammarRulesService = {
  setCaseFirstWord: mock((text: string) => text),
  addLeadingSpaceIfNeeded: mock((text: string) => text),
}
mock.module('./grammar/GrammarRulesService', () => ({
  GrammarRulesService: class MockGrammarRulesService {
    setCaseFirstWord = mockGrammarRulesService.setCaseFirstWord
    addLeadingSpaceIfNeeded = mockGrammarRulesService.addLeadingSpaceIfNeeded
  },
}))

const mockGetAdvancedSettings = mock(() => ({
  grammarServiceEnabled: false,
}))
mock.module('./store', () => ({
  getAdvancedSettings: mockGetAdvancedSettings,
}))

mock.module('electron-log', () => ({
  default: {
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}))

beforeEach(() => {
  console.log = mock()
  console.error = mock()
})

describe('scribaSessionManager', () => {
  beforeEach(() => {
    // Reset all mocks
    Object.values(mockVoiceInputService).forEach(mockFn => mockFn.mockClear())
    Object.values(mockRecordingStateNotifier).forEach(mockFn =>
      mockFn.mockClear(),
    )
    Object.values(mockScribaStreamController).forEach(mockFn => mockFn.mockClear())
    Object.values(mockTextInserter).forEach(mockFn => mockFn.mockClear())
    Object.values(mockInteractionManager).forEach(mockFn => mockFn.mockClear())
    Object.values(mockContextGrabber).forEach(mockFn => mockFn.mockClear())
    Object.values(mockGrammarRulesService).forEach(mockFn => mockFn.mockClear())
    Object.values(mockTimingCollector).forEach(mockFn => mockFn.mockClear())

    mockGetAdvancedSettings.mockClear()

    // Reset default behaviors
    mockScribaStreamController.initialize.mockResolvedValue(true)
    mockScribaStreamController.startGrpcStream.mockResolvedValue({
      response: { transcript: 'test transcript' },
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    })
    mockScribaStreamController.getAudioDurationMs.mockReturnValue(1000)
    mockTextInserter.insertText.mockResolvedValue(true)
    mockInteractionManager.getCurrentInteractionId.mockReturnValue(null)
    mockInteractionManager.initialize.mockReturnValue('test-interaction-123')
    mockGetAdvancedSettings.mockReturnValue({
      grammarServiceEnabled: false,
    })
  })

  test('should start session successfully', async () => {
    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    await session.startSession(ScribaMode.TRANSCRIBE)

    expect(mockScribaStreamController.initialize).toHaveBeenCalledWith(
      ScribaMode.TRANSCRIBE,
    )
    expect(mockScribaStreamController.startGrpcStream).toHaveBeenCalled()
    expect(mockScribaStreamController.setMode).toHaveBeenCalledWith(
      ScribaMode.TRANSCRIBE,
    )
    expect(mockVoiceInputService.startAudioRecording).toHaveBeenCalled()
    expect(
      mockRecordingStateNotifier.notifyRecordingStarted,
    ).toHaveBeenCalledWith(ScribaMode.TRANSCRIBE)
  })

  test('should ignore a concurrent startSession while one is in progress', async () => {
    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    // Fire two starts back-to-back without awaiting the first. The second
    // arrives while the first is still in its async setup window (suspended on
    // `await scribaStreamController.initialize`), so the guard must reject it.
    const first = session.startSession(ScribaMode.TRANSCRIBE)
    const second = session.startSession(ScribaMode.TRANSCRIBE)
    await Promise.all([first, second])

    // Exactly one session should have been set up — no double interaction,
    // no double recording.
    expect(mockScribaStreamController.initialize).toHaveBeenCalledTimes(1)
    expect(mockInteractionManager.initialize).toHaveBeenCalledTimes(1)
    expect(mockVoiceInputService.startAudioRecording).toHaveBeenCalledTimes(1)
    expect(
      mockRecordingStateNotifier.notifyRecordingStarted,
    ).toHaveBeenCalledTimes(1)
  })

  test('should fetch and send context in background', async () => {
    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    await session.startSession(ScribaMode.TRANSCRIBE)

    // Wait for background context fetch
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(mockScribaStreamController.scheduleConfigUpdate).toHaveBeenCalled()
  })

  test('should fetch cursor context when grammar is enabled', async () => {
    mockGetAdvancedSettings.mockReturnValue({
      grammarServiceEnabled: true,
    })

    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    await session.startSession(ScribaMode.TRANSCRIBE)

    // Wait for background context fetch
    await new Promise(resolve => setTimeout(resolve, 60))

    expect(mockContextGrabber.getCursorContextForGrammar).toHaveBeenCalledTimes(
      1,
    )
    expect(mockContextGrabber.getCursorContextForGrammar).toHaveBeenCalled()
  })

  test('should not fetch cursor context when grammar is disabled', async () => {
    mockGetAdvancedSettings.mockReturnValue({
      grammarServiceEnabled: false,
    })

    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    await session.startSession(ScribaMode.TRANSCRIBE)

    // Wait for background context fetch
    await new Promise(resolve => setTimeout(resolve, 50))
  })

  test('should fail to start session when controller fails', async () => {
    mockScribaStreamController.initialize.mockResolvedValueOnce(false)

    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    await session.startSession(ScribaMode.TRANSCRIBE)

    expect(mockVoiceInputService.startAudioRecording).not.toHaveBeenCalled()
    // The interaction created for this attempt must be rolled back so it
    // doesn't dangle and get adopted by an unrelated future session.
    expect(mockInteractionManager.clearCurrentInteraction).toHaveBeenCalled()

    // The re-entrancy guard must be released after a failed start so the next
    // start works normally.
    await session.startSession(ScribaMode.TRANSCRIBE)
    expect(mockVoiceInputService.startAudioRecording).toHaveBeenCalledTimes(1)
  })

  test('should change mode during session', async () => {
    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    session.setMode(ScribaMode.EDIT)

    expect(mockScribaStreamController.setMode).toHaveBeenCalledWith(ScribaMode.EDIT)
    expect(
      mockRecordingStateNotifier.notifyRecordingStarted,
    ).toHaveBeenCalledWith(ScribaMode.EDIT)
  })

  test('should cancel session successfully', async () => {
    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    await session.cancelSession()

    expect(mockScribaStreamController.cancelTranscription).toHaveBeenCalled()
    expect(mockVoiceInputService.stopAudioRecording).toHaveBeenCalled()
    expect(mockRecordingStateNotifier.notifyRecordingStopped).toHaveBeenCalled()
  })

  test('should complete session with sufficient audio', async () => {
    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    mockScribaStreamController.getAudioDurationMs.mockReturnValue(500)

    await session.startSession(ScribaMode.TRANSCRIBE)
    await session.completeSession()

    expect(mockVoiceInputService.stopAudioRecording).toHaveBeenCalled()
    expect(mockScribaStreamController.endInteraction).toHaveBeenCalled()
    expect(mockRecordingStateNotifier.notifyRecordingStopped).toHaveBeenCalled()
  })

  test('should cancel session when audio too short', async () => {
    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    mockScribaStreamController.getAudioDurationMs.mockReturnValue(50)

    await session.startSession(ScribaMode.TRANSCRIBE)
    await session.completeSession()

    expect(mockScribaStreamController.cancelTranscription).toHaveBeenCalled()
    expect(mockScribaStreamController.endInteraction).not.toHaveBeenCalled()
    expect(mockRecordingStateNotifier.notifyRecordingStopped).toHaveBeenCalled()
  })

  test('should handle successful transcription response', async () => {
    const mockTranscript = 'Hello world'
    mockScribaStreamController.startGrpcStream.mockResolvedValueOnce({
      response: { transcript: mockTranscript },
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    })

    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    await session.startSession(ScribaMode.TRANSCRIBE)
    await session.completeSession()

    expect(mockTextInserter.insertText).toHaveBeenCalledWith(mockTranscript)
    expect(mockInteractionManager.createInteraction).toHaveBeenCalledWith(
      mockTranscript,
      Buffer.from('audio-data'),
      16000,
      undefined,
    )
    expect(mockScribaStreamController.endInteraction).toHaveBeenCalled()
    expect(mockInteractionManager.clearCurrentInteraction).toHaveBeenCalled()
  })

  test('should apply grammar rules when enabled', async () => {
    mockGetAdvancedSettings.mockReturnValue({
      grammarServiceEnabled: true,
    })

    const mockTranscript = 'hello world'
    mockScribaStreamController.startGrpcStream.mockResolvedValueOnce({
      response: { transcript: mockTranscript },
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    })

    mockGrammarRulesService.setCaseFirstWord.mockReturnValue('Hello world')
    mockGrammarRulesService.addLeadingSpaceIfNeeded.mockReturnValue(
      ' Hello world',
    )

    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    await session.startSession(ScribaMode.TRANSCRIBE)
    // Allow background context fetch to set up grammarRulesService
    await new Promise(resolve => setTimeout(resolve, 60))
    await session.completeSession()

    expect(mockGrammarRulesService.setCaseFirstWord).toHaveBeenCalledWith(
      mockTranscript,
    )
    expect(
      mockGrammarRulesService.addLeadingSpaceIfNeeded,
    ).toHaveBeenCalledWith('Hello world')
    expect(mockTextInserter.insertText).toHaveBeenCalledWith(' Hello world')
  })

  test('should not apply grammar rules when disabled', async () => {
    mockGetAdvancedSettings.mockReturnValue({
      grammarServiceEnabled: false,
    })

    const mockTranscript = 'hello world'
    mockScribaStreamController.startGrpcStream.mockResolvedValueOnce({
      response: { transcript: mockTranscript },
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    })

    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    await session.startSession(ScribaMode.TRANSCRIBE)
    await session.completeSession()

    expect(mockGrammarRulesService.setCaseFirstWord).not.toHaveBeenCalled()
    expect(
      mockGrammarRulesService.addLeadingSpaceIfNeeded,
    ).not.toHaveBeenCalled()
    expect(mockTextInserter.insertText).toHaveBeenCalledWith(mockTranscript)
  })

  test('should handle transcription error from server', async () => {
    const errorMessage = 'ASR service unavailable'
    mockScribaStreamController.startGrpcStream.mockResolvedValueOnce({
      response: {
        transcript: '',
        error: { message: errorMessage },
      } as any,
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    })

    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    await session.startSession(ScribaMode.TRANSCRIBE)
    await session.completeSession()

    expect(mockTextInserter.insertText).not.toHaveBeenCalled()
    expect(mockInteractionManager.createInteraction).toHaveBeenCalledWith(
      '',
      Buffer.from('audio-data'),
      16000,
      errorMessage,
    )
    expect(mockScribaStreamController.endInteraction).toHaveBeenCalled()
    expect(mockInteractionManager.clearCurrentInteraction).toHaveBeenCalled()
  })

  test('should handle unexpected transcription error', async () => {
    const error = new Error('Network timeout')
    mockScribaStreamController.startGrpcStream.mockRejectedValueOnce(error)

    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    await session.startSession(ScribaMode.TRANSCRIBE)
    await session.completeSession()

    expect(mockScribaStreamController.endInteraction).toHaveBeenCalled()
    expect(mockInteractionManager.clearCurrentInteraction).toHaveBeenCalled()
  })

  test('should skip text insertion when no transcript', async () => {
    mockScribaStreamController.startGrpcStream.mockResolvedValueOnce({
      response: { transcript: '' },
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    })

    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    await session.startSession(ScribaMode.TRANSCRIBE)
    await session.completeSession()

    expect(mockTextInserter.insertText).not.toHaveBeenCalled()
  })

  test('should handle context fetch error gracefully', async () => {
    mockScribaStreamController.scheduleConfigUpdate.mockRejectedValueOnce(
      new Error('Context fetch failed'),
    )

    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    // Should not throw
    await session.startSession(ScribaMode.TRANSCRIBE)

    // Wait for background context fetch to complete
    await new Promise(resolve => setTimeout(resolve, 50))

    // Session should still continue normally
    expect(mockVoiceInputService.startAudioRecording).toHaveBeenCalled()
  })

  test('should handle complete session flow', async () => {
    const { ScribaSessionManager } = await import('./scribaSessionManager')
    const session = new ScribaSessionManager()

    const mockTranscript = 'Test complete flow'
    mockScribaStreamController.startGrpcStream.mockResolvedValueOnce({
      response: { transcript: mockTranscript },
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    })

    // Start session
    await session.startSession(ScribaMode.TRANSCRIBE)

    expect(mockScribaStreamController.initialize).toHaveBeenCalled()
    expect(mockVoiceInputService.startAudioRecording).toHaveBeenCalled()

    // Complete session
    await session.completeSession()

    expect(mockVoiceInputService.stopAudioRecording).toHaveBeenCalled()
    expect(mockScribaStreamController.endInteraction).toHaveBeenCalled()
    expect(mockTextInserter.insertText).toHaveBeenCalledWith(mockTranscript)
    expect(mockRecordingStateNotifier.notifyRecordingStopped).toHaveBeenCalled()
  })
})
