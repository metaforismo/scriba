# Scriba for iOS

A native Swift voice-dictation **keyboard** for iOS — Wispr-Flow-style. Hold the
🌐 globe, switch to Scriba, tap the 🎙 mic, speak, and your words are inserted
into whatever app you're in.

## Architecture

Two targets plus a shared layer, managed with [XcodeGen](https://github.com/yonaskolb/XcodeGen)
(`project.yml`) so the project is reviewable as plain YAML:

```
ios/
  project.yml                 # XcodeGen spec (app + keyboard-extension targets)
  Shared/                     # compiled into both targets
    BackendConfig.swift       # backend URL (configurable; not hardcoded to prod)
    CleanupLevel.swift        # verbatim | light | heavy (matches desktop)
    TokenStore.swift          # shared-Keychain auth token (app ⇄ keyboard)
    TranscriptionClient.swift # POSTs audio to /v1/transcribe
  Scriba/                     # container app (SwiftUI)
    App/                      # @main, root, AuthManager
    Onboarding/               # "enable the keyboard" walkthrough
    Settings/                 # sign-in, cleanup level, backend URL
  ScribaKeyboard/             # keyboard extension
    KeyboardViewController.swift  # UIInputViewController host + text insertion
    KeyboardView.swift            # SwiftUI keyboard (mic, waveform, utility row)
    AudioRecorder.swift           # AVAudioEngine → 16 kHz mono WAV + level
    DictationController.swift      # record → transcribe → insert state machine
```

**Flow:** the keyboard records a short utterance with `AVAudioEngine`, converts
it to 16 kHz mono WAV, and POSTs it (base64) to the server's `POST /v1/transcribe`
endpoint (added in `server/src/services/mobileTranscription.ts`). The transcript
comes back and is inserted at the cursor via `textDocumentProxy`. Keyboard
extensions have tight memory/lifecycle limits, so record-then-POST is more robust
than holding a bidirectional gRPC stream — live streaming is a follow-up.

## Requirements

- Xcode 15+, iOS 17+
- [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`
- An Apple Developer account (keyboard extensions with Full Access need a real
  device + provisioning; App Groups + a shared Keychain group must be enabled).

## Build & run

```bash
cd ios
xcodegen generate          # creates Scriba.xcodeproj from project.yml
open Scriba.xcodeproj
```

In Xcode: set your Team on both targets, then run the **Scriba** app on a device.

To enable the keyboard (the app walks you through this too):
1. Settings ▸ General ▸ Keyboard ▸ Keyboards ▸ Add New Keyboard… ▸ **Scriba**
2. Tap **Scriba** ▸ enable **Allow Full Access** (required for mic + network)
3. Grant the microphone permission in the Scriba app
4. In any app: hold 🌐 ▸ choose **Scriba** ▸ tap 🎙 to dictate

## Configuration

- **Backend URL:** set in the app's Settings tab (stored in the shared App Group),
  or via a `SCRIBA_BACKEND_URL` Info.plist value. Defaults to `http://localhost:3000`.
- **App Group / Keychain:** `group.ai.scriba.shared` and the
  `<TeamPrefix>.ai.scriba.shared` keychain group must be enabled on both targets
  (already declared in the `.entitlements` files).

## Status / TODO

This is a working **foundation**, not yet a shippable app. Known follow-ups:

- [ ] Real **Auth0 sign-in** (`ASWebAuthenticationSession` against the server's
      `/login` route + token refresh). Today Settings accepts a pasted dev token.
- [ ] **Live streaming** transcription (interim results) instead of record-then-POST.
- [ ] App icon + launch assets, haptics, and press-and-hold-to-dictate.
- [ ] Auto-fallback to the system keyboard for secure/number/email fields.
- [ ] On-device testing on real hardware (the extension's mic + Full Access can't
      be exercised in this repo's CI environment).
