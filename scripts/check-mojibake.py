#!/usr/bin/env python3
"""Fail if double-encoded UTF-8 Cyrillic (mojibake) appears in source.

Classic symptom: «РџСЂРµРґ…» instead of «Пред…» (UTF-8 bytes read as CP1251).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".next-build",
    "tmp",
    "__pycache__",
    "release",
    "assets",
    ".turbo",
    "coverage",
    ".agents",
}
EXTS = {".ts", ".tsx", ".js", ".jsx", ".py", ".css", ".json", ".html", ".md"}
PARTIAL = ("УРґР°Р»", "Р°-СЏ", "/С‘/")


def is_mojibake_token(s: str) -> str | None:
    leads = sum(1 for c in s if c in "РС")
    if leads < 2:
        return None
    cyr = [c for c in s if "\u0400" <= c <= "\u04ff"]
    if not cyr:
        return None
    ratio = leads / len(cyr)
    if ratio < 0.35:
        return None
    try:
        fixed = s.encode("cp1251").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return None
    if fixed == s:
        return None
    fixed_cyr = sum(1 for c in fixed if "\u0400" <= c <= "\u04ff")
    if fixed_cyr < 2:
        return None
    if sum(1 for c in fixed if c in "РС") / max(1, fixed_cyr) >= ratio:
        return None
    return fixed


def main() -> int:
    bad: list[str] = []
    self_path = Path(__file__).resolve()
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in EXTS:
            continue
        if path.resolve() == self_path:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        rel = path.relative_to(ROOT)
        for i, line in enumerate(text.splitlines(), 1):
            if any(p in line for p in PARTIAL):
                bad.append(f"{rel}:{i}: partial mojibake: {line.strip()[:100]}")
                continue
            if "Р" not in line and "С" not in line:
                continue
            for m in re.finditer(r"[«»]?[РССА-Яа-яЁёA-Za-z0-9 _\-]{4,}[«»]?", line):
                fixed = is_mojibake_token(m.group())
                if fixed:
                    bad.append(
                        f"{rel}:{i}: {m.group()[:60]!r} -> {fixed[:60]!r}"
                    )
                    break
    if bad:
        print(f"Found {len(bad)} mojibake string(s):", file=sys.stderr)
        for row in bad:
            print(row, file=sys.stderr)
        return 1
    print("OK: no Cyrillic mojibake detected")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
