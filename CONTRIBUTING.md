# Contributing to Scriba

Thanks for your interest in improving Scriba! This guide covers the basics for
getting set up and submitting changes.

## Project layout

- `app/` — React renderer (UI, Zustand stores, Tailwind)
- `lib/` — Electron main process (dictation pipeline, IPC, native bridges)
- `server/` — Bun + Fastify gRPC backend (ASR + LLM cleanup providers)
- `native/` — Rust binaries (global key listener, audio recorder, text writer, …)

## Prerequisites

- [Bun](https://bun.sh) (see `package.json` for the version in use)
- Rust toolchain (for the `native/` binaries)
- Node-compatible environment for Electron

Copy `.env.example` to `.env` and fill in your own values. **Never commit a
real `.env` or any secret** — they belong in environment variables / CI secrets.

## Development

```bash
bun install
bun dev            # run the desktop app (electron-vite, watch mode)
# server (from the server/ directory):
docker compose up --build
```

## Checks to run before opening a PR

```bash
bun runAllTests    # lib + server + app + native tests
bun type-check     # TypeScript
bun lint           # ESLint (bun lint:fix to auto-fix)
bun format         # Prettier (bun format:fix to auto-fix)
# Rust:
bun lint:native && bun format:native
```

Please make sure the test suite is green and types/lint/format pass.

## Pull requests

- Branch off `main` and keep changes focused and small where possible.
- Write a clear description of **what** changed and **why**.
- Add or update tests for behavior changes.
- Follow the existing code style and patterns; prefer clear, simple code.

## Reporting issues

Use GitHub Issues for bugs and feature requests. For **security** issues, follow
[SECURITY.md](./SECURITY.md) instead of opening a public issue.
