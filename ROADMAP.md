# Scriba — Roadmap & Improvement Backlog

> **Goal:** turn Scriba (forked from `ito`) into a **Wispr Flow–class** AI dictation product:
> a fast, reliable desktop app (macOS + Windows) **and** a mobile app (iOS + Android).
>
> This file is the **persistent memory of the autonomous improvement loop**. Each iteration:
> 1. Read the **Progress Log** (bottom) to see what was done last.
> 2. Pick the next unchecked, highest-value item from the **Backlog**.
> 3. Implement it (small, verifiable, correct-by-inspection — the app can't be run in this env: no `node_modules`, no native builds).
> 4. Update the backlog checkbox + append a Progress Log entry.
> 5. Commit.

## Working constraints
- Environment cannot build/run the Electron app, native Rust binaries (cargo 1.83 lacks `edition2024`), or the Bun server end-to-end. So changes must be **correct by inspection** and, where possible, covered by **unit tests** (`bun test`) updated alongside.
- **iOS is now BUILD- AND TEST-verified** (iters 32–34). Build: `cd ios && xcodegen generate && xcodebuild build -project Scriba.xcodeproj -scheme Scriba -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`. **Tests** (host-less `ScribaTests` logic target): `xcodebuild test -project Scriba.xcodeproj -scheme Scriba -destination 'id=<booted-sim-udid>' CODE_SIGNING_ALLOWED=NO` (use a **booted sim's UDID** from `xcrun simctl list devices available` — the name-based destination failed). Put new pure helpers in `ios/Shared/*.swift` and add a file to `Tests/` + the `ScribaTests` sources in `project.yml`. `.xcodeproj` is gitignored. TS suites: `bun runLibTests` / `runServerTests` / `runAppTests` (run files unloaded — slow tests like `billing` flake under CPU load).
- Prefer **small, isolated, reversible** commits over big rewrites.
- `main` is the working branch (CLAUDE.md still says `dev` — stale).

---

## How Wispr Flow works (research summary, 2026-06)

**Core model:** hold a hotkey → speak → speech is transcribed **and cleaned by an LLM** (filler removal, pause-based punctuation, self-correction "no wait, Friday", list formatting, tone-matching per app) → auto-inserted into the focused field. The **cleanup layer is the moat**, not raw ASR.

**Latency budget (target to beat):** ~700 ms total after you stop speaking = <200 ms ASR + <200 ms LLM + ~200 ms network. They stream.

**Desktop:** push-to-talk (modifier-based hotkey, Fn default on Mac) or double-tap hands-free; floating "pill" with a visual state machine (idle/listening/processing/error); custom dictionary that learns from corrections; snippets/text-expansion; **Command Mode** (select text → separate hotkey → spoken instruction → replaces selection, or inserts at cursor if no selection; translate/summarize/tone; "press enter" auto-submit); 100+ languages with code-switching; Whisper Mode.

**Mobile (two different architectures — important):**
- **iOS** = custom **keyboard extension** requiring **"Allow Full Access"** (needed for network). Globe→Wispr Flow→mic; live waveform; auto-falls back to system keyboard for number/phone/email fields. Launched Jun 2025.
- **Android** = **floating bubble overlay** (does NOT replace Gboard); needs "display over other apps" + **Accessibility** (direct insertion) + clipboard fallback. Tap-to-toggle (long dictation) + press-and-hold (quick). Bubble shows waveform/reconnecting/error states. **Graceful failure: insert → retry → clipboard + notification w/ copy button.** OEM background-kill onboarding (Samsung/Xiaomi/OPPO). Launched Feb 2026.

**Their weaknesses = our opportunities:**
- Cloud-only, **no offline/on-device** mode; **active-window screenshot context capture** caused a privacy scandal → make privacy a **trust** pitch (on-device context, auditable, loud disclosure).
- Heavy desktop runtime (~800 MB / ~8% CPU idle reported); **Windows build froze target apps (VS Code)**.
- **AI over-edits** ("improves what you said") with no easy **verbatim toggle**.
- Pricing: $15/mo, no lifetime, stingy free tier, **no BYOK, no MCP/IDE integration**.

Sources: wisprflow.ai/{features,why-flow,post/technical-challenges}, docs.wisprflow.ai, TechCrunch (Android launch), 9to5Mac (iOS keyboard), 9to5Google (bubble), getvoibe/spokenly/modelpiper reviews.

---

## Backlog (prioritized)

Legend: `[ ]` todo · `[~]` in progress · `[x]` done (see Progress Log) · 🔒 blocked/needs decision

### P0 — Reliability & correctness (fix the silent failures first)
- [x] **EDIT-mode LLM error pastes the raw prompt scaffold into the doc** → now throws `ClientApiError` (groq+cerebras), handled as an error response. *(iter 1)*
- [x] **No error/empty-state feedback in the pill** → added an `error-state-update` IPC channel + `notifyError()`; the session manager maps failures to short messages ("No speech detected", "Network error", "Please sign in", …) and the pill shows a red error indicator that auto-dismisses (~2.6s) and clears on the next recording. *(iter 2)*
- [x] **Concurrency guard on `startSession`** → re-entrancy flag held during the async setup window (released in `finally`, so a lost key-up can't lock out future sessions) + rollback of the created interaction when `initialize()` returns false. Prevents the hotkey + manual-pill double-start desync. *(iter 3)*
- [x] **`completeSession`/`cancelSession` race on `streamResponsePromise`** → whoever captures the (non-null) promise owns teardown; the second stop now no-ops instead of cancelling the in-flight transcription / double-stopping audio. Prevents dropped transcripts when a cancel lands right after a complete. *(iter 4)*
- [x] **gRPC empty auth header instead of failing** → `getHeaders()` now throws a recognizable `ConnectError(Unauthenticated)` when the token is null (instead of sending an authless request), so `withRetry`/`handleAuthError` run the same refresh-then-retry-or-sign-out path *locally* — no wasted 401 round-trip, no per-call refresh/logout loop while signed out, and it surfaces as "Please sign in". *(iter 5)*
- [x] **Retry/queue on network failure** — *(iter 6)* insert-failure → clipboard fallback + visible error; *(iter 8)* transient transcription failure (network/timeout/unavailable) now **auto-retries once** by re-streaming the retained audio buffer (`controller.retranscribe`), before surfacing the error. Auth errors (gRPC-client refresh) and cancellations are excluded. Remaining nice-to-have: a persistent offline queue so a dictation survives an app restart (today the retry is in-memory, single-shot).
- [x] **Key-listener restart orphans in-flight session** → `stopKeyListener` now cancels an active session when the listener goes away (heartbeat-timeout restart / quit), since the key-up that would stop it will never arrive. Also: clear pressed-key state when shortcuts are disabled mid-recording, and de-dupe OS key-repeat keydowns. *(iter 6)*
- [x] **Start/stop tearing race** → a fast key-up could run `completeSession` while `startSession` was still mid-await (before `streamResponsePromise` was assigned), capturing null and orphaning the recording (stuck on). `complete`/`cancelSession` now await the in-flight start before taking ownership. *(iter 6)*

### P1 — Core quality (the cleanup-layer moat + latency)
- [~] **AI auto-formatting in TRANSCRIBE mode**: the LLM cleanup pass now exists (filler removal, punctuation, formatting) gated by the cleanup-level toggle below. *Defaults to `verbatim` (off)* to avoid surprise latency/cost — flip the default to `light` (a product/cost decision) to match Wispr's on-by-default behavior. *(iter 9)*
- [x] **Verbatim ↔ light ↔ heavy cleanup toggle** → setting + Advanced-Settings UI + per-request `transcript-cleanup-level` gRPC header → server runs a best-effort polish pass (light/heavy) in TRANSCRIBE mode, never blanking/losing a dictation. Directly targets Wispr's over-editing complaint. Follow-up: add a `transcript_cleanup_level` proto field (needs `buf`) for cross-device DB sync; today it's local + per-request. *(iter 9)*
- [ ] **Streaming / interim transcripts.** Server buffers ALL audio then one Whisper call (`transcribeStreamV2Handler.ts:88-108`) — no partial results. Re-architect toward streaming ASR for the ~700ms feel.
- [ ] **ASR provider failover** (Groq down → fallback). Today `providerUtils.ts:20` just throws; single provider.
- [x] **Mode detection robustness** — `detectScribaMode` now anchors the "hey scriba" wake phrase to the *start* of the utterance (was: substring anywhere in first 5 words → false EDIT on mid-sentence mentions), tolerating leading punctuation, an inner comma, and common ASR mishears (scribe/scribah/scribba). Also hardened `getScribaMode` to reject non-enum numbers. +9 tests (`helpers.test.ts`). *(iter 7)*. Still TODO: other spoken commands beyond the single wake phrase.

### P2 — Power features (match Wispr)
- [ ] **Command Mode**: select → hotkey → spoken instruction → replace selection / insert at cursor. translate/summarize/tone + "press enter".
- [ ] **Dictionary learns from corrections automatically** + dev-term/code-syntax awareness.
- [x] **Snippets / voice text-expansion.** Engine (PR #5: tested `expandSnippets` + store field + pipeline wiring) **+ management UI** (PR #6: a "Snippets" settings tab to add/remove trigger→expansion pairs, persisted on blur, kept out of analytics). Complete feature.
- [x] **Multilingual + language selection.** Server vertical (iter 29: `transcription-language` header → groqClient/V2/mobile + validation) **+ client setting & Language picker UI** (iter 30: setting default, store field, grpcClient header, dropdown in Advanced Settings). Default auto-detect. Complete feature (iOS client can send the header next).
- [ ] **Privacy-safe app-context formatting** (on-device active-window text, loudly disclosed, toggleable).

### P3 — Mobile (new platforms)
- [x] **Stack decided: native iOS (Swift)** — user chose native iOS. Started in `ios/` (XcodeGen: container app + keyboard extension + shared layer). *(PR #1, iter 13)*
- [~] **iOS**: keyboard extension w/ Full Access + mic + live waveform + record→`/v1/transcribe`→insert (PR #1), **real Auth0 sign-in** (PKCE — PR #2), cleanup-level parity (iter 14), **self-healing 401 refresh** (PR #3), **system-keyboard fallback for numeric/secure fields** (PR #4). Remaining: live streaming/interim results, app icon/assets, on-device testing. Don't break repeat-dictation/external keyboards (their App Store complaint).
- [ ] **Android**: floating-bubble overlay (don't replace Gboard); Accessibility direct-insert + clipboard fallback; tap-toggle + press-hold; OEM background-kill onboarding.
- [ ] **Free unlimited mobile tier** as a land-grab (Wispr did this on Android).
- [ ] Reuse server: the gRPC `ScribaService.TranscribeStreamV2` + auth already exist; mobile clients can target the same backend.

### P4 — Desktop robustness & polish
- [ ] **Native text injection** instead of clipboard-paste (`native/text-writer/macos_writer.rs` clobbers clipboard, loses non-text content, 1s restore race, fails in secure fields).
- [ ] **EDIT "empty result" sentinel** — `adjustTranscript` returns `' '` to allow emptying, but `TextInserter` rejects whitespace (`TextInserter.ts:7`); decide explicit "clear selection" path vs drop the dead sentinel.
- [ ] **Runtime footprint** — profile/idle RAM+CPU; stay well under Wispr's ~800MB/8%. Never freeze the target app (their Windows VS Code bug).
- [ ] **Remove dead V1 path** (`transcribeStreamHandler.ts` `@deprecated`, `grpcClient.transcribeStream`/`getHeadersWithMetadata`) — duplicated context-gather work, maintenance noise.
- [ ] **Windows parity** — accessibility context / selected-text / cursor-context are macOS-only (`ContextGrabber.ts:99`, `main.ts:136`).
- [ ] **Whisper prompt 224-token overflow** — large dictionaries silently truncate (`transcription.ts:4,32-42`).

### P5 — Business model edge (beat them)
- [ ] **BYOK** (bring your own API key). · **On-device/offline mode** (local Whisper-class). · **MCP / IDE (VS Code/Cursor) integration.** · Lifetime/cheaper pricing + generous free tier. · Public status page + auditable privacy.

### Housekeeping
- [x] Remove stale `[DEPRECATED]` banner from README. *(iter 1)*
- [ ] Fix `CLAUDE.md` stale default-branch (`dev` → `main`) and any other ito-era references.
- [ ] Regenerate protobuf (`bun run proto:gen`) so base64 descriptors say `scriba` not `ito` (cosmetic; needs `buf`).
- [ ] Update external `heyito` org/domain URLs once the user picks real ones.

---

## Progress Log (newest first)

### Iteration 41 — 2026-06-11 (runtime UI verification + empty-section fix) — PR #14
- **Runtime-verified my earlier work** by driving the app in the sim (snapshot_ui/tap/screenshot): Settings renders the cleanup segmented control (Verbatim/Light/Heavy) and the Language picker; tapping Language opens the menu with **all 17 languages**, Auto-detect selected. iters 29-31 (language) + cleanup UI confirmed working end-to-end.
- **Fix (iOS UX):** the **ACCOUNT** settings section rendered **empty** (just a header) when not signed in and Auth0 isn't configured. Added a guiding line ("Sign-in isn't configured. Use a developer token below."). Build + runtime verified. PR #14 → merged.
- **Observation (config, not changed):** the backend defaults to `localhost:3000` (dev). For a shippable build the user must set the production server URL (Settings has a "Save URL" field, and `BackendConfig` reads it). Flagged for the user.
- **UI automation note:** `session_set_defaults { simulatorId }` then `snapshot_ui`/`tap`/`screenshot` works for runtime UI checks.
- **Next:** more runtime-verified iOS polish or testable desktop/server work.

### Iteration 40 — 2026-06-11 (iOS app now actually runs 🎉 — critical bundle-ID fix) — PR #13
- **Critical fix (iOS):** both `Info.plist` files were **missing `CFBundleIdentifier`** — with `GENERATE_INFOPLIST_FILE=NO`, Xcode doesn't inject it, so the built `.app`/`.appex` had **no bundle ID and could not be installed or launched** ("Missing bundle ID"). The app compiled and all unit tests passed every prior iteration, but it was **not runnable** (TestFlight/device installs would have failed). Added `$(PRODUCT_BUNDLE_IDENTIFIER)` + CFBundleName/Executable/PackageType to both. PR #13 → merged.
- **How found:** for the first time I **ran the app in the simulator** (build → `simctl install` → `launch` → screenshot), not just build/unit-test. Install failed on the missing bundle ID. After the fix: bundle IDs `ai.scriba.app` / `ai.scriba.app.keyboard`, app launches and renders the onboarding screen ("Set up Scriba — Dictate into any app with a tap"), no crash. 17 unit tests still pass.
- **New verification capability:** the app can be run + screenshotted in the sim — use it to catch runtime/layout issues that build+unit-tests miss. Booted sim UDID this session: `5895B43F-83B5-41D8-BF1C-08B55B9F3AC9`.
- **Next:** more runtime-verified iOS polish, or testable desktop/server work.

### Iteration 39 — 2026-06-11 (iOS CI added + ⚠️ CI is billing-locked) — PR #12
- **⚠️ CRITICAL FINDING (needs the user):** **GitHub Actions CI is completely non-functional — the account is billing-locked.** The CI Controller has shown `startup_failure` on *every* run for the whole session (main pushes + PRs); the real error, from the job annotation, is: **"The job was not started because your account is locked due to a billing issue."** So NO CI has run (TS tests, native, iOS) until the user resolves GitHub billing (Settings → Billing). Nothing code-side can fix this.
- **Feat (ci):** added a standalone **`ios-build-check.yml`** (macos-latest: `brew install xcodegen` → `xcodegen generate` → `xcodebuild test` on a dynamically-selected iPhone sim, path-filtered to `ios/**`). Decoupled from the controller so it runs independently once billing is fixed. actionlint-clean; commands locally-verified (17 iOS tests pass). Also bumped deploy-server's deprecated actions (checkout@v3→v4, paths-filter@v2→v3) for hygiene. PR #12 → merged (its red CI is purely the billing lock, not the code).
- **Note:** the other deploy workflows (app-deploy, build-image, build, infra-deploy) also use some deprecated actions (checkout@v3, configure-aws-credentials@v2, setup-node@v3) — worth bumping later, but they're outside the test-CI graph.

### Iteration 38 — 2026-06-11 (iOS auth form-encoding tested) — PR #11
- **Refactor + tests (iOS, auth correctness):** extracted the Auth0 `application/x-www-form-urlencoded` body building out of `TokenRefresher` into a pure `Shared/FormURLEncoding.swift`; +4 tests. Refresh tokens / auth codes are base64 and routinely contain `+ / =` — if those aren't percent-encoded the refresh POST corrupts the token and silently breaks re-auth, so this pins it down. **17 iOS tests total, TEST SUCCEEDED.** PR #11 → merged.
- **Reviewed** TokenStore (correct: shared keychain via the first access group, both entitlements list `<prefix>.ai.scriba.shared`) and TokenRefresher. **Deferred (hygiene, low realistic risk + untestable here):** coalesce concurrent `TokenRefresher.refresh()` calls (rotation-safety) — the keyboard serializes dictations so in-process races are unlikely.
- **iOS tests: smart-spacing, WAV, PKCE, form-encoding (17).**
- **Next:** more testable iOS/desktop/server work.

### Iteration 37 — 2026-06-11 (iOS PKCE auth crypto tested) — PR #10
- **Test (iOS, security):** extracted a pure `PKCE.challenge(for:)` (S256) and verified it against **RFC 7636 Appendix B's published vector** — a wrong code challenge would make Auth0 reject every login, so this pins the auth crypto down. Also covers base64url-without-padding + generated-pair consistency. **13 iOS tests total, TEST SUCCEEDED.** PR #10 → merged. (GitHub API had a transient outage mid-iteration; retried PR create until it recovered.)
- **iOS test coverage so far:** smart-spacing, WAV encoder, PKCE challenge.
- **Next:** more testable desktop/server or iOS work.

### Iteration 36 — 2026-06-11
- **Fix (server, real bug):** `/v1/transcribe` (the iOS keyboard's endpoint) had **no per-route `bodyLimit`**, so Fastify's **1 MB default** rejected any dictation over ~20 s (>1 MB base64) with a generic 413 *before* the handler ran — making the handler's 25 MB audio cap dead code. Added a per-route `bodyLimit` sized to the audio cap + base64/JSON overhead, so the handler's cap is the real gate. +1 test (a >1 MB body now reaches the handler). 8/8 mobile tests pass; type-check clean.
- **Next:** more testable desktop/server fixes or build/test-verified iOS work.

### Iteration 35 — 2026-06-11 (iOS WAV encoder → tested unit) — PR #9
- **Refactor + tests (iOS):** extracted the WAV (RIFF) container logic out of `AudioRecorder` (AVFoundation-bound, untestable in the host-less target) into pure `Shared/WAVEncoder.swift`; `AudioRecorder.stop()` calls `WAVEncoder.encode()`. +3 tests (header layout, little-endian sample round-trip incl. Int16 extremes, empty-samples). **9 iOS tests total, TEST SUCCEEDED.** PR #9 → merged.
- **Next:** continue extracting/test-covering iOS pure logic, or testable desktop/server items.

### Iteration 34 — 2026-06-11 (iOS smart-spacing + first iOS tests 🎉) — PR #8
- **Feat (iOS):** **smart-spacing on insertion** — `TextInsertion.spaced()` prefixes a dictated transcript with a space when it would otherwise jam against a preceding word/sentence punctuation (à la Wispr); wired into the keyboard via `documentContextBeforeInput`.
- **Infra milestone:** added a **host-less `ScribaTests` logic-test target** — the **first iOS unit tests**. 6 tests, `TEST SUCCEEDED` on the iPhone 16 Pro simulator. iOS pure logic is now **unit-testable**, not just compile-verified. (Destination must be a booted sim's **UDID**, not name.) PR #8 → merged.
- **Next:** more build/test-verified iOS work (e.g. move the WAV/level helpers into testable units) or testable desktop/server items.

### Iteration 33 — 2026-06-11
- **Feat (iOS, Wispr parity):** **haptic feedback** — a medium impact on the start/stop tap (immediate) + an error notification haptic when a dictation fails (`setError` helper). Works because the keyboard requires Full Access. **Build-verified** (xcodebuild simulator → BUILD SUCCEEDED).
- **Reviewed** the keyboard stack while here (AudioRecorder, DictationController, KeyboardViewController) — well-built (reused converter preserves resampler state across buffers, proper NSLock, correct minimal WAV, secure/numeric field fallback). No fixes needed beyond haptics.
- **Next:** more build-verified iOS polish or another testable desktop/server item.

### Iteration 32 — 2026-06-11 (iOS now compile-verified 🎉)
- **Milestone:** built the iOS project for the first time (`xcodegen generate` in `ios/` → `xcodebuild -scheme Scriba -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`). The app + keyboard-extension targets now **BUILD SUCCEEDED** — all the Swift written correct-by-inspection across iters actually compiles.
- **Fix (real bug found by the build):** `UITextDocumentProxy.isSecureTextEntry` is `Bool?`, but `KeyboardContext.update` used it as a non-optional `Bool` → the keyboard target didn't compile. Now compares `== true` (nil ⇒ not secure). One-line fix; rebuild green.
- **How to repro the build:** `cd ios && xcodegen generate && xcodebuild build -project Scriba.xcodeproj -scheme Scriba -destination 'generic/platform=iOS Simulator' -configuration Debug CODE_SIGNING_ALLOWED=NO`. `.xcodeproj` is gitignored (generated from `project.yml`).
- **Next:** now that iOS compiles, iOS changes can be **build-verified** every time. Could also boot a simulator + run for runtime checks. Continue features/fixes.

### Iteration 31 — 2026-06-11 (iOS language parity) — PR #7
- **Feat (iOS):** brought transcription **language selection** to the iOS keyboard for cross-platform parity. `TranscriptionLanguage` (Shared): 'auto' + ~16 common Whisper languages (ISO-639-1), stored in the App Group, with `current`/`set` (mirrors `CleanupLevel`); `TranscriptionClient` now sends the `transcription-language` header (server already honors it); a **Language picker** in the app Settings. Default auto-detect. iOS-only, correct-by-inspection. PR #7 → merged. **Language is now complete on desktop + iOS.**
- **Next:** product-decision items (streaming ASR provider; hands-free) await user input; otherwise small testable fixes / another self-contained feature.

### Iteration 30 — 2026-06-11 (language picker UI — feature complete)
- **Feat (desktop):** completed transcription language selection with the **client side** — `transcriptionLanguage` default ('auto') in shared-constants + generated defaults, an optional `LlmSettings` field + store default, the `transcription-language` header on `transcribeStreamV2`, and a **Language picker** (Auto-detect + ~16 common Whisper languages) in Advanced Settings. Default auto-detect → no behavior change. lib + app suites green; node + web type-check clean. **Language is now a complete feature** (the iOS client can send the header as a follow-up).
- **Next:** product-decision items (streaming ASR provider; hands-free) await user input; otherwise small testable fixes / another self-contained feature.

### Iteration 29 — 2026-06-11 (language selection — server vertical)
- **Feat (server, Wispr "100+ languages"):** lets a client **force a Whisper transcription language** (better accuracy for non-English speech) instead of always auto-detecting. Header-based (`transcription-language`, no proto change, like cleanup level): `groqClient` passes `language` to the Whisper call only when set (not 'auto'); `TranscriptionLanguageSchema` + `validateLanguage` ('auto' or ISO-639-1, never throws → 'auto'); read in the V2 handler + mobile `/v1/transcribe`. Default auto-detect → no behavior change. +4 tests; server suite green.
- **Next (language):** the **client setting + a language picker UI** (so users can choose); then the iOS client can send the header too.

### Iteration 28 — 2026-06-11
- **Fix (P0 onboarding UX):** the permissions step could **dead-end** — clicking Allow then denying the OS prompt (or, for macOS Accessibility, where there's no yes/no) left it polling silently forever with no way forward. While polling on macOS it now shows a hint + an **"Open System Settings"** deep-link to the relevant privacy pane (`x-apple.systempreferences:…Privacy_Accessibility/Microphone`) so the user can enable Scriba manually and continue. Web type-check clean for the file.
- **Next:** more onboarding/UX robustness (permission revocation re-check, alert()/confirm() → Dialog) or another self-contained feature (language selection); product-decision items still await user input.

### Iteration 27 — 2026-06-11 (snippets UI — feature complete) — PR #6
- **Feat (desktop):** the snippets **management UI** — a new "Snippets" settings tab (trigger + expansion list, add/remove). Persists to the settings store (read by `getSnippets()` → already wired into dictation in PR #5), so it works end-to-end. Edits use a local draft persisted **on blur** (not per keystroke → avoids a disk write + IPC per char); the setter is custom (not the analytics-tracked `createSetter`) so snippet content stays out of analytics. App tests green; web type-check clean for the new files. PR #6 → merged. **Snippets is now a complete feature.**
- **Next:** product-decision items (streaming ASR provider; hands-free; learns-from-corrections) await user input; otherwise small testable fixes / another self-contained feature.

### Iteration 26 — 2026-06-11 (snippets engine) — PR #5
- **Feat (desktop, Wispr parity):** voice **text-expansion snippets** engine. `expandSnippets()` (pure, +6 tests: whole-word, case-insensitive, longest-first, lookaround boundaries so `c++`/`@home` match); `snippets` settings-store field (defaults `[]`) + `getSnippets()`; wired into `scribaSessionManager` to expand the final transcript before insertion (+1 test). Default empty → no behavior change. PR #5 → merged.
- **Next (snippets):** the **management UI** — a settings section to add/remove snippets (the engine is inert until users can define them). Then it's a complete feature.

### Iteration 25 — 2026-06-11
- **Fix (renderer UX):** the microphone picker showed an empty scroll area while enumerating devices (or when none were found / permission denied), with no feedback. Added a "Loading microphones…" state and a "No microphones found" empty state (with a connection/permission hint). Web type-check clean for the file.
- **(Verified non-bug:** the audit's "status-indicator success/error wording" flag — `NotesContent` sets `statusMessage` to the matching success/error text alongside `setStatusIndicator` in every path, so the single message always matches the icon; `DictionaryContent` already uses separate messages. Left as-is.)
- **Next:** thinning testable backlog — remaining items are mostly product decisions (streaming ASR provider, snippets, hands-free) or untestable native/iOS. Awaiting user direction.

### Iteration 24 — 2026-06-11
- **Fix (renderer UX/perf):** `NotesContent`'s load effect listed `notes.length` + `addNote` as deps, so it re-ran `loadNotes()` (a full DB re-fetch over IPC) on every add/delete — a redundant round-trip + list flash (and thrash risk), since the store already refreshes after a successful add. Now loads once on mount (`loadNotes` is a stable store action). Web type-check clean for the file.
- **Next:** remaining renderer UX cleanups (status-indicator success/error wording, mic-selector loading/empty states) and product-decision items (streaming ASR provider, snippets, hands-free) awaiting user input.

### Iteration 23 — 2026-06-11
- **Fix (data integrity, sync):** the `lastSyncedAt` watermark was advanced to `new Date()` **after** the multi-second push/pull, so any row edited *during* the sync window had `updated_at` < the new watermark and was silently skipped next cycle (until touched again) — lost edits. Now the watermark is captured at **sync start**; re-checking those rows next cycle is idempotent (upserts are keyed on row id). +1 deterministic test (a slow pull proves the watermark predates it). Full lib suite green.
- **Next:** mostly product-decision items remain (streaming ASR provider for live mode; snippets; hands-free) — surfaced to the user. Continue small testable fixes meanwhile.

### Iteration 22 — 2026-06-11
- **Fix (server):** in wake-phrase-triggered EDIT mode, the full transcript ("hey scriba, make this formal") was fed to the command LLM, so the wake word polluted the instruction. New `stripScribaWakePhrase()` (no-op when absent, e.g. hotkey-triggered EDIT) applied in both V2 and V1 EDIT paths → the LLM gets just the command. +3 tests; helpers suite green.
- **Findings worth recording:**
  - **Live streaming is blocked on a streaming ASR provider** — Groq Whisper is batch-only, so the Wispr "live" feel needs a streaming provider (e.g. Deepgram/AssemblyAI, or the Riva path the fork dropped). That's a cost/infra **product decision** for the user, not a code fix.
  - **Native Rust can't be compiled here** — the `native/` workspace requires Cargo `edition2024` (beyond cargo 1.83 in this env), so the macOS text-writer clipboard-clobber + 1s-blocking-restore bugs can't be safely fixed correct-by-inspection (unsafe Cocoa interop). Flagged for a real-build environment.
  - **Server test flakiness:** `billing.test.ts` (~56s) and `validationInterceptor` protovalidate are slow and intermittently exceed bun's 5s per-test timeout under CPU load (e.g. concurrent runs) — pre-existing, not regressions. Run server test files one-at-a-time / unloaded.
- **Next:** product-decision items (streaming ASR provider; snippets/text-expansion; double-tap hands-free as an opt-in setting) likely need user input; otherwise continue small testable fixes.

### Iteration 21 — 2026-06-10
- **Fix (P1, desktop):** context (window, app, and the **selected text**) was only gathered once at `startSession` in TRANSCRIBE mode, so switching into EDIT mid-session (a different hotkey) ran the LLM rewrite with stale/empty context — EDIT couldn't see the selection. `setMode` now re-fetches context when switching into EDIT. +2 tests; full lib suite green.
- **(Considered + rejected this round:** double-tap hands-free — it changes the core push-to-talk behavior (a sub-threshold tap would become hands-free) and breaks the synchronous-timing tests; too risky without real-app testing.)
- **Next:** iOS live streaming (big), or more testable Wispr-parity fixes.

### Iteration 20 — 2026-06-10 (desktop: cancel-on-Escape)
- **Feat (desktop, Wispr-style):** pressing **Escape during a dictation discards it** (`cancelSession`) instead of transcribing. Since the hotkey is usually still held, a `dictationSuppressed` flag stops the still-pressed combo from instantly re-triggering; it clears once all keys are released (fresh press dictates again). Escape when idle is a no-op. +4 tests; full lib suite green.
- **Next:** iOS live streaming (big), or more Wispr-style desktop features (double-tap hands-free toggle) / testable fixes.

### Iteration 19 — 2026-06-10
- **Fix (P2/P4, server):** both LLM providers returned a lone space `' '` on empty output ("to enable emptying the document"). That never worked (the text inserter rejects whitespace), and since the iter-6 clipboard fallback it actively produced a confusing "Insert failed — copied to clipboard" (with a space on the clipboard) for an empty EDIT result. Now they return `''`: the desktop cleanly **skips insertion** for an empty transcript, and the cleanup pass was already guarded against empty output. groq + cerebras; updated the groq test. Server suite green.
- **Next:** iOS live streaming (big), or more testable desktop/server fixes / a Wispr-style desktop feature (double-tap hands-free, cancel-on-Escape).

### Iteration 18 — 2026-06-10 (back to testable: Whisper prompt)
- **Fix (P4, server):** the Whisper transcription-prompt builder char-sliced the vocabulary then regex-stripped a partial last term — which could over-truncate (drop a complete term) or leave a fragment for a single over-long term; and `chars/4` badly underestimates non-ASCII (CJK/accented) text, so a vocab that "fit" by that estimate could silently overflow the 224-token cap and degrade transcription. Now truncates by **whole terms** (keeps as many complete terms as fit, never mid-term) and `estimateTokenCount` counts non-ASCII chars near 1 token each (conservative). +2 tests; existing behavior preserved; server suite green (13 files).
- **Next:** iOS live streaming (big), or more testable desktop/server fixes (e.g. revisit the EDIT `' '` empty-output sentinel, mode-detection commands).

### Iteration 17 — 2026-06-10 (iOS field fallback) — PR #4
- **Feat (iOS, Wispr parity):** the keyboard now falls back to the system keyboard for **numeric/secure** fields (dictation is useless for phone numbers/passwords). New `KeyboardContext`/`FieldMode` derived from the host field's traits (`textDocumentProxy.keyboardType` + `isSecureTextEntry`), recomputed on `viewWillAppear`/`textDidChange`; for those fields `KeyboardView` hides the mic and shows a "Switch keyboard" (globe) prompt.
- **Workflow:** `feat/ios-field-fallback` → **PR #4** → merged. iOS-only, correct-by-inspection.
- **Next:** the big one — live streaming / interim transcripts (the Wispr "live" feel; server streaming + iOS partials), or back to testable desktop/server fixes.

### Iteration 16 — 2026-06-10 (iOS self-healing auth) — PR #3
- **Feat (iOS):** the keyboard now **refreshes an expired token and retries** instead of surfacing "please sign in" and forcing the user back into the app. Moved the non-interactive refresh into the **Shared** layer (`Auth0Config` → Shared; new `TokenRefresher` + `Auth0TokenEndpoint`) so the extension can use it; added the `AUTH0_*` keys to the keyboard's Info.plist. `TranscriptionClient` retries once on a 401 after a refresh (`allowRefresh` guards loops); `AuthService` now delegates refresh + token POST to the shared code (removing duplication).
- **Workflow:** `feat/ios-keyboard-refresh` → **PR #3** → merged. iOS-only, correct-by-inspection.
- **Next:** live streaming / interim transcripts (the Wispr "live" feel), or secure/number-field fallback; keep landing desktop+server fixes too.

### Iteration 15 — 2026-06-10 (iOS Auth0 sign-in) — PR #2
- **Feat (iOS):** real **Auth0 sign-in**, mirroring the desktop PKCE flow. `AuthService` runs authorization-code + PKCE via `ASWebAuthenticationSession` (Auth0 `/authorize` → `scriba://callback` → `/oauth/token`, scope `openid profile email offline_access`) and refreshes the access token from the stored refresh token. `Auth0Config` reads `AUTH0_*` from Info.plist (empty ⇒ dev-token fallback). `Credentials` (access+refresh+expiry) live in the shared Keychain; the container app refreshes on launch so the keyboard's token stays valid. Registered the `scriba://` URL scheme.
- **Caveat:** iOS-only, correct-by-inspection (no Xcode build here). Fixed real issues while authoring: `NSObject` `super.init()`, `import Security` for `SecRandomCopyBytes`, explicit `init` to dodge a `@MainActor` function-reference subtlety.
- **Workflow:** `feat/ios-auth0` → **PR #2** → merged.
- **Next:** keyboard-side token refresh on 401, then live streaming / interim results; keep landing desktop+server fixes too.

### Iteration 14 — 2026-06-10
- **Feat (mobile parity):** the iOS keyboard already sent a `transcript-cleanup-level` header, but the new `/v1/transcribe` endpoint ignored it (always verbatim). Extracted the verbatim/light/heavy cleanup pass out of the V2 streaming handler into a shared `cleanupTranscript()` and used it in **both** the streaming handler and the mobile endpoint — so mobile gets the same polish as desktop, with no logic duplication. Still best-effort (verbatim/empty/LLM-error → raw transcript). +6 tests (5 for the shared fn, 1 endpoint header path). Server suite green (13 files).
- **Next (iOS):** real Auth0 sign-in (`ASWebAuthenticationSession` + token refresh), then live streaming / interim results.

### Iteration 13 — 2026-06-10 (mobile track started — native iOS) — PR #1
- **Decision:** user chose **native iOS (Swift)**. Mobile stack is no longer blocked.
- **Feat (P3):** scaffolded a Wispr-Flow-style **iOS dictation keyboard** under `ios/` (XcodeGen-managed; `project.yml`). Container app (SwiftUI onboarding to enable the keyboard + mic permission + settings) and a **keyboard extension** (`UIInputViewController` hosting a SwiftUI keyboard — mic button, live waveform, globe/space/delete/return; `AVAudioEngine` → 16 kHz mono WAV; record→transcribe→insert state machine; `RequestsOpenAccess` for mic+network). Shared layer: configurable backend URL (not hardcoded to prod), shared-Keychain token store (app ⇄ keyboard), cleanup level, transcription client.
- **Backend:** added `POST /v1/transcribe` — an authenticated record-then-transcribe endpoint for the keyboard (base64 audio → transcript; reuses the existing ASR provider; maps no-speech etc. to 422, hides 5xx). +6 tests; server suite green.
- **Workflow:** built on `feat/ios-keyboard-app`, opened **PR #1**, merged to `main`.
- **Caveat:** the iOS code is correct-by-inspection — Xcode/device builds can't run in this env. Fixed real issues during authoring (iOS 17 deployment target for `AVAudioApplication`/two-param `onChange`; audio-tap concurrency; keychain access-group placeholder only resolves in entitlements, so `TokenStore` omits the explicit group).
- **Next (iOS):** real Auth0 sign-in (`ASWebAuthenticationSession` + token refresh); then live streaming / interim results. Keep landing desktop+server fixes alongside.

### Iteration 12 — 2026-06-10
- **Fix (P0 renderer):** `app.tsx` wrote `settings.isShortcutGloballyEnabled` via `window.api.send` **during render** (in both return branches), so it fired on every render — and twice under React 18 Strict Mode — spamming the main process and racing the store write. Moved into a `useEffect` keyed on the value (sends only when it changes; both branches sent the same value, so behavior is preserved).
- **Fix (P1):** the Advanced-Settings debounced save had no error handling (a failed `updateAdvancedSettings` became an unhandled promise rejection) → wrapped in try/catch. Also fixed `getDisplayValue` to coalesce the now-optional `transcriptCleanupLevel` (undefined → null), resolving a latent web type error from iter 9.
- **Deferred (still):** mobile track (blocked on the native-vs-Expo stack decision — and unbuildable/untestable in this env); ASR `low_quality_threshold` (avg_logprob rejection risks dropping valid dictations — won't enable without real-audio tuning); AdvancedSettings flush-on-unmount + save-status UI; the `alert()/confirm()` → Dialog replacements; PermissionsContent denied-state dead-end.
- **Next:** continue safe renderer/UX bug fixes (permission denied-state recovery, alert/confirm replacement), or take the mobile stack decision to the user.

### Iteration 11 — 2026-06-10 (backlog sweep, waves A–E)
Worked through the remaining iter-6 audit + "Next" items in five tested, committed, pushed waves:
- **A — quick wins:** `voiceInputService` now unmutes based on whether *this* session muted (new `didMuteSystemAudio` flag), so toggling `muteAudioWhenDictating` mid-dictation can't leave audio permanently muted (+3 tests); removed the erroneous `import { main } from 'bun'` (+ a dead `DEFAULT_ADVANCED_SETTINGS` import) from `syncService`; `groqClient` runs availability/model guards before `toFile()` and moved `toFile()` inside the try so its failures are wrapped as `ClientApiError`.
- **B — server hardening:** error handler no longer leaks 5xx `error.message` to clients (still surfaces 4xx); CORS is env-configurable (`CORS_ORIGIN`, default `*`); `ServerTimingCollector.activeTimings` is capped with oldest-eviction so aborted/spammed streams can't grow it unbounded (+1 test file).
- **C — settings validation:** added `resolveNumberInRange` (validates via the existing zod schemas, falls back to default) and applied it to `llmTemperature`/`noSpeechThreshold` in the V2 handler — out-of-range client values can no longer reach the ASR/LLM providers (+4 tests).
- **D — UI robustness:** guarded the `getScribaModeShortcuts(TRANSCRIBE)[0].keys` crash that white-screened Home/Notes/TryItOut when a migrated store has no TRANSCRIBE shortcut (`?.[0]?.keys ?? []`); fixed AccountSettings name input controlled/uncontrolled flip (`value={user?.name ?? ''}`).
- **E — data integrity:** all three sqlite upserts (interactions/notes/dictionary) now guard `DO UPDATE` with `WHERE excluded.updated_at > <table>.updated_at`, so a stale remote row from a sync-pull can't clobber a newer local edit.

**Residual / deliberately deferred:** ASR `low_quality_threshold` (needs plumbing through `TranscriptionOptions`); ASR provider failover (needs a 2nd provider); flip cleanup default to `light` (product/cost call); client-side settings UX feedback on out-of-range/save-error (server already clamps); Pill ARIA (low value for a floating overlay); the 2 onboarding `getScribaModeShortcuts[0]` sites (near-impossible during fresh-install onboarding, and the multi-prop editor is risky to wrap); `grpcClient.withRetry` retrying `createInteraction` (likely a non-issue — the server upserts by client-generated id, so a retry is idempotent — left unchanged rather than speculatively edited).
- **Next:** ASR `low_quality_threshold` plumbing, or start the mobile track (P3, needs the native-vs-Expo stack decision).

### Iteration 10 — 2026-06-10
- **Fix (P1, transcription quality / lost dictations):** `groqClient` no-speech detection inspected only `segments[0].no_speech_prob`. A dictation that merely **started** with a breath/noise (high no_speech on segment 0) was wrongly rejected as "No speech detected" and the whole recording was lost; trailing silence after real speech was handled inconsistently. Now it flags no-speech only when **every** segment is above the threshold (genuinely no speech anywhere) and reports the most speech-like segment's prob. +2 tests; server suite green.
- **Next:** P1 — ASR quality threshold (`low_quality_threshold` is in the proto but never checked — needs plumbing through `TranscriptionOptions`), or the desktop `voiceInputService` mute-state bug (toggling `muteAudioWhenDictating` off mid-dictation leaves system audio muted), or the remaining settings-validation / a11y UI findings from iter 6.

### Iteration 9 — 2026-06-10
- **Feat (P1, cleanup-layer moat):** added the `verbatim | light | heavy` dictation cleanup toggle. `verbatim` (default) inserts the raw ASR transcript with no LLM call (unchanged behavior + cost); `light` strips fillers/false-starts and fixes punctuation/caps while keeping wording; `heavy` also tightens and formats. **Plumbed via a gRPC metadata header** (`transcript-cleanup-level`) rather than a proto field, because `buf` is unavailable (no regen) — so it's fully functional end-to-end without touching the generated `_pb.ts`. Server runs a best-effort pass in TRANSCRIBE mode that returns the raw transcript on empty input / LLM error / empty output, so cleanup can never lose or blank a dictation. New `TranscriptCleanupLevelSchema` + `validateCleanupLevel` (never throws → verbatim). Client: setting (optional, backward-compatible), store default, a segmented control in Advanced Settings, and the header on `transcribeStreamV2`. +6 tests; server + lib suites green.
- **Follow-ups:** (1) flip default to `light` to match Wispr's on-by-default — a product/cost call; (2) add a `transcript_cleanup_level` proto field once `buf` is available so the level syncs to the server DB / across devices (today it's local + per-request).

### Publish — 2026-06-10
- **Done:** force-pushed the clean codebase to `github.com/metaforismo/scriba` (replacing the old fork snapshot; user chose to drop the fork's Riva ASR + Railway files), refreshed the description + topics + README, and **made the repo public**. Hardened first: verified **no secrets in tree or history**, added `SECURITY.md` + `CONTRIBUTING.md`, untracked the `cdk.context.json` CDK cache (non-secret account/zone/domain identifiers) and `*.tsbuildinfo`.
- **Residual (not dangerous, flagged to user):** the AWS account id `287641434880` is still in `.github/workflows/*` and remains in earlier git history (identifier, not a secret; AWS access is gated by the OIDC trust policy — which is scoped to `heyito/scriba`, so those CI jobs are inert here anyway). CI also references GitHub secrets that don't exist in this repo, so the deploy workflows will fail until reconfigured. Optional follow-ups: parameterize the account id, update the OIDC trust + secrets for the new owner, or scrub history if the account/domain is considered sensitive.
- **Next dev item:** P1 — ASR provider failover (single-provider outage today), or flip the cleanup default to `light`; plus the remaining P1/P2 UI findings from iter 6.

### Iteration 8 — 2026-06-10
- **Feat (P0, no-lost-dictations):** a transient network/stream failure during transcription used to discard the whole recording. The captured audio is retained in `AudioStreamManager` after a failed attempt, so `completeSession` now **retries once** by re-streaming that buffer (`scribaStreamController.retranscribe()`) before surfacing the error — Wispr's retry-before-giving-up degradation. `isTransientError` gates it: only network/timeout/unavailable/econnreset/etc. retry; auth errors (already refreshed+retried by the gRPC client) and intentional cancellations do not. `retranscribe` replays a minimal config (mode + interaction id) then the buffered audio re-chunked at 32 KB (well under the 1 MB proto cap); the server defaults the rest. +7 tests (4 session-manager: retry-success / retry-fails / non-transient / auth-no-retry; 3 controller: result shape, config-then-audio replay shape, empty-buffer guard).
- **Test infra note:** `scribaSessionManager.test.ts` mocks `./scribaStreamController` while `scribaStreamController.test.ts` imports the real class — running both in **one** `bun test` invocation cross-contaminates via `mock.module`. `bun runLibTests` runs each file in its own process (isolated), so the suite is green; don't pass those two files to a single `bun test` call.
- **Next:** P1 — AI auto-formatting on by default + verbatim/light/heavy cleanup toggle (the Wispr cleanup-layer moat). Changes default product behavior (latency + per-dictation LLM cost), so worth a quick user check before defaulting on; the toggle + plumbing can land first defaulting to "off/verbatim".

### Iteration 7 — 2026-06-10
- **Fix (P1, mode detection):** `detectScribaMode` matched `hey scriba` *anywhere* in the first 5 words, so a mid-dictation mention ("I told him hey Scriba is great") wrongly flipped the whole utterance into EDIT/command mode, while any ASR mishearing ("hey scribe") was missed entirely. It now requires the wake phrase at the **start** of the utterance (wake words are always spoken first), tolerating leading punctuation/whitespace, a comma between the two words, and the common `scribe`/`scribah`/`scribba` mishears — and it no longer false-matches `scribble`/`script`. Also hardened `getScribaMode` to accept only real `ScribaMode` enum members (a stray `"7"` previously became an invalid mode that indexed `SCRIBA_MODE_PROMPT[mode]` as `undefined`). New `helpers.test.ts` (+9 tests).
- **Note (user decision):** external `heyito` org/domain URLs are intentionally left as-is for now (user chose "leave them"); code rename is otherwise complete.
- **Next:** P1 — AI auto-formatting on by default + verbatim/light/heavy cleanup toggle (Wispr's signature cleanup layer), or the network retry/queue (audio still dropped on a thrown stream error). The auto-formatting change alters default product behavior (latency + cost), so it warrants a design note / user check before defaulting it on.

### Iteration 6 — 2026-06-10 (UI/UX + edge-case + bug sweep)
Ran a 3-layer audit (renderer / main-process / server) and fixed the top correctness issues across all of them. **The whole test suite (lib + server + app) is green** — and `node_modules` is now installed, so tests actually run in this env (`bun test --preload lib/__tests__/setup.ts <file>` for lib; plain `bun test` for server).

- **Desktop pipeline (`scribaSessionManager`, `keyboard`):**
  - Text insertion is now awaited; on failure the transcript is copied to the clipboard with a visible error, instead of being silently dropped.
  - Server error code is persisted with the interaction (was dropped).
  - `complete`/`cancelSession` wait for an in-flight `startSession` → no more start/stop tearing (orphaned recording stuck on).
  - Listener stop/restart cancels an orphaned session; shortcuts-disabled-mid-recording clears pressed-key state; OS key-repeat keydowns are de-duped.
  - +6 unit tests.
- **Server (`transcribeStreamV2Handler`, `transcribeStreamHandler`, validation):**
  - V2 `vocabulary` (repeated field) is now validated/sanitized before hitting the Whisper prompt (it was raw — injection/abuse risk; V1 already validated). New `VocabularyArraySchema` + `validateVocabularyArray` (filters bad words, caps 500, never throws).
  - Both handlers cap cumulative audio at 100 MB (`ResourceExhausted`) — the proto caps per-chunk at 1 MB but not the count (memory-exhaustion DoS).
  - V1 base64 `context-text` decode is guarded + length-capped.
  - +5 unit tests.
- **Renderer (`Pill.tsx`):** the pill's IPC subscription effect listed `volumeHistory`/`lastVolumeUpdate`/`recordingMode` in deps, so it tore down + re-registered all 7 listeners on every audio frame (~16×/s), dropping volume events. Now mount-only via a ref + functional updaters.
- **Rename:** code rename ito→scriba is already complete (appId `ai.scriba.scriba`, package `scriba`, zero user-visible "Ito" strings). The only remaining `ito` is the external `heyito` org/domain (`github.com/heyito/scriba`, `heyito.ai`, `link.heyito.ai`, the `heyito/rdev` Cargo dep, `dev-app-update.yml` owner) — these point to real infra and need the user's real new org/domain before changing (flagged, not guessed).
- **Audit backlog (not yet done, highest-value next):** network-failure retry/queue (audio dropped on stream-error); ASR provider failover (P1); AI auto-formatting default + verbatim toggle (P1, the Wispr moat); streaming/interim transcripts (P1); plus a sizable list of P1/P2 UI findings (settings validation/save-feedback, onboarding permission dead-ends, native alert()/confirm() in renderer, mic-selector loading/empty states, pill ARIA/keyboard a11y).
- **Next:** P1 — AI auto-formatting on by default + verbatim/light/heavy toggle (Wispr's signature cleanup layer), or the network retry/queue, depending on user priority.

### Iteration 5 — 2026-06-10
- **Fix (P0):** `grpcClient.getHeaders()` no longer returns an empty `Headers` object when the auth token is null — it now throws `ConnectError('Not authenticated', Code.Unauthenticated)`. The comment had claimed it threw "to pinpoint auth issues", but it actually sent an **authless request**: a guaranteed server 401, and — because every RPC runs inside `withRetry` — a refresh/logout cycle on *every* call while signed out, plus (for the streaming RPC) a partially-consumed stream that couldn't be safely retried. Throwing locally before any network/stream work means `handleAuthError` runs the **same** recovery (refresh → retry, or sign-out via `auth-token-expired`) without the wasted round-trip, and the thrown `Unauthenticated` maps to "Please sign in" in the pill (iter 2's `friendlyExceptionError`). Rewrote the "no auth token" test into two: (1) no token → refresh succeeds → operation retried once and the server method fires exactly once; (2) no token + refresh fails → call rejects, server method **never** called, user signed out.
- **Next:** P0 — retry/queue + clipboard fallback on network failure (a failed dictation is currently lost forever; copy Wispr's insert → retry → clipboard+notification degradation). Then the key-listener-restart orphan reconcile.

### Iteration 4 — 2026-06-09
- **Fix (P0 race):** `completeSession`/`cancelSession` now guard on ownership of `streamResponsePromise`. Each captures-and-nulls the promise synchronously; if it captured `null`, another stop already owns the session, so it no-ops instead of running teardown again. This stops a `cancel` that races a `complete` from aborting the in-flight transcription (dropping a valid transcript), and stops duplicate stops from double-ending the stream / toggling the UI. Added a race test (cancel-after-complete keeps the transcript) and a duplicate-complete no-op test; fixed the existing cancel test to start a session first and added the missing `clearInteractionAudio` mock.
- **Next:** P0 — gRPC empty-auth-header: `grpcClient.getHeaders()` returns empty headers when the token is null (comment claims it throws), causing a refresh/logout loop instead of a clear "please sign in" state.

### Iteration 3 — 2026-06-09
- **Fix (P0 race):** added a re-entrancy guard to `scribaSessionManager.startSession`. A boolean `isStarting` is set synchronously at entry and released in `finally`, so two near-simultaneous starts (hotkey racing the manual pill click, or a rapid re-press) can no longer create two interactions / two recordings for one dictation. On the `initialize() === false` path it now rolls back the interaction it created (was left dangling). Because the flag is only held during setup, a lost key-up can't permanently lock out future sessions. Added a concurrency unit test + extended the controller-fail test (rollback + guard-release).
- **Next:** P0 — `completeSession`/`cancelSession` race on `streamResponsePromise` (can drop a valid transcript when two stop signals arrive together); then gRPC empty-auth-header fix.

### Iteration 2 — 2026-06-09
- **Fix (P0, biggest UX gap):** dictation failures are no longer silent. Added an `error-state-update` IPC event + `ErrorStatePayload` (`lib/types/ipc.ts`), a `notifyError()` on `recordingStateNotifier`, and wired `scribaSessionManager` to call it from both error paths (server-returned protobuf `ClientError` and thrown stream/network exceptions), mapping codes to short user-facing messages. The pill (`app/components/pill/Pill.tsx`) now renders a red error state with a warning icon + message, auto-dismisses after ~2.6s, and clears when a new recording starts. Updated the session-manager test mock to include `notifyError`.
- **Next:** P0 — concurrency guard on `startSession` (hotkey + manual-record can both enter → dangling interaction / no audio cleanup), then the `completeSession`/`cancelSession` race.

### Iteration 1 — 2026-06-09
- Researched Wispr Flow (desktop + mobile architecture, features, weaknesses) → "How Wispr Flow works" above.
- Full codebase analysis → architecture + bug/gap backlog above.
- **Fix (P0):** EDIT-mode LLM failure no longer returns the raw prompt scaffold (which got pasted into the user's document). `groqClient.adjustTranscript` + `cerebrasClient.adjustTranscript` now re-throw as `ClientApiError`; the V2 handler's existing catch turns it into a clean `{transcript:'', error}` response. Updated the groq unit test to assert the throw.
- **Housekeeping:** removed the stray `[DEPRECATED] - no longer maintained` banner from the README.
- Created this ROADMAP.
- **Next:** P0 — surface error/empty states in the pill (the biggest remaining UX gap).
