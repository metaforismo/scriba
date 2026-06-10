import { audioRecorderService } from '../media/audio'
import { muteSystemAudio, unmuteSystemAudio } from '../media/systemAudio'
import { getPillWindow, mainWindow } from './app'
import store from './store'
import { STORE_KEYS } from '../constants/store-keys'
import { IPC_EVENTS } from '../types/ipc'
import log from 'electron-log'

export class VoiceInputService {
  // Whether THIS session muted the system audio. We unmute based on this, not on
  // the current setting, so toggling `muteAudioWhenDictating` off mid-dictation
  // can't leave the system permanently muted (and toggling it on mid-dictation
  // can't trigger an unmute we never matched with a mute).
  private didMuteSystemAudio = false

  /**
   * Starts audio recording and handles system audio muting.
   * Does NOT start the ScribaStreamController - that should be done separately.
   */
  public startAudioRecording = () => {
    console.log('[VoiceInputService] Starting audio recording')

    const settings = store.get(STORE_KEYS.SETTINGS)
    const deviceId = settings.microphoneDeviceId

    // Mute system audio if needed, and remember that we did so.
    this.didMuteSystemAudio = settings.muteAudioWhenDictating === true
    if (this.didMuteSystemAudio) {
      console.log('[VoiceInputService] Muting system audio for dictation')
      muteSystemAudio()
    }

    // Start audio recorder
    console.log(
      '[VoiceInputService] Starting audio recorder with device:',
      deviceId,
    )
    audioRecorderService.startRecording(deviceId)

    console.log('[VoiceInputService] Audio recording started')
  }

  /**
   * Stops audio recording and handles system audio unmuting.
   * Waits for the audio recorder to drain before returning.
   */
  public stopAudioRecording = async () => {
    console.log('[VoiceInputService] Stopping audio recording')
    audioRecorderService.stopRecording()
    console.log(
      '[VoiceInputService] Audio recorder stopped, waiting for drain...',
    )

    // Wait for explicit drain-complete signal from the recorder (with timeout fallback)
    try {
      await (audioRecorderService as any).awaitDrainComplete?.(500)
      console.log('[VoiceInputService] Drain complete')
    } catch (e) {
      log.warn('[VoiceInputService] drain-complete wait failed, proceeding:', e)
    }

    // Unmute only if we muted at the start of THIS session.
    if (this.didMuteSystemAudio) {
      console.log('[VoiceInputService] Unmuting system audio after dictation')
      unmuteSystemAudio()
      this.didMuteSystemAudio = false
    }

    console.log('[VoiceInputService] Audio recording stopped')
  }

  public setUpAudioRecorderListeners = () => {
    // Note: audio-chunk and audio-config are now handled directly by ScribaStreamController
    // when the gRPC stream starts. VoiceInputService only handles UI-related events.

    audioRecorderService.on('volume-update', volume => {
      getPillWindow()?.webContents.send(IPC_EVENTS.VOLUME_UPDATE, volume)
      if (
        mainWindow &&
        !mainWindow.isDestroyed() &&
        !mainWindow.webContents.isDestroyed()
      ) {
        mainWindow.webContents.send(IPC_EVENTS.VOLUME_UPDATE, volume)
      }
    })

    audioRecorderService.on('error', err => {
      // Handle errors, maybe show a dialog to the user
      log.error('[VoiceInputService] Audio recorder error:', err.message)
    })

    audioRecorderService.initialize()
  }

  /**
   * Call this when microphone selection changes to update the transcription
   * config with the effective output sample rate for the chosen device.
   */
  public handleMicrophoneChanged = (deviceId: string) => {
    audioRecorderService.requestDeviceConfig(deviceId)
  }
}

export const voiceInputService = new VoiceInputService()
