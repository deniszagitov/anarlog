import { delimiter } from "node:path";

export function localBuildEnvironment(root, home, inherited = process.env) {
  const env = { ...inherited };
  // Never inherit hosted configuration, provider credentials, or compiler flags
  // into a distributable local build. Toolchain/cache locations remain usable.
  for (const key of Object.keys(env)) {
    if (
      /^(VITE_|ANARLOG_CLOUDSYNC_|CARGO_ENCODED_RUSTFLAGS$)|KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|INFISICAL|SUPABASE|SENTRY|POSTHOG/.test(
        key,
      )
    ) {
      delete env[key];
    }
  }
  const maps = [
    [home, "/build/home"],
    [root, "/src/anarlog"],
  ];
  env.CARGO_ENCODED_RUSTFLAGS = maps
    .map(([from, to]) => `--remap-path-prefix=${from}=${to}`)
    .join("\x1f");
  delete env.RUSTFLAGS;
  for (const key of ["CFLAGS", "CXXFLAGS"]) {
    env[key] = maps
      .flatMap(([from, to]) => [
        `-ffile-prefix-map=${from}=${to}`,
        `-fdebug-prefix-map=${from}=${to}`,
      ])
      .join(" ");
  }
  Object.assign(env, {
    ANARLOG_LOCAL_ONLY: "1",
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
    CARGO_PROFILE_RELEASE_DEBUG: "0",
    CARGO_PROFILE_DEV_DEBUG: "0",
    CARGO_INCREMENTAL: "0",
  });
  return env;
}

export function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function prependTools(env, ...tools) {
  env.PATH = [...tools, env.PATH].filter(Boolean).join(delimiter);
}
