# Install Anarlog Local

Download the `.dmg` from [this fork's Releases](https://github.com/deniszagitov/anarlog/releases). Choose an **Anarlog Local** release and the `macos-arm64.dmg` file. **Code → Download ZIP** contains source code, not an installer. The installer needs no Rust, Node.js, Python, or developer tools.

## Install on macOS

Apple Silicon (M1 or later) and macOS 15+ are required. Open the DMG, drag **Anarlog Local** to **Applications**, and launch it there. Verify the download against the release's `SHA256SUMS` first.

Experimental releases are signed ad hoc and are **not notarized by Apple**. Gatekeeper can block a downloaded app; if you trust the release, follow [Apple's per-app Open Anyway instructions](https://support.apple.com/en-us/102445). A managed Mac may require its administrator's approval. Do not disable Gatekeeper globally or remove quarantine attributes.

Grant microphone and system-audio permissions when needed for your recording method. Accessibility is only needed for features that insert text into another application, such as dictation. The app has its own ID (`so.anarlog.local-ai`) and storage. No other user's notes, accounts, keys, or private service addresses are included. Updates are manual: stop recording, fully quit, and replace the app with a newer Local release. Back up important notes before updating.

## Configure your two AI services

Open Settings and configure each service independently:

| Setting  | Transcription                 | Intelligence / LLM          |
| -------- | ----------------------------- | --------------------------- |
| Provider | Custom                        | Custom                      |
| Base URL | Your speech API base URL      | Your text API base URL      |
| API key  | Your speech-service key       | Your text-service key       |
| Model    | Exact speech model identifier | Exact text model identifier |

For example, use `https://inference.example.com/v1` as the API base, not a dashboard URL or the full `/audio/transcriptions` or `/chat/completions` endpoint. The URLs may be the same for a shared gateway; the settings remain separate. Use HTTPS for remote services; local runtimes may use their loopback HTTP address. Save each provider, then select it and its model. Model discovery uses `/models` when supported. The speech model can also be entered manually. Each key must have access to the selected model; `403 key_model_access_denied` requires fixing access at the gateway.

Custom transcription uploads audio to `/audio/transcriptions` **after recording**. Summaries and chat use the configured LLM. Your own-provider paths need no Anarlog subscription, but your services retain their own authentication, limits, and costs. Remote providers receive the audio or text sent to them.

Test a short non-sensitive recording, playback, transcription, summary, and note persistence after restart. Installation and recording on another person's Mac are not implied by build/API tests.

## Local features and distribution

Recording, MP3 audio, transcription, summaries, chat, and automatic keyword hints are retained. The `local-only` feature excludes SQLite Sync from the desktop and embedded CLI. Cross-device CloudSync and hosted paid services are not included. Ordinary new local SQLite databases work; initialized CloudSync replicas are deliberately refused without the extension. Use supported export/import paths rather than deleting replica metadata. Intel, Windows, Linux, mobile, App Store, and automatic-updater releases are outside this Local workflow.

Independent community source files retain their MIT grants. Third-party GPL/LGPL components, including the POS keyword tagger and MP3/LAME encoder, retain their original notices and terms. The combined distribution is provided under GPL-3.0-or-later where required. Each release includes exact application sources, dependency sources (including LAME C sources and Swift checkouts), and notices. Apple SDKs/tools and optional model weights are obtained separately under their own terms. No private signing key is required to modify, rebuild, and ad-hoc sign a Local copy.

## Rebuild or publish a future version

Use a clean committed checkout at the release manifest's `source_sha`, with no local dotenv files. Install the Node/pnpm and Rust versions in `package.json` and `rust-toolchain.toml`, plus Xcode and Metal:

```sh
pnpm install --frozen-lockfile
node scripts/build-local-ai.mjs --check
node scripts/build-local-ai.mjs --build
python3 scripts/package-local-release.py target/local-release
```

To replace an LGPL dependency, modify its included source, point the package at that local version (`[patch.crates-io]` for Rust or a package-manager local dependency override for JavaScript), intentionally update its lockfile, commit, and rebuild the application with the same commands. Preserve original notices. Dependency source archives supplement the normal pinned public downloads.

The builder clears inherited service configuration, remaps compiler paths, excludes unused SF Pro assets and SQLite Sync, embeds the source SHA, and checks artifact privacy. The packager verifies the embedded CLI/MCP, adds sources/notices, seals the app, and creates the DMG, manifest, and checksums.

For GitHub builds, update the committed Local version, then open **Actions → Anarlog Local release → Run workflow**. Leave `publish` disabled for a build-only check or enable it to publish a new experimental `local-v<version>` release after successful packaging. Existing release tags are never overwritten. The workflow uses public macOS runners and needs no upstream hosting, telemetry, model-provider, or signing secrets.
