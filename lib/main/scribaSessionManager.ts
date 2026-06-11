import { ScribaMode } from '@/app/generated/scriba_pb'
import { clipboard } from 'electron'
import { voiceInputService } from './voiceInputService'
import { recordingStateNotifier } from './recordingStateNotifier'
import { scribaStreamController } from './scribaStreamController'
import { TextInserter } from './text/TextInserter'
import { interactionManager } from './interactions/InteractionManager'
import { contextGrabber } from './context/ContextGrabber'
import { GrammarRulesService } from './grammar/GrammarRulesService'
import { getAdvancedSettings, getSnippets } from './store'
import { expandSnippets } from '../utils/snippets'
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
  private isStarting = false
  // Resolves when an in-flight startSession finishes its setup. cancel/complete
  // await this so a fast key-up can't tear down a session whose start hasn't yet
  // assigned `streamResponsePromise` (which would otherwise orphan the recording).
  private startPromise: Promise<void> | null = null

  public async startSession(mode: ScribaMode) {
    // Re-entrancy guard: ignore overlapping start requests (a rapid hotkey
    // re-press, or the hotkey racing the manual pill click) during the async
    // setup window, so we never create two interactions / two recordings for
    // one dictation. The flag is held only for the duration of setup and is
    // always released via `finally`, so a lost key-up can't permanently lock
    // out future sessions.
    if (this.isStarting) {
      console.warn(
        '[scribaSessionManager] startSession ignored: a start is already in progress',
      )
      return
    }
    this.isStarting = true
    // Expose the in-flight start so a concurrent stop can wait for it. Assigned
    // synchronously (before the first await) so the very next event sees it.
    let releaseStart: () => void = () => {}
    this.startPromise = new Promise<void>(resolve => {
      releaseStart = resolve
    })
    try {
      console.log('[scribaSessionManager] Starting session with mode:', mode)

      // Reuse existing global interaction ID if present, otherwise create a new one
      let interactionId = interactionManager.getCurrentInteractionId()
      const createdInteraction = !interactionId
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
        log.error(
          '[scribaSessionManager] Failed to initialize scribaStreamController',
        )
        // Roll back the interaction we just created so it doesn't dangle and
        // get adopted by an unrelated future session.
        if (createdInteraction) {
          interactionManager.clearCurrentInteraction()
        }
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
    } finally {
      this.isStarting = false
      this.startPromise = null
      releaseStart()
    }
  }

  /**
   * If a startSession is mid-flight, wait for it to finish so we observe its
   * `streamResponsePromise` before taking ownership of teardown. No-op when no
   * start is in progress (the common case), so it adds nothing to the hot path.
   */
  private async waitForStartToSettle() {
    if (this.startPromise) {
      await this.startPromise
    }
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

  public async setMode(mode: ScribaMode) {
    // A mode switch can arrive while startSession is still in flight (the
    // activating keys and the mode-switch key can land in the same synchronous
    // key-event batch). Wait for the start to settle so the stream is actually
    // streaming — otherwise scribaStreamController.setMode early-returns and the
    // mode change is silently dropped: the session runs in the wrong mode while
    // the pill shows the other one. Mirrors cancel/complete.
    await this.waitForStartToSettle()

    // Send mode change to grpc stream (will also update windows via recordingStateNotifier)
    scribaStreamController.setMode(mode)

    // Update UI to show the new mode
    recordingStateNotifier.notifyRecordingStarted(mode)

    // EDIT mode rewrites the user's selected text. Context (incl. the selection)
    // was only gathered at startSession in TRANSCRIBE mode, so a mid-session
    // switch into EDIT would run the LLM with stale/empty context. Re-fetch it.
    if (mode === ScribaMode.EDIT) {
      this.fetchAndSendContext().catch(error => {
        log.error(
          '[scribaSessionManager] Failed to refresh context on mode change:',
          error,
        )
      })
    }
  }

  public async cancelSession() {
    // Let any in-flight start finish first, so we don't capture a null
    // streamResponsePromise and silently leave the recording running.
    await this.waitForStartToSettle()

    // Capture the promise in a local variable immediately so new sessions can start
    const responsePromise = this.streamResponsePromise
    this.streamResponsePromise = null

    // If another stop (a completeSession, or a duplicate cancel) already took
    // ownership of this session, do nothing. Re-running teardown here could
    // cancel an in-flight transcription that completeSession is about to handle
    // (dropping a valid transcript) or double-stop the recorder.
    if (!responsePromise) {
      console.log(
        '[scribaSessionManager] cancelSession ignored: no active session to cancel',
      )
      return
    }

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
    // Let any in-flight start finish first, so we observe the streamResponsePromise
    // it assigns instead of capturing null and dropping the dictation.
    await this.waitForStartToSettle()

    // Capture the promise in a local variable immediately so new sessions can start
    const responsePromise = this.streamResponsePromise
    this.streamResponsePromise = null

    // If another stop already took ownership of this session (a duplicate
    // completeSession, or a cancel that already handled it), do nothing —
    // re-running teardown would re-end the stream and toggle the UI twice.
    if (!responsePromise) {
      console.warn(
        '[scribaSessionManager] completeSession ignored: no active session to complete',
      )
      return
    }

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
        // A transient network/stream failure shouldn't lose the dictation: retry
        // once by re-streaming the buffered audio (Wispr's retry-before-giving-up
        // pattern) before surfacing the error. Auth errors are already handled by
        // the gRPC client's token-refresh retry; cancellations are intentional.
        if (this.isTransientError(error)) {
          console.warn(
            '[scribaSessionManager] Transcription failed transiently, retrying once...',
          )
          try {
            const retryResult = await scribaStreamController.retranscribe()
            await this.handleTranscriptionResponse(retryResult)
          } catch (retryError) {
            console.error(
              '[scribaSessionManager] Retry also failed:',
              retryError,
            )
            await this.handleTranscriptionError(retryError)
          }
        } else {
          console.error(
            '[scribaSessionManager] Error waiting for stream response:',
            error,
          )
          await this.handleTranscriptionError(error)
        }
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
      // Give the user visible feedback instead of silently swallowing the failure.
      recordingStateNotifier.notifyError(
        this.friendlyResponseError(response.error),
        response.error.code,
      )
      await interactionManager.createInteraction(
        response.transcript || '',
        audioBuffer,
        sampleRate,
        errorMessage,
        response.error.code,
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

        // Expand voice text-expansion snippets (e.g. "my address" -> the full
        // address) on the final text, verbatim, after grammar.
        const snippets = getSnippets()
        if (snippets.length > 0) {
          textToInsert = expandSnippets(textToInsert, snippets)
        }

        // Await the insertion so an insert failure doesn't silently drop the
        // dictation. If it fails (paste blocked, secure field, focus lost), fall
        // back to the clipboard so the user can still recover the text instead of
        // losing the whole recording — Wispr's graceful-degradation pattern.
        const inserted = await this.textInserter.insertText(textToInsert)
        if (!inserted) {
          try {
            clipboard.writeText(textToInsert)
            recordingStateNotifier.notifyError('Insert failed — copied to clipboard')
          } catch (clipboardError) {
            log.error(
              '[scribaSessionManager] Clipboard fallback failed:',
              clipboardError,
            )
            recordingStateNotifier.notifyError('Insert failed')
          }
        }

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
    // Surface the failure to the user (network/auth/stream errors are otherwise silent).
    recordingStateNotifier.notifyError(this.friendlyExceptionError(error))

    // Clear timing for the interaction on error
    timingCollector.clearInteraction()

    // Clear current interaction on error
    interactionManager.clearCurrentInteraction()
  }

  /** Maps a server-returned protobuf ClientError to a short user-facing message. */
  private friendlyResponseError(error: { code?: string; message?: string }): string {
    switch (error?.code) {
      case 'CLIENT_NO_SPEECH_DETECTED':
        return 'No speech detected'
      case 'CLIENT_AUDIO_TOO_SHORT':
        return 'Recording too short'
      case 'CLIENT_TRANSCRIPTION_QUALITY_ERROR':
        return "Couldn't understand audio"
      case 'CLIENT_UNAVAILABLE':
      case 'CLIENT_API_KEY_ERROR':
      case 'CLIENT_MODEL_ERROR':
        return 'Service unavailable'
      case 'CLIENT_API_ERROR':
        return 'Transcription failed'
      default:
        return error?.message || 'Transcription failed'
    }
  }

  /**
   * True for transient stream failures worth one automatic retry. Excludes auth
   * errors (the gRPC client already refreshes + retries those) and intentional
   * cancellations/aborts (which must not be retried).
   */
  private isTransientError(error: any): boolean {
    const msg = (error?.message || '').toLowerCase()
    if (
      msg.includes('unauthenticated') ||
      msg.includes('unauthorized') ||
      msg.includes('401')
    ) {
      return false
    }
    if (msg.includes('cancel') || msg.includes('abort')) {
      return false
    }
    return (
      msg.includes('network') ||
      msg.includes('fetch failed') ||
      msg.includes('failed to fetch') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('unavailable') ||
      msg.includes('timeout') ||
      msg.includes('socket hang up')
    )
  }

  /** Maps a thrown exception (stream/network/auth) to a short user-facing message. */
  private friendlyExceptionError(error: any): string {
    const msg = (error?.message || '').toLowerCase()
    if (
      msg.includes('unauthenticated') ||
      msg.includes('unauthorized') ||
      msg.includes('401')
    ) {
      return 'Please sign in'
    }
    if (
      msg.includes('network') ||
      msg.includes('fetch failed') ||
      msg.includes('failed to fetch') ||
      msg.includes('econnrefused') ||
      msg.includes('unavailable') ||
      msg.includes('timeout')
    ) {
      return 'Network error'
    }
    return 'Transcription failed'
  }
}

export const scribaSessionManager = new ScribaSessionManager()
