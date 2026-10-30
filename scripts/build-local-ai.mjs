import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import { delimiter, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  const swift = spawnSync("xcrun", ["--find", "swift"], { encoding: "utf8" });
  if (swift.status !== 0)
    throw new Error("Xcode's Swift compiler is unavailable.");
  const swiftPath = `'${swift.stdout.trim().replaceAll("'", "'\\''")}'`;
  const nativeTools = resolve(
    root,
    "apps/desktop/src-tauri/target/local-ai-tools",
  );
  mkdirSync(nativeTools, { recursive: true });
  // swift-rs expects the native SwiftPM output layout. Xcode 27 defaults to
  // SwiftBuild, which puts static libraries in a different directory.
  // These public packages need no Keychain credentials or permission prompts.
  writeFileSync(
    resolve(nativeTools, "swift"),
    `#!/bin/sh\ncase "$1" in\n  build)\n    shift\n    exec ${swiftPath} build --disable-keychain --build-system native "$@"\n    ;;\n  package)\n    shift\n    exec ${swiftPath} package --disable-keychain "$@"\n    ;;\nesac\nexec ${swiftPath} "$@"\n`,
    { mode: 0o755 },
  );
  const toolBin = isAbsolute(process.env.RUSTC ?? "")
    ? dirname(process.env.RUSTC)
    : isAbsolute(cargo)
      ? dirname(cargo)
      : null;
  const environment = {
    ...process.env,
    CARGO: cargo,
    CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? "4",
    PATH: [nativeTools, toolBin, process.env.PATH]
      .filter(Boolean)
      .join(delimiter),
    VITE_LOCAL_AI: "true",
    VITE_APP_URL: "http://127.0.0.1:3000",
    VITE_API_URL: "http://127.0.0.1:3001",
    VITE_AI_API_URL: "",
    VITE_ENTERPRISE_API_URL: "",
    VITE_SUPABASE_URL: "",
    VITE_SUPABASE_ANON_KEY: "",
    VITE_SENTRY_DSN: "",
    VITE_POSTHOG_API_KEY: "",
    SENTRY_DSN: "",
    POSTHOG_API_KEY: "",
  };
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
    ["run", "--locked", "--package", "xtask", "--", "prepare-binaries"],
    { cwd: root, env: environment, stdio: "inherit" },
  );
  if (binaries.error) throw binaries.error;
  if (binaries.status !== 0) process.exit(binaries.status ?? 1);
  for (const args of [
    ["-F", "@anlg/ui", "build"],
    [
      "-F",
      "@anlg/desktop",
      "tauri",
      "build",
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
} else {
  console.log("Preflight passed. Add --build to compile the separate app.");
}
