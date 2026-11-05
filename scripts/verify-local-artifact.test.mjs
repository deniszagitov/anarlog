import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("artifact review rejects private paths and prohibited fonts without printing matching data", () => {
  const dir = mkdtempSync(join(tmpdir(), "anarlog-artifact-review-"));
  try {
    const app = join(dir, "Anarlog Local.app");
    const resources = join(app, "Contents/Resources");
    const binary = join(app, "Contents/MacOS/anarlog-local");
    const font = join(resources, "SF-Pro-Text-Regular.otf");
    mkdirSync(join(resources, "licenses"), { recursive: true });
    mkdirSync(dirname(binary), { recursive: true });
    writeFileSync(join(app, "Contents/Info.plist"), "test fixture");
    writeFileSync(join(resources, "licenses/Anarlog-MIT.txt"), "test fixture");
    writeFileSync(join(resources, "LOCAL_INSTALL.md"), "test fixture");
    const privatePath = "/Users/test-person/private-note.md";
    writeFileSync(binary, privatePath);
    writeFileSync(font, "test fixture");
    const command = fileURLToPath(
      new URL("./verify-local-artifact.mjs", import.meta.url),
    );
    const rejected = spawnSync(process.execPath, [command, app], {
      encoding: "utf8",
    });
    assert.equal(rejected.status, 1);
    assert.equal(rejected.stdout.includes(privatePath), false);
    const reasons = JSON.parse(rejected.stdout).findings.flatMap(
      (item) => item.reasons,
    );
    assert.ok(reasons.includes("user home path"));
    assert.ok(reasons.includes("SF Pro font must not be bundled"));
    writeFileSync(binary, "/build/home/.cargo/registry/example.rs");
    rmSync(font);
    const accepted = spawnSync(process.execPath, [command, app], {
      encoding: "utf8",
    });
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.deepEqual(JSON.parse(accepted.stdout).findings, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
