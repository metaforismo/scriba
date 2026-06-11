# Claude Context for SCRIBA Project

## Project Overview

This is the SCRIBA project - an AI assistant application with both client and server components.

## Project Structure

- `app/` - Renderer (React) client application code
- `lib/` - Electron main-process code
- `server/` - Server-side code with gRPC services
- `server/src/scriba.proto` - Protocol buffer definitions
- `server/src/clients/` - Various client implementations (Groq, LLM providers, etc.)
- `native/` - Rust binaries (keyboard listener, audio, text writer, etc.)
- `ios/` - Native iOS app + keyboard extension (Swift, XcodeGen)

## Branch

Main development branch: `main`

## Development Commands

- Dev: `bun dev` (starts electron-vite dev with watch)
- Server: `docker compose up --build` (run from server directory)
- Build: `bun build:app:mac` or `bun build:app:windows`
- Test: `bun runAllTests` (runs lib, server, and native tests)
  - Lib tests: `bun runLibTests`
  - Server tests: `bun runServerTests`
  - Native tests: `bun runNativeTests` (or see "Native Binary Tests" section)
- Lint:
  - TypeScript: `bun lint` (check) or `bun lint:fix` (fix)
  - Rust: `bun lint:native` (check) or `bun lint:fix:native` (fix)
- Type check: `bun type-check`
- Format:
  - TypeScript: `bun format` (check) or `bun format:fix` (fix)
  - Rust: `bun format:native` (check) or `bun format:fix:native` (fix)

## Native Binary Tests

The `native/` directory contains Rust binaries that power the app's core functionality. The modules are organized as a Cargo workspace, allowing you to test and build all modules with a single command.

### Running Tests

Test all native modules:

```bash
cd native
cargo test --workspace
```

Or use the npm script:

```bash
bun runNativeTests
```

Test a single module:

```bash
cd native/global-key-listener
cargo test
```

### Native Modules

- `global-key-listener` - Keyboard event capture and hotkey management
- `audio-recorder` - Audio recording with sample rate conversion
- `text-writer` - Cross-platform text input simulation
- `active-application` - Active window detection
- `selected-text-reader` - Selected text extraction

### Linting and Formatting

Rust code follows standard formatting and linting rules defined in `native/`:

- **rustfmt.toml** - Code formatting configuration (100 char width, Unix line endings)
- **clippy.toml** - Linter configuration (cognitive complexity threshold)
- **Cargo.toml** - Workspace-level lint rules (pedantic + nursery warnings)

Run checks locally:

```bash
# Check formatting
bun format:native

# Auto-fix formatting
bun format:fix:native

# Check lints
bun lint:native

# Auto-fix lints (where possible)
bun lint:fix:native
```

### CI/CD

Native tests and builds are integrated into the existing CI workflows:

**Tests** (`.github/workflows/test-runner.yml`):

- Unit tests run on macOS runner (OS-agnostic tests)
- Runs automatically via `bun runAllTests` on all pushes and PRs
- Executed as part of the main CI controller workflow

**Compilation Checks** (`.github/workflows/native-build-check.yml`):

- macOS: Verifies compilation for x86_64 and aarch64 architectures
- Windows: Verifies cross-compilation for x86_64-pc-windows-gnu
- Runs automatically on all pushes and PRs via the CI controller
- Ensures binaries compile correctly for both platforms before merging

**Release Builds** (`.github/workflows/build.yml`):

- Full release compilation happens during tagged releases
- Also includes compilation verification before packaging

## iOS App (`ios/`)

Native Swift app + keyboard extension (a Wispr Flow–style dictation keyboard).
The Xcode project is generated from `project.yml` with XcodeGen and is **not**
committed (`.xcodeproj` is gitignored), so the structure is reviewable as YAML.

- Targets: `Scriba` (container app), `ScribaKeyboard` (keyboard extension),
  `ScribaTests` (host-less logic tests).
- Pure, testable helpers live in `ios/Shared/*.swift`; their tests in `ios/Tests/`
  (also listed under the `ScribaTests` sources in `project.yml`).

Generate the project, then build / test on a simulator (no signing needed for
verification):

```bash
cd ios
xcodegen generate
# Build the app + keyboard
xcodebuild build -project Scriba.xcodeproj -scheme Scriba \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO
# Run the unit tests (use a BOOTED simulator's UDID, not a name)
xcodebuild test -project Scriba.xcodeproj -scheme Scriba \
  -destination "id=$(xcrun simctl list devices booted | grep -oE '[0-9A-F-]{36}' | head -1)" \
  CODE_SIGNING_ALLOWED=NO
```

The backend URL (default `http://localhost:3000`) and Auth0 settings are read from
Info.plist build settings (`SCRIBA_BACKEND_URL`, `AUTH0_*`) or in-app settings, so
forks point at their own server. CI: `.github/workflows/ios-build-check.yml`.

## Code Style Preferences

- Keep code as simple as possible
- Don't create overly long files
- Group related code into useful, well-named functions
- Prefer clean, readable code over complex solutions
- Follow existing patterns and conventions in the codebase
- Always prefer console commands over log commands. E.g. use `console.log` instead of `log.info`.

## Tech Stack

- TypeScript
- bun
- gRPC with Protocol Buffers
- React (for UI components)
- Various LLM providers (Groq, etc.)
