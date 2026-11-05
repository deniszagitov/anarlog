# Anarlog Local (fork build)

This experimental fork build stores notes locally and uses local or bring-your-own-key AI providers. It is separate from the official Anarlog application (`so.anarlog.local-ai`), uses separate application storage, and has automatic updates disabled.

## Availability and requirements

There is no verified public Local installer yet. Do not use an older developer DMG as a reviewed release. A release must identify its exact source commit, checksum, supported platform, signing status, and completed checks.

The Local build targets Apple Silicon Macs running macOS 15 or later. Intel, Windows, and Linux installers are not provided by this build script. Installation and recording on another person's Mac have not been verified.

## Signing and installation

This build script does not sign with an Apple Developer ID or notarize the application. An ad-hoc signature, if present, only checks bundle integrity; it does not establish developer identity or Apple approval. A downloaded build may be blocked by Gatekeeper, and a managed Mac may prohibit it entirely. Follow [Apple's guidance](https://support.apple.com/en-us/102445); do not disable Gatekeeper or remove quarantine attributes to make installation appear verified.

Once a reviewed installer is available, verify its published SHA-256 checksum before opening it, then copy Anarlog Local to Applications. Accept microphone, speech recognition, and system audio permissions only when required for your chosen recording method. Test recording and playback with non-sensitive sample audio first. Check your organisation's software and data policies before configuring an external AI service.

## Configure your own providers

No provider keys, accounts, notes, transcripts, or private service endpoints should be included in a release. In Settings, choose a supported local speech model or configure your own transcription provider. Configure a local LLM or your own compatible LLM endpoint and key for summaries and chat. Provider availability and usage costs depend on your own account. Custom STT and LLM endpoints are separate settings; configuring one does not configure the other.

Remote providers receive the audio or text sent to them. Local storage does not imply that every selected AI provider processes data locally. This fork does not grant access to hosted paid Anarlog services.

## Local-only storage

The `local-only` build feature excludes the SQLite Sync extension from the compiled desktop and embedded CLI. No patched or replacement SQLite Sync library is distributed by that build. Cross-device CloudSync is unavailable. The existing local SQLite fallback handles new local databases and refuses to open an initialized CloudSync replica without its extension. Do not copy an existing cloud replica into this app or delete its metadata to force it open; export/import through supported paths instead. Back up important notes before updates.

The Git repository retains upstream history and vendored files under their original licenses; excluding a library from the installer does not remove it from Git history or turn its license into MIT. Source-publication and complete third-party-notice review remain separate release requirements. See [LICENSING.md](LICENSING.md).

## Outstanding distribution review

The current frontend imports `pos@0.4.2` through `retext-pos`. Although its package metadata refers to LGPL, `BrillTransformationRules.js` has a separate GPL-3.0-or-later header and is used by the tagger. A package-level LGPL notice alone does not resolve that mixed provenance. The repository's written-approval requirement in `LICENSING.md` applies before publishing a distribution containing GPL code. Resolve this through the required rights/approval review or an agreed feature/dependency change; do not label the complete binary exclusively MIT.

The four unused desktop SF Pro source files have been removed, and Local packaging also excludes their generated copies. macOS supplies its own system font; Apple's font license does not permit embedding those SF Pro files in a distributed app. Web copies and historical Git objects remain. Other third-party notices, source requirements, and Swift/native dependencies still need complete distribution review, including the statically linked MP3/LAME dependency.

See [LOCAL_DISTRIBUTION_REVIEW.md](LOCAL_DISTRIBUTION_REVIEW.md) for the version-specific SQLite Sync license history, POS alternatives and their functional costs, source-publication scope, incomplete notices, and installation/signing options. Current upstream Apache-licensed SQLite Sync source does not by itself clear older vendored binaries or repository history. There is no completed license clearance or verified colleague installer.

## Build from source

Use a clean, committed, isolated checkout with no local `.env` files. Install the versions declared in `package.json` and `rust-toolchain.toml`, plus Xcode and its Metal toolchain, then run:

```sh
pnpm install --frozen-lockfile
node scripts/build-local-ai.mjs --check
node scripts/build-local-ai.mjs --build
```

The script remaps compiler source paths, clears inherited hosted frontend configuration, includes the MIT license, and disables the updater. The resulting bundle still requires an artifact scan, complete dependency notices, signature assessment, and a clean-machine installation check before it can be called release-ready. Path remapping is not a substitute for scanning the final binaries and web assets.
