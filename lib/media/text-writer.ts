import { execFile } from 'child_process'
import { clipboard } from 'electron'
import { platform, arch } from 'os'
import { getNativeBinaryPath } from './native-interface'

interface TextWriterOptions {
  delay: number // Delay before typing (milliseconds)
  charDelay: number // Delay between characters (milliseconds)
}

const nativeModuleName = 'text-writer'

// The native binary pastes via the clipboard and exits immediately; the
// user's clipboard is restored here after the target app has had time to
// consume the paste. Keeping the restore in the main process means the
// binary never blocks the dictation hot path.
const CLIPBOARD_RESTORE_DELAY_MS = 1000

let clipboardRestoreTimer: NodeJS.Timeout | null = null
let savedClipboardText = ''

function usesClipboardPaste(): boolean {
  return platform() === 'darwin' || platform() === 'win32'
}

function saveClipboardForRestore(): void {
  if (clipboardRestoreTimer) {
    // A restore is already pending: keep the originally saved contents so
    // back-to-back dictations don't "restore" the previous transcript.
    clearTimeout(clipboardRestoreTimer)
    clipboardRestoreTimer = null
    return
  }
  savedClipboardText = clipboard.readText()
}

function scheduleClipboardRestore(): void {
  clipboardRestoreTimer = setTimeout(() => {
    clipboardRestoreTimer = null
    // Only restore text contents; an empty save means the clipboard held
    // no text (or nothing), and writing '' would clobber non-text contents.
    if (savedClipboardText) {
      clipboard.writeText(savedClipboardText)
    }
    savedClipboardText = ''
  }, CLIPBOARD_RESTORE_DELAY_MS)
}

export function setFocusedText(
  text: string,
  options: TextWriterOptions = { delay: 0, charDelay: 0 },
): Promise<boolean> {
  return new Promise(resolve => {
    const binaryPath = getNativeBinaryPath(nativeModuleName)
    if (!binaryPath) {
      console.error(
        `Cannot determine ${nativeModuleName} binary path for platform ${platform()} and arch ${arch()}`,
      )
      return resolve(false)
    }

    const args: string[] = []

    // Add optional arguments
    if (options.delay !== undefined) {
      args.push('--delay', options.delay.toString())
    }
    if (options.charDelay !== undefined) {
      args.push('--char-delay', options.charDelay.toString())
    }

    // Add the text as the final argument with -- separator to prevent flag parsing
    args.push('--', text)

    if (usesClipboardPaste()) {
      saveClipboardForRestore()
    }

    execFile(binaryPath, args, (err, _stdout, stderr) => {
      if (usesClipboardPaste()) {
        // Restore even on failure: the binary may have replaced the
        // clipboard before erroring out.
        scheduleClipboardRestore()
      }
      if (err) {
        console.error('text-writer error:', stderr)
        return resolve(false)
      }
      resolve(true)
    })
  })
}
