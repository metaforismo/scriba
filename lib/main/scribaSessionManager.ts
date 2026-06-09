import { ScribaMode } from '@/app/generated/scriba_pb'
import { voiceInputService } from './voiceInputService'
import { recordingStateNotifier } from './recordingStateNotifier'
import { scribaStreamController } from './scribaStreamController'
import { TextInserter } from './text/TextInserter'
import { interactionManager } from './interactions/InteractionManager'
import { contextGrabber } from './context/ContextGrabber'
import { GrammarRulesService } from './grammar/GrammarRulesService'
import { getAdvancedSettings } from './store'
import log from 'electron-log'
import { timingCollector, TimingEventName } from './timing/TimingCollector'

export class ScribaSessionManager {
  private readonly MINIMUM_AUDIO_DURATION_MS = 100
  private textInserter = new TextInserter()
  private streamResponsePromise: Promise<{
    response: any
    audioBuffer: Buffer
    sampleRate: number
  }> | null = null
  private grammarRulesService = new GrammarRulesService('')

  public async startSession(mode: ScribaMode) {
    console.log('[scribaSessionManager] Starting session with mode:', mode)

    // Reuse existing global interaction ID if present, otherwise create a new one
    let interactionId = interactionManager.getCurrentInteractionId()
    if (interactionId) {
      console.log(
        '[scribaSessionManager] Reusing existing interaction ID:',
        interactionId,
      )
      interactionManager.adoptInteractionId(interactionId)
    } else {
      interactionId = interactionManager.initialize()
    }

    // Initialize all necessary components
    const started = await scribaStreamController.initialize(mode)
    if (!started) {
      log.error('[scribaSessionManager] Failed to initialize scribaStreamController')
      return
    }

    // Begin gRPC stream immediately (note, no audio is flowing yet)
    this.streamResponsePromise = scribaStreamController.startGrpcStream()

    // Begin recording audio (audio bytes will now flow into the gRPC stream)
    voiceInputService.startAudioRecording()

    // Send initial mode to the stream
    scribaStreamController.setMode(mode)

    // Update UI state
    recordingStateNotifier.notifyRecordingStarted(mode)

    // Fetch and send context in the background (non-blocking)
    this.fetchAndSendContext().catch(error => {
      log.error('[scribaSessionManager] Failed to fetch/send context:', error)
    })

    // Start timing the interaction
    timingCollector.startInteraction()
    timingCollector.startTiming(TimingEventName.INTERACTION_ACTIVE)

    return interactionId
  }

  private async fetchAndSendContext() {
    console.log('[scribaSessionManager] Gathering context...')

    // Gather all context data (window, app, selected text, vocabulary, settings)
    const context = await contextGrabber.gatherContext(
      scribaStreamController.getCurrentMode(),
    )

    // Send the gathered context to the stream controller
    await scribaStreamController.scheduleConfigUpdate(context)

    // Fetch cursor context for grammar rules only if grammar service is enabled
    const { grammarServiceEnabled } = getAdvancedSettings()
    if (grammarServiceEnabled) {
      const cursorContext = await timingCollector.timeAsync(
        TimingEventName.GRAMMAR_SERVICE,
        async () => await contextGrabber.getCursorContextForGrammar(),
      )
      this.grammarRulesService = new GrammarRulesService(cursorContext)
    }
  }

  public setMode(mode: ScribaMode) {
    // Send mode change to grpc stream (will also update windows via recordingStateNotifier)
    scribaStreamController.setMode(mode)

    // Update UI to show the new mode
    recordingStateNotifier.notifyRecordingStarted(mode)
  }

  public async cancelSession() {
    // Capture the promise in a local variable immediately so new sessions can start
    const responsePromise = this.streamResponsePromise
    this.streamResponsePromise = null

    // Clear timing for the interaction on cancel
    timingCollector.clearInteraction()

    // Cancel the transcription (will not create interaction)
    scribaStreamController.cancelTranscription()
    interactionManager.clearCurrentInteraction()

    // Stop audio recording
    await voiceInputService.stopAudioRecording()

    // Update UI state
    recordingStateNotifier.notifyRecordingStopped()

    // Wait for the stream promise to reject with cancellation error
    if (responsePromise) {
      try {
        await responsePromise
      } catch (error) {
        // Expected cancellation error, log and ignore
        console.log('[scribaSessionManager] Stream cancelled as expected:', error)
      }
    }
  }

  public async completeSession() {
    // Capture the promise in a local variable immediately so new sessions can start
    const responsePromise = this.streamResponsePromise
    this.streamResponsePromise = null

    // End timing for the interaction
    timingCollector.endTiming(TimingEventName.INTERACTION_ACTIVE)

    // Stop audio recording and wait for drain
    await voiceInputService.stopAudioRecording()

    // Check actual audio duration (keyboard duration can be misleading due to latency)
    const audioDurationMs = scribaStreamController.getAudioDurationMs()

    if (audioDurationMs < this.MINIMUM_AUDIO_DURATION_MS) {
      console.log(
        `[scribaSessionManager] Audio too short (${audioDurationMs}ms < ${this.MINIMUM_AUDIO_DURATION_MS}ms), cancelling`,
      )
      scribaStreamController.cancelTranscription()
      recordingStateNotifier.notifyRecordingStopped()

      // Wait for the stream promise to reject with cancellation error
      if (responsePromise) {
        try {
          await responsePromise
        } catch (error) {
          // Expected cancellation error, log and ignore
          console.log(
            '[scribaSessionManager] Stream cancelled as expected:',
            error,
          )
        }
      }
      return
    }

    // End the interaction (this will complete the gRPC stream)
    scribaStreamController.endInteraction()

    // Update UI state
    recordingStateNotifier.notifyRecordingStopped()

    // Notify processing started
    recordingStateNotifier.notifyProcessingStarted()

    // Wait for the stream response and handle it
    if (responsePromise) {
      console.log(
        '[scribaSessionManager] Waiting for stream response from server...',
      )
      try {
        const result = await responsePromise
        console.log('[scribaSessionManager] Received stream response:', {
          hasTranscript: !!result.response?.transcript,
          transcriptLength: result.response?.transcript?.length || 0,
          hasError: !!result.response?.error,
          audioBufferSize: result.audioBuffer.length,
        })
        await this.handleTranscriptionResponse(result)
      } catch (error) {
        console.error(
          '[scribaSessionManager] Error waiting for stream response:',
          error,
        )
        await this.handleTranscriptionError(error)
      } finally {
        // Always notify processing stopped after handling response
        recordingStateNotifier.notifyProcessingStopped()
      }
    } else {
      console.warn('[scribaSessionManager] No stream response promise to wait for')
      recordingStateNotifier.notifyProcessingStopped()
    }
  }

  private async handleTranscriptionResponse(result: {
    response: any
    audioBuffer: Buffer
    sampleRate: number
  }) {
    const { response, audioBuffer, sampleRate } = result

    const errorMessage = response.error ? response.error.message : undefined

    // Handle any transcription error
    if (response.error) {
      await interactionManager.createInteraction(
        response.transcript || '',
        audioBuffer,
        sampleRate,
        errorMessage,
      )
      timingCollector.clearInteraction()
      interactionManager.clearCurrentInteraction()
    } else {
      // Handle text insertion with grammar-corrected text
      if (response.transcript && !response.error) {
        let textToInsert = response.transcript

        // Apply grammar rules only if grammar service is enabled
        const { grammarServiceEnabled } = getAdvancedSettings()
        if (grammarServiceEnabled) {
          textToInsert = this.grammarRulesService.setCaseFirstWord(textToInsert)
          textToInsert =
            this.grammarRulesService.addLeadingSpaceIfNeeded(textToInsert)
        }

        this.textInserter.insertText(textToInsert)

        // Create interaction in database
        await interactionManager.createInteraction(
          response.transcript,
          audioBuffer,
          sampleRate,
          errorMessage,
        )
      } else {
        log.warn('[scribaSessionManager] Skipping text insertion:', {
          hasTranscript: !!response.transcript,
          transcriptLength: response.transcript?.length || 0,
          hasError: !!response.error,
        })
      }
      timingCollector.finalizeInteraction()
      interactionManager.clearCurrentInteraction()
      scribaStreamController.clearInteractionAudio()
    }
  }

  private async handleTranscriptionError(error: any) {
    log.error(
      '[scribaSessionManager] An unexpected error occurred during transcription:',
      error,
    )
    // Clear timing for the interaction on error
    timingCollector.clearInteraction()

    // Clear current interaction on error
    interactionManager.clearCurrentInteraction()
  }
}

export const scribaSessionManager = new ScribaSessionManager()
