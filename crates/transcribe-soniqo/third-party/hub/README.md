# Swift Transformers tokenizer fallback resources

Unmodified resources copied from Hugging Face `swift-transformers`, revision `b38443e44d93eca770f2eb68e2a4d0fa100f9aa2` (1.3.0), matching `swift-lib/Package.resolved`.

Source: https://github.com/huggingface/swift-transformers/tree/b38443e44d93eca770f2eb68e2a4d0fa100f9aa2/Sources/Hub/Resources

Files: `gpt2_tokenizer_config.json`, `t5_tokenizer_config.json`. Upstream project and contributors retain copyright; the copied `LICENSE` supplies the Apache-2.0 terms. No source resource was modified.

Local builds adapt the Hub resource lookup to the main application bundle and package these two files there. This avoids a developer-machine-only fallback path in SwiftPM's generated accessor. The build patch changes the Hub lookup from `Bundle.module` to `Bundle.main` for Local builds, not tokenizer behavior. The upstream resource declaration stays intact; release dead stripping is expected to discard the unused generated fallback accessor. The final binary scan checks that no developer path remains. Other builds keep the upstream resource mechanism.
