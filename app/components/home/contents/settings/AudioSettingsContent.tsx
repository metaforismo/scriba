import { Switch } from '@/app/components/ui/switch'
import { MicrophoneSelector } from '@/app/components/ui/microphone-selector'
import { useSettingsStore } from '@/app/store/useSettingsStore'
import { usePlatform } from '@/app/hooks/usePlatform'

export default function AudioSettingsContent() {
  const {
    microphoneDeviceId,
    microphoneName,
    // interactionSounds,
    muteAudioWhenDictating,
    setMicrophoneDeviceId,
    // setInteractionSounds,
    setMuteAudioWhenDictating,
  } = useSettingsStore()
  const platform = usePlatform()

  return (
    <div className="space-y-8">
      <div>
        <div className="space-y-6">
          {/* <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Interaction Sounds</div>
              <div className="text-xs text-gray-600 mt-1">
                Play a sound when Scriba starts and stops recording.
              </div>
            </div>
            <Switch
              checked={interactionSounds}
              onCheckedChange={setInteractionSounds}
            />
          </div> */}

          {/* System-audio mute is implemented via osascript (macOS only);
              hide the toggle elsewhere instead of showing a silent no-op. */}
          {platform === 'darwin' && (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">
                  Mute audio when dictating
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Automatically silence other active audio during dictation.
                </div>
              </div>
              <Switch
                checked={muteAudioWhenDictating}
                onCheckedChange={setMuteAudioWhenDictating}
              />
            </div>
          )}

          <div className="flex justify-between">
            <div>
              <div className="text-sm font-medium mb-2">
                Select default microphone
              </div>
              <div className="text-xs text-gray-600 mt-1">
                Select the microphone Scriba will use by default for audio
                input.
              </div>
            </div>
            <MicrophoneSelector
              selectedDeviceId={microphoneDeviceId}
              selectedMicrophoneName={microphoneName}
              onSelectionChange={setMicrophoneDeviceId}
              triggerButtonVariant="outline"
              triggerButtonClassName=""
            />
          </div>
        </div>
      </div>
    </div>
  )
}
