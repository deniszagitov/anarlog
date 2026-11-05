import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  localBuildEnvironment,
  prependTools,
  shellQuote,
} from "./local-build-environment.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = process.argv.slice(2).includes("--build");
if (
  process.argv.slice(2).some((arg) => !["--build", "--check"].includes(arg))
) {
  throw new Error(
    "Use --check for preflight or --build to create Anarlog Local.",
  );
}
const manifest = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
const pnpmVersion = manifest.packageManager.replace(/^pnpm@/, "");
const requiredRust = readFileSync(
  resolve(root, "rust-toolchain.toml"),
  "utf8",
).match(/channel\s*=\s*"([^"]+)"/)?.[1];
const filesystem = statfsSync(root);
const freeGiB = (filesystem.bavail * filesystem.bsize) / 1024 ** 3;
const cargo = process.env.CARGO ?? "cargo";
const rust = spawnSync(process.env.RUSTC ?? "rustc", ["--version"], {
  encoding: "utf8",
});
const failures = [];
if (process.platform !== "darwin" || process.arch !== "arm64") {
  failures.push("This local build targets Apple Silicon macOS.");
}
if (Number(process.versions.node.split(".")[0]) !== 22) {
  failures.push("Use Node.js 22, matching the repository CI.");
}
if (!rust.stdout?.startsWith(`rustc ${requiredRust} `)) {
  failures.push(
    `Use Rust ${requiredRust}; found ${rust.stdout?.trim() || "no rustc"}.`,
  );
}
if (process.platform === "darwin") {
  const metal = spawnSync("xcrun", ["metal", "--version"], {
    encoding: "utf8",
  });
  if (metal.status !== 0) {
    failures.push(
      /license/i.test(metal.stderr ?? "")
        ? "Review and accept the Xcode license yourself with sudo xcodebuild -license."
        : "Install the Xcode Metal toolchain with xcodebuild -downloadComponent MetalToolchain.",
    );
  }
}
if (freeGiB < 20) {
  failures.push(
    `Only ${freeGiB.toFixed(1)} GiB free; allow at least 20 GiB for a native build.`,
  );
}
console.log(
  `Local app: Anarlog Local (so.anarlog.local-ai). pnpm ${pnpmVersion}.`,
);
console.log(
  "Separate application storage; official app and notes are not modified.",
);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else if (build) {
  const status = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=normal"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  if (status.status !== 0 || status.stdout.trim()) {
    throw new Error(
      "Build from a clean committed checkout to preserve source provenance.",
    );
  }
  const revision = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  if (revision.status !== 0 || !/^[0-9a-f]{40}$/.test(revision.stdout.trim())) {
    throw new Error("Cannot establish the source commit for this build.");
  }
  for (const dir of [root, resolve(root, "apps/desktop")]) {
    for (const name of [
      ".env",
      ".env.local",
      ".env.production",
      ".env.production.local",
      ".env.supabase",
    ]) {
      if (existsSync(resolve(dir, name)))
        throw new Error(
          "Remove local dotenv files from the isolated release checkout.",
        );
    }
  }
  const swift = spawnSync("xcrun", ["--find", "swift"], { encoding: "utf8" });
  if (swift.status !== 0)
    throw new Error("Xcode's Swift compiler is unavailable.");
  const swiftPath = shellQuote(swift.stdout.trim());
  const sdk = spawnSync("xcrun", ["--sdk", "macosx", "--show-sdk-path"], {
    encoding: "utf8",
  });
  if (sdk.status !== 0) throw new Error("Xcode's macOS SDK is unavailable.");
  const sdkPath = sdk.stdout.trim();
  const nativeTools = resolve(
    root,
    "apps/desktop/src-tauri/target/local-ai-tools",
  );
  mkdirSync(nativeTools, { recursive: true });
  // swift-rs expects the native SwiftPM output layout. Xcode 27 defaults to
  // SwiftBuild, which puts static libraries in a different directory.
  // These public packages need no Keychain credentials or permission prompts.
  const maps = [
    [homedir(), "/build/home"],
    [root, "/src/anarlog"],
  ];
  const swiftMaps = maps.flatMap(([from, to]) => [
    "-file-prefix-map",
    `${from}=${to}`,
    "-debug-prefix-map",
    `${from}=${to}`,
  ]);
  const clangMaps = maps
    .flatMap(([from, to]) => [
      `-ffile-prefix-map=${from}=${to}`,
      `-fdebug-prefix-map=${from}=${to}`,
    ])
    .flatMap((arg) => ["-Xcc", arg, "-Xcxx", arg])
    .map(shellQuote)
    .join(" ");
  const packageMaps = swiftMaps
    .flatMap((arg) => ["-Xswiftc", arg])
    .map(shellQuote)
    .join(" ");
  writeFileSync(
    resolve(nativeTools, "swift"),
    `#!/bin/sh\ncase "$1" in\n  build) shift; exec ${swiftPath} build --disable-keychain --build-system native --sdk ${shellQuote(sdkPath)} ${packageMaps} ${clangMaps} "$@" ;;\n  package) shift; exec ${swiftPath} package --disable-keychain "$@" ;;\nesac\nexec ${swiftPath} "$@"\n`,
    { mode: 0o755 },
  );
  const swiftc = spawnSync("xcrun", ["--find", "swiftc"], { encoding: "utf8" });
  if (swiftc.status !== 0)
    throw new Error("Xcode's Swift compiler is unavailable.");
  writeFileSync(
    resolve(nativeTools, "swiftc"),
    `#!/bin/sh\nexec ${shellQuote(swiftc.stdout.trim())} -sdk ${shellQuote(sdkPath)} -module-cache-path ${shellQuote(resolve(nativeTools, "module-cache"))} ${swiftMaps.map(shellQuote).join(" ")} "$@"\n`,
    { mode: 0o755 },
  );
  const toolBin = isAbsolute(process.env.RUSTC ?? "")
    ? dirname(process.env.RUSTC)
    : isAbsolute(cargo)
      ? dirname(cargo)
      : null;
  const environment = localBuildEnvironment(root, homedir());
  Object.assign(environment, {
    CARGO: cargo,
    VERGEN_GIT_SHA: revision.stdout.trim(),
    APP_VERSION: JSON.parse(
      readFileSync(
        resolve(root, "apps/desktop/src-tauri/tauri.conf.local-ai.json"),
        "utf8",
      ),
    ).version,
    CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? "4",
    // Stripped host dylibs can have misaligned LINKEDIT string pools on macOS 27.
    CARGO_PROFILE_RELEASE_BUILD_OVERRIDE_STRIP: "none",
    CARGO_PROFILE_DEV_BUILD_OVERRIDE_STRIP: "none",
  });
  prependTools(environment, nativeTools, toolBin);
  const startupCheck = spawnSync(
    cargo,
    [
      "test",
      "--locked",
      "--release",
      "--package",
      "tauri-plugin-analytics",
      "local_release_starts_without_an_analytics_key",
      "--lib",
    ],
    {
      cwd: resolve(root, "apps/desktop/src-tauri"),
      env: environment,
      stdio: "inherit",
    },
  );
  if (startupCheck.error) throw startupCheck.error;
  if (startupCheck.status !== 0) process.exit(startupCheck.status ?? 1);
  const binaries = spawnSync(
    cargo,
    [
      // The workspace's wildcard dev profile takes precedence over build-override.
      "--config",
      'profile.dev.package."*".strip="none"',
      "run",
      "--locked",
      "--package",
      "xtask",
      "--",
      "prepare-binaries",
    ],
    { cwd: root, env: environment, stdio: "inherit" },
  );
  if (binaries.error) throw binaries.error;
  if (binaries.status !== 0) process.exit(binaries.status ?? 1);
  for (const args of [
    ["-F", "@anlg/ui", "build"],
    [
      "-F",
      "@anlg/desktop",
      "tauri:build",
      "--runner",
      cargo,
      "--bundles",
      "app",
      "--no-sign",
      "--config",
      "src-tauri/tauri.conf.local-ai.json",
      "--",
      "--locked",
    ],
  ]) {
    const result = spawnSync(
      "npx",
      ["--yes", "--package", `pnpm@${pnpmVersion}`, "pnpm", ...args],
      {
        cwd: root,
        env: environment,
        stdio: "inherit",
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  const app = resolve(
    root,
    "apps/desktop/src-tauri/target/release/bundle/macos/Anarlog Local.app",
  );
  // Seal bundle integrity without credentials. This is not a Developer ID
  // signature or notarization and does not make Gatekeeper accept the app.
  for (const args of [
    [
      "--force",
      "--sign",
      "-",
      "--entitlements",
      resolve(root, "apps/desktop/src-tauri/Entitlements.plist"),
      app,
    ],
    ["--verify", "--deep", "--strict", app],
  ]) {
    const result = spawnSync("codesign", args, { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  const audit = spawnSync(
    process.execPath,
    [
      resolve(root, "scripts/verify-local-artifact.mjs"),
      app,
      revision.stdout.trim(),
    ],
    { stdio: "inherit" },
  );
  if (audit.status !== 0) process.exit(audit.status ?? 1);
} else {
  console.log("Preflight passed. Add --build to compile the separate app.");
}
