"""Create portable ZIP with forward-slash paths (Windows Compress-Archive uses \\)."""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: pack_zip.py <source_dir> <out_zip>", file=sys.stderr)
        return 2
    root = Path(sys.argv[1])
    out = Path(sys.argv[2])
    if not root.is_dir():
        print(f"missing dir: {root}", file=sys.stderr)
        return 1
    if out.exists():
        out.unlink()
    out.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            zf.write(path, path.relative_to(root).as_posix())
            count += 1
    print(f"zip ok files={count} bytes={out.stat().st_size} path={out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
