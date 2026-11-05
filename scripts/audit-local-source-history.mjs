import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const paths = [
  "crates/cloudsync/vendor",
  "crates/cloudsync/patches",
  ":(glob)**/*SF-Pro*",
  ":(glob)**/*BrillTransformationRules*",
  ":(glob)**/node_modules/pos/**",
];

function git(cwd, args, input) {
  const result = spawnSync("git", args, {
    cwd,
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(result.stderr.trim() || "Git read failed");
  return result.stdout;
}

export function auditSourceHistory(
  cwd,
  ref = "HEAD",
  comparisonRef = "origin/main",
) {
  const commit = git(cwd, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${ref}^{commit}`,
  ]).trim();
  // Read the complete object listing: rev-list's object traversal does not
  // consistently descend wildcard pathspecs, even when ls-files matches them.
  const relevant = (path) =>
    path.startsWith("crates/cloudsync/vendor/") ||
    path.startsWith("crates/cloudsync/patches/") ||
    /SF-Pro|BrillTransformationRules|node_modules\/pos\//i.test(path);
  const list = git(cwd, ["rev-list", "--objects", commit])
    .split("\n")
    .filter((line) => line.includes(" "))
    .map((line) => ({
      object: line.slice(0, line.indexOf(" ")),
      samplePath: line.slice(line.indexOf(" ") + 1),
    }))
    .filter((item) => relevant(item.samplePath));
  const byId = new Map(list.map((item) => [item.object, item]));
  const types = list.length
    ? git(
        cwd,
        ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
        `${[...byId.keys()].join("\n")}\n`,
      )
    : "";
  const current = new Set(
    git(cwd, ["ls-tree", "-r", "--format=%(objectname)", commit])
      .trim()
      .split("\n"),
  );
  let comparison = null;
  let comparisonCommit = null;
  if (comparisonRef) {
    comparisonCommit = git(cwd, [
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${comparisonRef}^{commit}`,
    ]).trim();
    comparison = new Set(
      git(cwd, ["rev-list", "--objects", comparisonCommit])
        .split("\n")
        .map((line) => line.split(" ")[0]),
    );
  }
  const objects = types
    .trim()
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const [object, type, bytes] = line.split(" ");
      if (type !== "blob") return [];
      return [
        {
          ...byId.get(object),
          bytes: Number(bytes),
          inCurrentTree: current.has(object),
          reachableFromComparison: comparison?.has(object) ?? null,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.samplePath.localeCompare(b.samplePath) ||
        a.object.localeCompare(b.object),
    );
  return {
    schema: 1,
    commit,
    comparisonCommit,
    sourceHistoryCommits: Number(
      git(cwd, ["rev-list", "--count", commit]).trim(),
    ),
    publicationClearance: "not assessed",
    scope: paths,
    limitations: [
      "Inventory of selected path-labelled Git blobs, not a copyright or license grant.",
      "samplePath is one Git-reported path per object, not every historical alias.",
      "Dependencies referenced by lockfiles and code embedded in other artifacts need separate review.",
      "Removing a file at HEAD does not remove objects reachable through parents or other public refs.",
    ],
    currentBlobs: objects.filter((item) => item.inCurrentTree).length,
    historyOnlyBlobs: objects.filter((item) => !item.inCurrentTree).length,
    objects,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [repo = ".", ref = "HEAD", comparison = "origin/main"] =
    process.argv.slice(2);
  console.log(
    JSON.stringify(
      auditSourceHistory(
        resolve(repo),
        ref,
        comparison === "-" ? null : comparison,
      ),
      null,
      2,
    ),
  );
}
