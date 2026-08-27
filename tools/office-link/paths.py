"""Office-link folders. Never logs or returns link.key contents to the UI."""
from __future__ import annotations

import sys
from pathlib import Path


def find_root() -> Path:
    starts: list[Path] = []
    if getattr(sys, "frozen", False):
        starts.append(Path(sys.executable).resolve().parent)
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        starts.append(Path(str(meipass)))
    starts.append(Path(__file__).resolve().parent)

    seen: list[Path] = []
    for start in starts:
        p = start
        for _ in range(5):
            if p not in seen:
                seen.append(p)
            p = p.parent

    for p in seen:
        if (p / "BOSHLASH.bat").is_file():
            return p
    for p in seen:
        if (p / "config.json").is_file():
            return p
    return starts[0]


def data_dir(root: Path | None = None) -> Path:
    d = (root or find_root()) / "data"
    d.mkdir(parents=True, exist_ok=True)
    return d


def runtime_dir(root: Path | None = None) -> Path:
    d = (root or find_root()) / "runtime"
    d.mkdir(parents=True, exist_ok=True)
    return d


def gw_dir(root: Path | None = None) -> Path:
    return (root or find_root()) / "gw"


def key_file(root: Path | None = None) -> Path:
    return data_dir(root) / "link.key"


def config_file(root: Path | None = None) -> Path:
    return (root or find_root()) / "config.json"


def load_config(root: Path | None = None) -> dict:
    import json

    path = config_file(root)
    if not path.is_file():
        return {
            "apiUrl": "https://hr-hubapi-production.up.railway.app",
            "webUrl": "https://hr-hubweb-production.up.railway.app",
            "tenantCode": "demo",
        }
    return json.loads(path.read_text(encoding="utf-8"))


def read_link_key(root: Path | None = None) -> str:
    path = key_file(root)
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8").strip()
