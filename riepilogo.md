# Riepilogo — Scriba

App di dettatura vocale stile **Wispr Flow**: desktop (Electron) + mobile (iOS nativo) + server (Bun/gRPC).
Repo pubblico: **https://github.com/metaforismo/scriba**

## Cosa abbiamo fatto

**Base**
- Rebrand completo `ito` → **Scriba**; repo reso **pubblico** con README, SECURITY, CONTRIBUTING (rimossi segreti/dipendenze indesiderate).

**Desktop (Electron)**
- Feature Wispr: livelli di cleanup (**verbatim/light/heavy**), **snippets** (trigger→espansione), **selezione lingua** (100+), **cancel con Esc**, **double-tap hands-free**, formattazione **app-aware** (tono adatto all'app) e di email/URL pronunciati.
- Robustezza: retry rete, niente dettature perse, fix watermark di sync, mode-detection, **fix di race condition** (start/stop/mode), dialog branded al posto di alert/confirm nativi.

**iOS (nuovo, Swift nativo)**
- Keyboard extension stile Wispr (globe → Scriba → mic), **Auth0+PKCE+refresh**, lingua, cleanup, **smart-spacing (incl. CJK)**, **number pad** per campi numerici, **haptics**, gestione **interruzioni audio** (AirPods/chiamate), onboarding con rilevamento permessi.
- **Live streaming** on-device (`SFSpeechRecognizer`): le parole appaiono mentre parli; il transcript finale accurato resta dal server.
- **Compila, 31 test unitari, verificato a runtime** nel simulatore.

**Server (Bun)**
- Endpoint mobile `/v1/transcribe`, cleanup condiviso app-aware, validazione header, lingua, cap audio + `bodyLimit` corretto.

**Qualità**
- ~26 PR mergiate con workflow branch→PR→merge; suite test TS (lib/server/app) verdi + 31 iOS.
- Un **subagent di code-review** ha trovato 3 bug reali (incl. un potenziale crash) prima del rilascio.

## Stato attuale

- ✅ Codice completo e testato su `main`; copre — e in alcuni punti supera — le feature core di Wispr Flow.
- ⚠️ **CI GitHub bloccata da un problema di billing dell'account** (azione tua: GitHub → Settings → Billing). Il workflow iOS è pronto e partirà appena sbloccato.
- ⏳ In attesa di una tua decisione di prodotto: **provider ASR streaming** (per il live lato server, Groq è batch-only), **Android**, BYOK, modello on-device, pricing/tier gratuito.

*Loop autonomo fermato su tua richiesta (2026-06-11).*
