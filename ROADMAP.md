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
- Environment cannot build/run the Electron app, native (Rust/Swift) binaries, or the Bun server. So changes must be **correct by inspection** and, where possible, covered by **unit tests** (vitest) that are updated alongside.
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
- [ ] **Snippets / voice text-expansion.**
- [ ] **Multilingual + auto language detect** surfaced in settings (Whisper already auto-detects; no UI).
- [ ] **Privacy-safe app-context formatting** (on-device active-window text, loudly disclosed, toggleable).

### P3 — Mobile (new platforms — needs product decisions 🔒)
- 🔒 **Decide stack**: native (Swift/Kotlin) vs React Native/Expo. Desktop is Electron/React/TS; sharing the gRPC client + proto across RN is attractive. **Needs user decision before building.**
- [ ] **iOS**: keyboard extension w/ Full Access; mic + live waveform; auto-fallback for number/phone/email fields; <1 min setup. Don't break repeat-dictation/external keyboards (their App Store complaint).
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

### Iteration 9 — 2026-06-10
- **Feat (P1, cleanup-layer moat):** added the `verbatim | light | heavy` dictation cleanup toggle. `verbatim` (default) inserts the raw ASR transcript with no LLM call (unchanged behavior + cost); `light` strips fillers/false-starts and fixes punctuation/caps while keeping wording; `heavy` also tightens and formats. **Plumbed via a gRPC metadata header** (`transcript-cleanup-level`) rather than a proto field, because `buf` is unavailable (no regen) — so it's fully functional end-to-end without touching the generated `_pb.ts`. Server runs a best-effort pass in TRANSCRIBE mode that returns the raw transcript on empty input / LLM error / empty output, so cleanup can never lose or blank a dictation. New `TranscriptCleanupLevelSchema` + `validateCleanupLevel` (never throws → verbatim). Client: setting (optional, backward-compatible), store default, a segmented control in Advanced Settings, and the header on `transcribeStreamV2`. +6 tests; server + lib suites green.
- **Follow-ups:** (1) flip default to `light` to match Wispr's on-by-default — a product/cost call; (2) add a `transcript_cleanup_level` proto field once `buf` is available so the level syncs to the server DB / across devices (today it's local + per-request).
- **Next:** push to GitHub (`metaforismo/scriba`), refresh README/description, make public.

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
