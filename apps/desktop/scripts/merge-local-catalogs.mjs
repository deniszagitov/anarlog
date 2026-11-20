import { formatter } from "@lingui/format-po";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" });
const locales = "apps/desktop/src/i18n/locales";
const unresolved = git("diff", "--name-only", "--diff-filter=U", "-z")
  .split("\0")
  .filter(Boolean);
const catalogPath =
  /^apps\/desktop\/src\/i18n\/locales\/[^/]+\/messages\.(po|ts)$/;
if (unresolved.some((path) => !catalogPath.test(path))) {
  throw new Error(
    "Resolve and stage source conflicts before extracting messages.",
  );
}
if (!unresolved.length) {
  console.log("No conflicting desktop catalogs.");
  process.exit(0);
}
const po = formatter({ lineNumbers: false });
const writes = new Map();
const conflicts = [];
for (const path of unresolved.filter((path) => path.endsWith(".po"))) {
  // Delete/modify conflicts need a human decision. A missing base is normal for add/add.
  const stages = git("ls-files", "-u", "--", path);
  const read = (stage) => git("show", `:${stage}:${path}`);
  if (!stages.includes(" 2\t") || !stages.includes(" 3\t")) {
    conflicts.push(`${path}: catalog added or deleted on one side`);
    continue;
  }
  const base = stages.includes(" 1\t") ? po.parse(read(1)) : {};
  const ours = po.parse(read(2));
  const incoming = read(3);
  const theirs = po.parse(incoming);
  const merged = { ...ours, ...theirs };
  for (const [id, local] of Object.entries(ours)) {
    const remote = theirs[id];
    if (!remote || local.translation === remote.translation) continue;
    if (local.translation === (base[id]?.translation ?? "")) continue;
    if (remote.translation === (base[id]?.translation ?? "")) {
      merged[id] = { ...remote, translation: local.translation };
    } else {
      conflicts.push(`${path}: ${local.message || id}`);
    }
  }
  writes.set(
    path,
    po.serialize(merged, {
      locale: basename(dirname(path)),
      sourceLocale: "en",
      existing: incoming,
    }),
  );
}
if (conflicts.length) {
  throw new Error(
    "Review the overlapping translations, stage those catalogs and rerun:\n" +
      conflicts.join("\n"),
  );
}
for (const [path, content] of writes) writeFileSync(join(root, path), content);
for (const args of [
  ["extract", "--clean"],
  ["compile", "--strict"],
]) {
  execFileSync(
    "pnpm",
    ["-F", "@anlg/desktop", "exec", "lingui", ...args, "--workers", "1"],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
}
console.log(`Review the generated files, then run git add -- ${locales}`);
