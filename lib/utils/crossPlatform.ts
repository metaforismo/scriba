import { systemPreferences } from 'electron'

/**
 * Cross-platform utility functions for handling OS-specific functionality
 */

/**
 * Checks if the app has accessibility permissions
 * On macOS: Uses systemPreferences.isTrustedAccessibilityClient()
 * On Windows: Returns true (no accessibility permissions required)
 */
export function checkAccessibilityPermission(prompt: boolean = false): boolean {
  if (process.platform === 'darwin') {
    return systemPreferences.isTrustedAccessibilityClient(prompt)
  }

  // On Windows, accessibility permissions aren't required
  return true
}

/**
 * Checks if the app has microphone permissions
 * Cross-platform implementation using systemPreferences
 */
export async function checkMicrophonePermission(
  prompt: boolean = false,
): Promise<boolean> {
  if (process.platform === 'darwin') {
    // macOS - use system preferences API
    if (prompt) {
      return systemPreferences.askForMediaAccess('microphone')
    }
    return systemPreferences.getMediaAccessStatus('microphone') === 'granted'
  }

  if (process.platform === 'win32') {
    // Windows can't prompt programmatically, but getMediaAccessStatus reflects
    // the Settings → Privacy → Microphone toggle. Without this check a denied
    // mic silently records nothing. 'not-determined' counts as granted because
    // Windows only reports 'denied' once the user has actively disabled it.
    const status = systemPreferences.getMediaAccessStatus('microphone')
    return status === 'granted' || status === 'not-determined'
  }

  // Linux: no permission API; assume granted.
  return true
}
