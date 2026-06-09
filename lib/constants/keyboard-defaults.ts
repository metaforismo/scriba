import { ScribaMode } from '@/app/generated/scriba_pb'

// Platform-specific keyboard shortcut defaults
export const SCRIBA_MODE_SHORTCUT_DEFAULTS_MAC = {
  [ScribaMode.TRANSCRIBE]: ['fn'],
  [ScribaMode.EDIT]: ['control-left', 'fn'],
}

export const SCRIBA_MODE_SHORTCUT_DEFAULTS_WIN = {
  [ScribaMode.TRANSCRIBE]: ['control-left', 'command-left'],
  [ScribaMode.EDIT]: ['option-left', 'control-left'],
}

// Helper to detect platform - works in both main and renderer process
export function getPlatform(): 'darwin' | 'win32' {
  if (typeof process !== 'undefined' && process.platform) {
    return process.platform as 'darwin' | 'win32'
  }
  // Fallback if process is not available
  return 'darwin'
}

// Get platform-specific defaults
export function getScribaModeShortcutDefaults(
  platform?: 'darwin' | 'win32',
): Record<ScribaMode, string[]> {
  const currentPlatform = platform || getPlatform()

  if (currentPlatform === 'darwin') {
    return SCRIBA_MODE_SHORTCUT_DEFAULTS_MAC
  } else {
    return SCRIBA_MODE_SHORTCUT_DEFAULTS_WIN
  }
}

// For backward compatibility, export the defaults for the current platform
export const SCRIBA_MODE_SHORTCUT_DEFAULTS = getScribaModeShortcutDefaults()
