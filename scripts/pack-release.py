#!/usr/bin/env python3
"""Package TabPerch into a clean zip for GitHub Releases and Chrome Web Store."""

import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
INCLUDE = ("manifest.json", "LICENSE", "_locales", "icons", "src")


def iter_files():
    for entry in INCLUDE:
        target = ROOT / entry
        if target.is_file():
            yield target
        elif target.is_dir():
            for path in sorted(target.rglob("*")):
                if path.is_file() and not path.name.startswith("."):
                    yield path


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    DIST.mkdir(parents=True, exist_ok=True)
    archive_path = DIST / f"tabperch-v{version}.zip"
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for file_path in iter_files():
            zf.write(file_path, file_path.relative_to(ROOT).as_posix())
    print(archive_path)


if __name__ == "__main__":
    main()
