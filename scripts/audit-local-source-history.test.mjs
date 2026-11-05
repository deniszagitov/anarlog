import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { auditSourceHistory } from "./audit-local-source-history.mjs";

test("a source deletion cannot hide a third-party blob from the release history inventory", () => {
  const repo = mkdtempSync(join(tmpdir(), "anarlog-history-audit-"));
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "Fixture",
    GIT_COMMITTER_NAME: "Fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  };
  function git(...args) {
    const result = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
      cwd: repo,
      env,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  try {
    git("init", "-q");
    const file = join(repo, "crates/cloudsync/vendor/cloudsync/test.so");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "independent test fixture; not a library");
    const font = join(
      repo,
      "apps/desktop/public/fonts/SF-Pro-Text-Regular.otf",
    );
    mkdirSync(dirname(font), { recursive: true });
    writeFileSync(font, "independent font-shaped fixture; not a font");
    git("add", ".");
    git("commit", "-qm", "Add test fixture");
    const base = git("rev-parse", "HEAD");
    git("rm", "-q", "crates/cloudsync/vendor/cloudsync/test.so");
    git("rm", "-q", "apps/desktop/public/fonts/SF-Pro-Text-Regular.otf");
    git("commit", "-qm", "Remove current file");
    const result = auditSourceHistory(repo, "HEAD", base);
    assert.equal(result.currentBlobs, 0);
    assert.equal(result.historyOnlyBlobs, 2);
    assert.ok(
      result.objects.some((item) => item.samplePath.includes("SF-Pro")),
    );
    assert.equal(result.objects[0].reachableFromComparison, true);
    assert.equal(result.publicationClearance, "not assessed");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
