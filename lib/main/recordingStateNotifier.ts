import { ScribaMode } from '@/app/generated/scriba_pb'
import { getPillWindow, mainWindow } from './app'
import {
  IPC_EVENTS,
  RecordingStatePayload,
  ProcessingStatePayload,
  ErrorStatePayload,
} from '../types/ipc'

/**
 * Helper class to notify UI windows about recording state changes.
 */
export class RecordingStateNotifier {
  public notifyRecordingStarted(mode: ScribaMode) {
    console.log('[RecordingStateNotifier] Notifying recording started:', {
      mode,
    })
    this.sendToWindows(IPC_EVENTS.RECORDING_STATE_UPDATE, {
      isRecording: true,
      mode,
    })
  }

  public notifyRecordingStopped() {
    console.log('[RecordingStateNotifier] Notifying recording stopped')
    this.sendToWindows(IPC_EVENTS.RECORDING_STATE_UPDATE, {
      isRecording: false,
    })
  }

  public notifyProcessingStarted() {
    console.log('[RecordingStateNotifier] Notifying processing started')
    this.sendToWindows(IPC_EVENTS.PROCESSING_STATE_UPDATE, {
      isProcessing: true,
    })
  }

  public notifyProcessingStopped() {
    console.log('[RecordingStateNotifier] Notifying processing stopped')
    this.sendToWindows(IPC_EVENTS.PROCESSING_STATE_UPDATE, {
      isProcessing: false,
    })
  }

  /**
   * Notify the UI that a dictation failed so the user gets visible feedback
   * instead of silence (no speech, network/API error, not signed in, etc.).
   */
  public notifyError(message: string, code?: string) {
    console.log('[RecordingStateNotifier] Notifying error:', { message, code })
    this.sendToWindows(IPC_EVENTS.ERROR_STATE_UPDATE, { message, code })
  }

  private sendToWindows(
    event: string,
    payload:
      | RecordingStatePayload
      | ProcessingStatePayload
      | ErrorStatePayload,
  ) {
    // Send to pill window
    getPillWindow()?.webContents.send(event, payload)

    // Send to main window if it exists and is not destroyed
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      !mainWindow.webContents.isDestroyed()
    ) {
      mainWindow.webContents.send(event, payload)
    }
  }
}

export const recordingStateNotifier = new RecordingStateNotifier()
