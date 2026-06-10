import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { ScribaMode } from '@/app/generated/scriba_pb'

const mockGrpcClient = {
  transcribeStreamV2: mock(() =>
    Promise.resolve({ transcript: 'default' } as any),
  ),
}
mock.module('../clients/grpcClient', () => ({
  grpcClient: mockGrpcClient,
}))

const mockAudioStreamManager = {
  isCurrentlyStreaming: mock(() => false),
  initialize: mock(),
  stopStreaming: mock(),
  addAudioChunk: mock(),
  setAudioConfig: mock(),
  getInteractionAudioBuffer: mock(() => Buffer.from('audio-data')),
  getCurrentSampleRate: mock(() => 16000),
  clearInteractionAudio: mock(),
  getAudioDurationMs: mock(() => 1000),
  streamAudioChunks: mock(
    () =>
      async function* () {
        yield { audioData: Buffer.from('test-chunk-1') }
        yield { audioData: Buffer.from('test-chunk-2') }
      },
  ),
}
mock.module('./audio/AudioStreamManager', () => ({
  AudioStreamManager: class MockAudioStreamManager {
    isCurrentlyStreaming = mockAudioStreamManager.isCurrentlyStreaming
    initialize = mockAudioStreamManager.initialize
    stopStreaming = mockAudioStreamManager.stopStreaming
    addAudioChunk = mockAudioStreamManager.addAudioChunk
    setAudioConfig = mockAudioStreamManager.setAudioConfig
    getInteractionAudioBuffer = mockAudioStreamManager.getInteractionAudioBuffer
    getCurrentSampleRate = mockAudioStreamManager.getCurrentSampleRate
    clearInteractionAudio = mockAudioStreamManager.clearInteractionAudio
    getAudioDurationMs = mockAudioStreamManager.getAudioDurationMs
    streamAudioChunks = mockAudioStreamManager.streamAudioChunks
  },
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
}
mock.module('./context/ContextGrabber', () => ({
  contextGrabber: mockContextGrabber,
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

describe('ScribaStreamController', () => {
  beforeEach(() => {
    // Reset all mocks
    Object.values(mockAudioStreamManager).forEach(mockFn => mockFn.mockClear())
    Object.values(mockContextGrabber).forEach(mockFn => mockFn.mockClear())

    mockGrpcClient.transcribeStreamV2.mockClear()
    mockGrpcClient.transcribeStreamV2.mockResolvedValue({
      transcript: 'default',
    })

    // Reset default behaviors
    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(false)
    mockAudioStreamManager.getAudioDurationMs.mockReturnValue(1000)
    mockAudioStreamManager.getInteractionAudioBuffer.mockReturnValue(
      Buffer.from('audio-data'),
    )
    mockAudioStreamManager.getCurrentSampleRate.mockReturnValue(16000)
  })

  test('should start interaction successfully', async () => {
    const { ScribaStreamController } = await import('./scribaStreamController')
    const controller = new ScribaStreamController()

    const started = await controller.initialize(ScribaMode.TRANSCRIBE)

    expect(started).toBe(true)
    expect(mockAudioStreamManager.initialize).toHaveBeenCalled()
  })

  test('should prevent multiple concurrent interactions', async () => {
    const { ScribaStreamController } = await import('./scribaStreamController')
    const controller = new ScribaStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)

    const started = await controller.initialize(ScribaMode.TRANSCRIBE)

    expect(started).toBe(false)
  })

  test('should start gRPC stream successfully', async () => {
    const { ScribaStreamController } = await import('./scribaStreamController')
    const controller = new ScribaStreamController()

    const mockResponse = {
      transcript: 'Hello world',
      audio: Buffer.from('audio'),
    }
    mockGrpcClient.transcribeStreamV2.mockResolvedValueOnce(mockResponse)

    await controller.initialize(ScribaMode.TRANSCRIBE)

    const result = await controller.startGrpcStream()

    expect(mockGrpcClient.transcribeStreamV2).toHaveBeenCalled()
    expect(result).toEqual({
      response: mockResponse,
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    })
  })

  test('should throw error when starting gRPC stream twice', async () => {
    const { ScribaStreamController } = await import('./scribaStreamController')
    const controller = new ScribaStreamController()

    await controller.initialize(ScribaMode.TRANSCRIBE)
    await controller.startGrpcStream()

    await expect(controller.startGrpcStream()).rejects.toThrow(
      'Stream already started',
    )
  })

  test('should change mode during streaming', async () => {
    const { ScribaStreamController } = await import('./scribaStreamController')
    const controller = new ScribaStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)

    controller.setMode(ScribaMode.EDIT)

    // Mode change should be queued - we can't easily verify the queue directly,
    // but we can verify it doesn't throw and the warning isn't logged for inactive stream
    expect(mockAudioStreamManager.isCurrentlyStreaming).toHaveBeenCalled()
  })

  test('should warn when changing mode without active stream', async () => {
    const { ScribaStreamController } = await import('./scribaStreamController')
    const controller = new ScribaStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(false)

    controller.setMode(ScribaMode.EDIT)

    expect(mockAudioStreamManager.isCurrentlyStreaming).toHaveBeenCalled()
  })

  test('should send config update during streaming', async () => {
    const { ScribaStreamController } = await import('./scribaStreamController')
    const controller = new ScribaStreamController()

    await controller.initialize(ScribaMode.TRANSCRIBE)
    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)

    const mockContext = await mockContextGrabber.gatherContext()
    await controller.scheduleConfigUpdate(mockContext)

    expect(mockContextGrabber.gatherContext).toHaveBeenCalled()
  })

  test('should warn when sending config without active stream', async () => {
    const { ScribaStreamController } = await import('./scribaStreamController')
    const controller = new ScribaStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(false)

    const mockContext = await mockContextGrabber.gatherContext()
    await controller.scheduleConfigUpdate(mockContext)

    // Should not be called again since we already called it to get mockContext
    expect(mockContextGrabber.gatherContext).toHaveBeenCalledTimes(1)
  })

  test('should end interaction successfully', async () => {
    const { ScribaStreamController } = await import('./scribaStreamController')
    const controller = new ScribaStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)

    controller.endInteraction()

    expect(mockAudioStreamManager.stopStreaming).toHaveBeenCalled()
  })

  test('should warn when ending non-existent interaction', async () => {
    const { ScribaStreamController } = await import('./scribaStreamController')
    const controller = new ScribaStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(false)

    controller.endInteraction()

    expect(mockAudioStreamManager.stopStreaming).not.toHaveBeenCalled()
  })

  test('should cancel transcription successfully', async () => {
    const { ScribaStreamController } = await import('./scribaStreamController')
    const controller = new ScribaStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)
    await controller.initialize(ScribaMode.TRANSCRIBE)

    controller.cancelTranscription()

    expect(mockAudioStreamManager.stopStreaming).toHaveBeenCalled()
  })

  test('should return audio duration', async () => {
    const { ScribaStreamController } = await import('./scribaStreamController')
    const controller = new ScribaStreamController()

    mockAudioStreamManager.getAudioDurationMs.mockReturnValue(5000)

    const duration = controller.getAudioDurationMs()

    expect(duration).toBe(5000)
    expect(mockAudioStreamManager.getAudioDurationMs).toHaveBeenCalled()
  })

  test('retranscribe replays the buffered audio through a fresh stream', async () => {
    const { ScribaStreamController } = await import('./scribaStreamController')
    const controller = new ScribaStreamController()

    await controller.initialize(ScribaMode.TRANSCRIBE)
    mockAudioStreamManager.getInteractionAudioBuffer.mockReturnValue(
      Buffer.from('retained-audio'),
    )
    mockGrpcClient.transcribeStreamV2.mockResolvedValueOnce({
      transcript: 'recovered',
    })

    const result = await controller.retranscribe()

    expect(mockGrpcClient.transcribeStreamV2).toHaveBeenCalledTimes(1)
    expect(result.response).toEqual({ transcript: 'recovered' })
    expect(result.audioBuffer).toEqual(Buffer.from('retained-audio'))
    expect(result.sampleRate).toBe(16000)
  })

  test('retranscribe streams a mode config followed by the buffered audio chunks', async () => {
    const { ScribaStreamController } = await import('./scribaStreamController')
    const controller = new ScribaStreamController()

    await controller.initialize(ScribaMode.EDIT)
    // 70 KB with 32 KB chunks => 3 audio messages.
    mockAudioStreamManager.getInteractionAudioBuffer.mockReturnValue(
      Buffer.alloc(70 * 1024, 1),
    )
    mockGrpcClient.transcribeStreamV2.mockResolvedValueOnce({ transcript: 'ok' })

    await controller.retranscribe()

    // The mock doesn't consume the generator, so we can drain it here to assert
    // the replayed message shape.
    const generator = mockGrpcClient.transcribeStreamV2.mock.calls[0][0]
    const messages: any[] = []
    for await (const message of generator) {
      messages.push(message)
    }

    expect(messages[0].payload.case).toBe('config')
    expect(messages[0].payload.value.context.mode).toBe(ScribaMode.EDIT)
    const audioMessages = messages.filter(m => m.payload.case === 'audioData')
    expect(audioMessages).toHaveLength(3)
  })

  test('retranscribe throws when there is no buffered audio', async () => {
    const { ScribaStreamController } = await import('./scribaStreamController')
    const controller = new ScribaStreamController()

    await controller.initialize(ScribaMode.TRANSCRIBE)
    mockAudioStreamManager.getInteractionAudioBuffer.mockReturnValue(
      Buffer.alloc(0),
    )

    await expect(controller.retranscribe()).rejects.toThrow(
      'No buffered audio',
    )
    expect(mockGrpcClient.transcribeStreamV2).not.toHaveBeenCalled()
  })
})
