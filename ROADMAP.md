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
- [ ] **`completeSession`/`cancelSession` race on `streamResponsePromise`** drops a valid transcript when two stop-signals arrive close together. (`scribaSessionManager.ts:101,131,197`)
- [ ] **gRPC empty auth header instead of failing** → triggers refresh/logout loop instead of a clear "sign in" state. Comment claims it throws; it doesn't. (`grpcClient.ts:99-106`)
- [ ] **Retry/queue on network failure** — a failed dictation is currently lost forever. Add 1 retry + clipboard fallback (copy Wispr's graceful-degradation pattern).
- [ ] **Key-listener restart orphans in-flight session** (recording continues, no key-up). Reconcile `pressedKeys`/`activeShortcutId` on restart. (`keyboard.ts:88-95`)

### P1 — Core quality (the cleanup-layer moat + latency)
- [ ] **AI auto-formatting on by default** in TRANSCRIBE mode: filler removal, smart punctuation, paragraph/list detection. Currently only capitalize-first + leading-space, and `grammarServiceEnabled` defaults **false** (`store.ts:149`). This is Wispr's signature feature.
- [ ] **Verbatim ↔ light ↔ heavy cleanup toggle** (per-app optionally). Directly targets Wispr's over-editing complaint.
- [ ] **Streaming / interim transcripts.** Server buffers ALL audio then one Whisper call (`transcribeStreamV2Handler.ts:88-108`) — no partial results. Re-architect toward streaming ASR for the ~700ms feel.
- [ ] **ASR provider failover** (Groq down → fallback). Today `providerUtils.ts:20` just throws; single provider.
- [ ] **Mode detection robustness** — `detectScribaMode` substring-matches "hey scriba" in first 5 words (`helpers.ts:161`); misfires + no other commands.

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
