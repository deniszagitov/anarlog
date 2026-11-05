import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { localBuildEnvironment } from "./local-build-environment.mjs";

test("release child processes cannot inherit hosted frontend configuration or provider credentials", () => {
  const env = localBuildEnvironment("/Users/builder/source", "/Users/builder", {
    PATH: process.env.PATH,
    VITE_PRIVATE_ENDPOINT: "https://private.invalid",
    VITE_SUPABASE_ANON_KEY: "private-placeholder",
    OPENAI_API_KEY: "private-placeholder",
    ANARLOG_CLOUDSYNC_TOKEN: "private-placeholder",
    RUSTFLAGS: "--cfg private_configuration",
  });
  const child = spawnSync(
    process.execPath,
    ["-e", "process.stdout.write(JSON.stringify(process.env))"],
    { env, encoding: "utf8" },
  );
  assert.equal(child.status, 0);
  const actual = JSON.parse(child.stdout);
  assert.equal(child.stdout.includes("private-placeholder"), false);
  assert.equal(child.stdout.includes("private.invalid"), false);
  assert.equal(actual.VITE_PRIVATE_ENDPOINT, undefined);
  assert.equal(actual.RUSTFLAGS, undefined);
  assert.equal(actual.ANARLOG_LOCAL_ONLY, "1");
  assert.equal(actual.VITE_LOCAL_AI, "true");
  assert.equal(actual.VITE_SUPABASE_ANON_KEY, "");
  assert.equal(actual.OPENAI_API_KEY, undefined);
  assert.ok(
    actual.CARGO_ENCODED_RUSTFLAGS.includes(
      "--remap-path-prefix=/Users/builder/source=/src/anarlog",
    ),
  );
});
