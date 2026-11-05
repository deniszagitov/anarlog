import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "local_release", Path(__file__).with_name("package-local-release.py")
)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseUploadTests(unittest.TestCase):
    def test_upload_refuses_wrong_source_tampered_assets_and_extra_private_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            asset = output / "application.dmg"
            asset.write_bytes(b"verified application fixture")
            sha = "a" * 40
            manifest = {
                "source_sha": sha,
                "version": "0.1.0",
                "artifacts": [
                    {
                        "name": asset.name,
                        "size": asset.stat().st_size,
                        "sha256": hashlib.sha256(asset.read_bytes()).hexdigest(),
                    }
                ],
            }
            (output / "release.json").write_text(json.dumps(manifest))
            sums = f"{manifest['artifacts'][0]['sha256']}  {asset.name}\n{release.digest(output / 'release.json')}  release.json\n"
            (output / "SHA256SUMS").write_text(sums)
            (output / "release-notes.md").write_text("fixture")
            release.verify_output(output, sha, "0.1.0")
            with self.assertRaisesRegex(ValueError, "identity"):
                release.verify_output(output, "b" * 40, "0.1.0")
            asset.write_bytes(b"tampered application")
            with self.assertRaisesRegex(ValueError, "checksum"):
                release.verify_output(output, sha, "0.1.0")
            asset.write_bytes(b"verified application fixture")
            (output / ".env").write_text("private fixture, never upload")
            with self.assertRaisesRegex(ValueError, "Unexpected files"):
                release.verify_output(output, sha, "0.1.0")
            (output / ".env").unlink()
            (output / "SHA256SUMS").write_text("altered checksums")
            with self.assertRaisesRegex(ValueError, "checksum file"):
                release.verify_output(output, sha, "0.1.0")


if __name__ == "__main__":
    unittest.main()
