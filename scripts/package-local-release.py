import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
from urllib.parse import urlsplit, urlunsplit


ROOT = Path(__file__).resolve().parent.parent


def run(*args, **kwargs):
    return subprocess.check_output(args, cwd=ROOT, text=True, **kwargs).strip()


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def normalized_member(member):
    member.uid = member.gid = 0
    member.uname = member.gname = ""
    member.pax_headers = {}
    if member.issym() and (
        Path(member.linkname).is_absolute() or ".." in Path(member.linkname).parts
    ):
        return None
    if any(
        part in {".git", "node_modules", "target", ".build", ".DS_Store"}
        or part == ".env"
        or part.startswith(".env.")
        for part in Path(member.name).parts
    ):
        return None
    return member


def verify_output(output, expected_sha, version):
    manifest = json.loads((output / "release.json").read_text())
    if manifest["source_sha"] != expected_sha or manifest["version"] != version:
        raise ValueError("Release identity does not match the requested source/version")
    expected = {"release.json", "SHA256SUMS", "release-notes.md"}
    for artifact in manifest["artifacts"]:
        name = artifact["name"]
        if Path(name).name != name or name.startswith("."):
            raise ValueError("Unsafe release artifact name")
        path = output / name
        if path.is_symlink() or not path.is_file():
            raise ValueError("Missing or indirect release artifact")
        if (
            path.stat().st_size != artifact["size"]
            or digest(path) != artifact["sha256"]
        ):
            raise ValueError("Release artifact checksum mismatch")
        expected.add(name)
    if set(path.name for path in output.iterdir()) != expected:
        raise ValueError("Unexpected files in the release upload directory")
    expected_sums = "".join(
        f"{item['sha256']}  {item['name']}\n" for item in manifest["artifacts"]
    )
    expected_sums += f"{digest(output / 'release.json')}  release.json\n"
    if (output / "SHA256SUMS").read_text() != expected_sums:
        raise ValueError(
            "Published checksum file does not match the verified artifacts"
        )


def swift_source_packages(build):
    packages = {}
    for state in sorted(build.glob("*/out/swift-rs/*/workspace-state.json")):
        for dependency in json.loads(state.read_text())["object"]["dependencies"]:
            reference = dependency["packageRef"]
            checkout = state.parent / "checkouts" / dependency["subpath"]
            if not checkout.is_dir():
                continue
            remote = urlsplit(reference["location"])
            if (
                remote.scheme != "https"
                or not remote.hostname
                or remote.username
                or remote.password
            ):
                raise ValueError(
                    "Swift dependency provenance must be a public HTTPS URL"
                )
            revision = run("git", "-C", str(checkout), "rev-parse", "HEAD")
            source = urlunsplit((remote.scheme, remote.hostname, remote.path, "", ""))
            key = f"swift/{checkout.name}@{revision}"
            packages[key] = (
                checkout,
                {
                    "name": checkout.name,
                    "version": revision,
                    "license": "See included notices and source headers; build-time patches are included in the source archive",
                    "source": source,
                },
            )
    return packages


def source_packages():
    trees = json.loads(
        run(
            "pnpm",
            "-F",
            "@anlg/desktop",
            "list",
            "--prod",
            "--depth",
            "Infinity",
            "--json",
        )
    )
    packages = {}

    def collect(node):
        for group in ("dependencies", "optionalDependencies"):
            for name, dep in node.get(group, {}).items():
                path = Path(dep.get("path", "")).resolve()
                if (path / "package.json").is_file() and "node_modules" in path.parts:
                    info = json.loads((path / "package.json").read_text())
                    key = "npm/" + name.replace("/", "__") + "@" + info["version"]
                    packages[key] = (
                        path,
                        {
                            "name": name,
                            "version": info["version"],
                            "license": info.get("license", "See included notices"),
                            "source": f"https://registry.npmjs.org/{name}/-/{name.split('/')[-1]}-{info['version']}.tgz",
                        },
                    )
                collect(dep)

    for tree in trees:
        collect(tree)
    metadata = json.loads(
        run(
            "cargo",
            "metadata",
            "--locked",
            "--offline",
            "--format-version",
            "1",
            "--filter-platform",
            "aarch64-apple-darwin",
        )
    )
    used = set(
        re.findall(
            r"^(\S+) v([^\s]+)",
            run(
                "cargo",
                "tree",
                "--locked",
                "--offline",
                "-p",
                "desktop",
                "--features",
                "local-only",
                "--target",
                "aarch64-apple-darwin",
                "--edges",
                "normal,build",
                "--prefix",
                "none",
                "--format",
                "{p}",
            ),
            re.M,
        )
    )
    for package in metadata["packages"]:
        if package.get("source") and (package["name"], package["version"]) in used:
            key = f"cargo/{package['name']}@{package['version']}"
            packages[key] = (
                Path(package["manifest_path"]).parent,
                {
                    "name": package["name"],
                    "version": package["version"],
                    "license": package.get("license") or "See included notices",
                    "source": package["source"],
                },
            )
    ort = next(
        (
            path
            for key, (path, _) in packages.items()
            if key.startswith("cargo/ort-sys@")
        ),
        None,
    )
    if ort:
        version = re.search(
            r'const ONNXRUNTIME_VERSION: &str = "([^"]+)"',
            (ort / "build.rs").read_text(),
        ).group(1)
        cache = ROOT / "target/local-release-sources" / f"onnxruntime-{version}"
        marker = cache / "source-revision.json"
        if not marker.exists():
            with urllib.request.urlopen(
                f"https://api.github.com/repos/microsoft/onnxruntime/commits/v{version}",
                timeout=30,
            ) as response:
                revision = json.load(response)["sha"]
            if not re.fullmatch(r"[0-9a-f]{40}", revision):
                raise ValueError("Invalid ONNX Runtime source revision")
            cache.mkdir(parents=True, exist_ok=True)
            archive_path = cache / "source.tar.gz"
            with urllib.request.urlopen(
                f"https://codeload.github.com/microsoft/onnxruntime/tar.gz/{revision}",
                timeout=90,
            ) as response, archive_path.open("wb") as stream:
                shutil.copyfileobj(response, stream)
            with tarfile.open(archive_path) as archive:
                archive.extractall(cache, filter="data")
            marker.write_text(
                json.dumps(
                    {"revision": revision, "archive_sha256": digest(archive_path)}
                )
            )
        revision = json.loads(marker.read_text())["revision"]
        source = cache / f"onnxruntime-{revision}"
        packages[f"native/onnxruntime@{version}"] = (
            source,
            {
                "name": "onnxruntime",
                "version": version,
                "license": "MIT; included third-party notices also apply",
                "source": f"https://github.com/microsoft/onnxruntime/tree/{revision}",
            },
        )
    build = ROOT / "apps/desktop/src-tauri/target/release/build"
    packages.update(swift_source_packages(build))
    return packages


def build_package(output):
    if run("git", "status", "--porcelain", "--untracked-files=normal"):
        raise ValueError("Package a clean committed checkout")
    sha = run("git", "rev-parse", "HEAD")
    version = json.loads(
        (ROOT / "apps/desktop/src-tauri/tauri.conf.local-ai.json").read_text()
    )["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Invalid Local version")
    output.mkdir(parents=True, exist_ok=False)
    stem = f"anarlog-local-{version}"
    app = ROOT / "apps/desktop/src-tauri/target/release/bundle/macos/Anarlog Local.app"
    subprocess.run(
        ["node", str(ROOT / "scripts/verify-local-artifact.mjs"), str(app), sha],
        check=True,
    )
    subprocess.run(
        ["python3", str(ROOT / "scripts/verify-packaged-cli.py"), str(app), version],
        check=True,
    )
    packages = source_packages()
    inventory = [{"id": key, **info} for key, (_, info) in sorted(packages.items())]
    notices = [
        f"Anarlog Local {version}\nSource commit: {sha}\n",
        "Community source files retain their MIT grants. Third-party files retain their own licenses and copyright notices. This distribution includes GPL-3.0-or-later POS rules and LGPL libraries; the combined distribution is provided under GPL-3.0-or-later where required. The exact application source, dependency sources, original per-file notices, and rebuild instructions accompany this release. You may modify and rebuild it, including replacing the LGPL libraries. No private signing key is required to build or install a modified local copy. Apple SDKs and system libraries are obtained separately from Apple. Optional model downloads have separate terms and are not included.\n",
        (ROOT / "LICENSE").read_text(),
        (ROOT / "licenses/GPL-3.0.txt").read_text(),
        (ROOT / "licenses/LGPL-3.0.txt").read_text(),
    ]
    with tarfile.open(output / f"{stem}-dependencies-source.tar.gz", "w:gz") as archive:
        for key, (path, info) in sorted(packages.items()):
            archive.add(path, arcname="dependencies/" + key, filter=normalized_member)
            notices.append(
                f"\n\n=== {key} ===\nLicense: {info['license']}\nSource: {info['source']}\n"
            )
            for notice in sorted(path.rglob("*")):
                if (
                    not notice.is_file()
                    or notice.is_symlink()
                    or ".git" in notice.parts
                    or "node_modules" in notice.relative_to(path).parts
                ):
                    continue
                if (
                    re.match(
                        r"^(?:LICEN[CS]E|COPYING|NOTICE|ThirdPartyNotices|THIRD.PARTY)",
                        notice.name,
                        re.I,
                    )
                    and notice.stat().st_size < 2_000_000
                ):
                    notices.append(
                        f"\n-- {notice.relative_to(path)} --\n"
                        + notice.read_text(errors="replace")
                    )
        # LAME's complete bundled C source is included through mp3lame-sys.
    notices_text = "\n".join(notices)
    (output / "THIRD_PARTY_NOTICES.txt").write_text(notices_text)
    resources = app / "Contents/Resources/licenses"
    resources.mkdir(parents=True, exist_ok=True)
    (resources / "THIRD_PARTY_NOTICES.txt").write_text(notices_text)
    (resources / "dependency-inventory.json").write_text(
        json.dumps(inventory, indent=2) + "\n"
    )
    subprocess.run(
        ["node", str(ROOT / "scripts/verify-local-artifact.mjs"), str(app), sha],
        check=True,
    )
    with (output / f"{stem}-source.tar.gz").open("wb") as destination:
        git = subprocess.Popen(
            [
                "git",
                "archive",
                "--format=tar",
                f"--prefix={stem}/",
                sha,
                "--",
                ".",
                ":(exclude)enterprise",
                ":(exclude)crates/cloudsync/vendor",
                ":(exclude)apps/web/public/fonts/SF-Pro-Text-*.otf",
            ],
            cwd=ROOT,
            stdout=subprocess.PIPE,
        )
        gzip = subprocess.run(
            ["gzip", "-n"], stdin=git.stdout, stdout=destination, check=True
        )
        git.stdout.close()
        if git.wait() != 0:
            raise ValueError("Source archive failed")
    subprocess.run(
        [
            "codesign",
            "--force",
            "--sign",
            "-",
            "--entitlements",
            str(ROOT / "apps/desktop/src-tauri/Entitlements.plist"),
            str(app),
        ],
        check=True,
    )
    subprocess.run(["codesign", "--verify", "--deep", "--strict", str(app)], check=True)
    with tempfile.TemporaryDirectory(prefix="anarlog-local-dmg-") as temporary:
        stage = Path(temporary)
        subprocess.run(
            ["ditto", "--norsrc", "--noextattr", str(app), str(stage / app.name)],
            check=True,
        )
        (stage / "Applications").symlink_to("/Applications")
        shutil.copyfile(ROOT / "LOCAL_INSTALL.md", stage / "INSTALL.md")
        shutil.copyfile(
            output / "THIRD_PARTY_NOTICES.txt", stage / "THIRD_PARTY_NOTICES.txt"
        )
        subprocess.run(
            [
                "hdiutil",
                "create",
                "-volname",
                "Anarlog Local",
                "-srcfolder",
                str(stage),
                "-format",
                "UDZO",
                str(output / f"{stem}-macos-arm64.dmg"),
            ],
            check=True,
        )
    artifacts = [
        {"name": p.name, "size": p.stat().st_size, "sha256": digest(p)}
        for p in sorted(output.iterdir())
    ]
    manifest = {
        "version": version,
        "source_sha": sha,
        "platform": "macos-arm64",
        "minimum_macos": "15.0",
        "signing": "ad-hoc",
        "notarized": False,
        "dependency_packages": len(packages),
        "artifacts": artifacts,
    }
    (output / "release.json").write_text(json.dumps(manifest, indent=2) + "\n")
    sums = "".join(f"{a['sha256']}  {a['name']}\n" for a in artifacts)
    (output / "SHA256SUMS").write_text(
        sums + f"{digest(output / 'release.json')}  release.json\n"
    )
    (
        output / "release-notes.md"
    ).write_text(f"""Experimental Anarlog Local {version} for Apple Silicon (macOS 15+).

Download `{stem}-macos-arm64.dmg`, copy Anarlog Local to Applications, then configure your own Custom transcription and LLM providers in Settings. Each uses its own base URL, API key, and model identifier. Speech recognition through Custom runs after recording. No provider keys, private endpoints, personal notes, or telemetry credentials are included.

This is a fork build with separate local storage, no CloudSync extension, and manual updates. It is signed ad hoc and **not notarized by Apple**. Gatekeeper may require an explicit per-app Open Anyway decision, and managed Macs may restrict installation. Installation and recording on another person's Mac have not been verified.

Source: `{sha}`. The exact application source and dependency sources are attached, together with original third-party notices and SHA-256 checksums. Independent community source files retain their MIT grants; included GPL/LGPL components retain their terms. See [installation and rebuild instructions](https://github.com/deniszagitov/anarlog/blob/{sha}/LOCAL_INSTALL.md).

The packaged CLI/MCP, source identity, and private-path/artifact checks passed. This release does not claim the full upstream multi-platform release matrix.
""")
    verify_output(output, sha, version)
    print(
        json.dumps(
            {
                "version": version,
                "source_sha": sha,
                "dependency_packages": len(packages),
                "assets": [a["name"] for a in artifacts],
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--sha")
    parser.add_argument("--version")
    args = parser.parse_args()
    if args.verify:
        verify_output(args.output.resolve(), args.sha, args.version)
        print("Release upload checksums and identity verified")
    else:
        build_package(args.output.resolve())
