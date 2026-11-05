import { readdirSync, readFileSync, lstatSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = process.argv[2] && resolve(process.argv[2]);
const expectedSha = process.argv[3];
if (expectedSha && !/^[0-9a-f]{40}$/.test(expectedSha))
  throw new Error("Expected a full source commit SHA.");
if (
  !app ||
  !app.endsWith(".app") ||
  !existsSync(join(app, "Contents/Info.plist"))
) {
  throw new Error("Pass the built Anarlog Local.app bundle.");
}
const vendors = ["aarch64", "x86_64"]
  .map((arch) =>
    join(
      root,
      "crates/cloudsync/vendor/cloudsync/macos",
      arch,
      "cloudsync.dylib",
    ),
  )
  .filter(existsSync)
  .map((path) => readFileSync(path));
const findings = [];
const anonymousVendorCiPaths = new Set();
let files = 0;
let bytes = 0;
function check(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = lstatSync(path);
    // macOS framework links only alias files that are scanned in their real directory.
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      check(path);
      continue;
    }
    const data = readFileSync(path);
    const file = relative(app, path);
    files++;
    bytes += data.length;
    const reasons = [];
    if (
      expectedSha &&
      file === "Contents/MacOS/anarlog-local" &&
      !data.includes(Buffer.from(expectedSha))
    )
      reasons.push("source commit not embedded in executable");
    if (
      /(^|\/)(?:cloudsync\.(?:dylib|so|dll)|CloudSync\.framework)(\/|$)/i.test(
        file,
      )
    )
      reasons.push("SQLite Sync file");
    if (vendors.some((vendor) => data.includes(vendor)))
      reasons.push("embedded SQLite Sync binary");
    if (/\.(?:db|sqlite|sqlite3|pem|key)$|(^|\/)\.env(?:\.|$)/i.test(file))
      reasons.push("private data or key file requires review");
    if (/SF-Pro-Text-.*\.otf$/i.test(file))
      reasons.push("SF Pro font must not be bundled");
    // Only report file names and categories, never matching strings or secrets.
    for (let offset = 0; offset < data.length; offset += 1024 * 1024) {
      let text = data
        .subarray(offset, offset + 1024 * 1024 + 4096)
        .toString("latin1")
        // This is the deliberate, anonymous compiler-cache remapping.
        .replaceAll("/build/home/", "/build/cache/");
      // The prebuilt ONNX Runtime contains anonymous upstream CI paths.
      // Keep these visible in the report without calling them user data.
      if (text.includes("/Users/runner/work/ort-artifacts/")) {
        anonymousVendorCiPaths.add(file);
        text = text.replaceAll(
          "/Users/runner/work/ort-artifacts/",
          "/build/upstream-ort/",
        );
      }
      if (
        /\/(?:Users|home)\/[A-Za-z0-9._-]+\//.test(text) ||
        /[A-Z]:\\Users\\/i.test(text)
      )
        reasons.push("user home path");
      if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(text))
        reasons.push("private key marker");
    }
    if (reasons.length) findings.push({ file, reasons: [...new Set(reasons)] });
  }
}
check(app);
for (const file of ["licenses/Anarlog-MIT.txt", "LOCAL_INSTALL.md"]) {
  if (!existsSync(join(app, "Contents/Resources", file)))
    findings.push({ file, reasons: ["missing distribution notice"] });
}
console.log(
  JSON.stringify(
    {
      files,
      bytes,
      expectedSha,
      anonymousVendorCiPaths: [...anonymousVendorCiPaths],
      findings,
    },
    null,
    2,
  ),
);
if (findings.length) process.exitCode = 1;
