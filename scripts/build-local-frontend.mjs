import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync("pnpm", ["-F", "@anlg/desktop", "build"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

// SF Pro is supplied by macOS. These unused upstream public assets may not be
// redistributed in an app bundle. Preserve source files and use system fonts.
for (const weight of ["Regular", "Medium", "Semibold", "Bold"]) {
  rmSync(resolve(root, `apps/desktop/dist/fonts/SF-Pro-Text-${weight}.otf`), {
    force: true,
  });
}
