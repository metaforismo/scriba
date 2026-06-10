# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in Scriba, please report it
**privately** so it can be fixed before public disclosure.

- Use GitHub's [private vulnerability reporting](https://github.com/metaforismo/scriba/security/advisories/new)
  ("Report a vulnerability" under the **Security** tab), **or**
- Open a regular issue **without sensitive details** asking a maintainer to get
  in touch for a private channel.

Please do **not** open a public issue that describes how to exploit the problem.

When reporting, include where possible:

- A description of the issue and its impact
- Steps to reproduce (proof-of-concept if available)
- Affected version / commit and platform (macOS, Windows, server)

We aim to acknowledge reports within a few business days and will keep you
updated on remediation progress.

## Scope & handling of sensitive data

- Scriba transcribes audio and inserts text into the focused app. Audio and
  transcripts are processed by the configured providers (e.g. Groq Whisper) and
  may be stored locally for your interaction history.
- **Never commit secrets.** API keys, tokens, and credentials must come from
  environment variables (see `.env.example`) or CI/CD secrets — never from
  source. The repository is scanned to keep it free of committed secrets.
