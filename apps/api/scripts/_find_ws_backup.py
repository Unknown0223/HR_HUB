# -*- coding: utf-8 -*-
from pathlib import Path

roots = [
    Path(r"C:\Users\UNKNOWN_007\AppData\Roaming\Cursor\User\workspaceStorage"),
    Path(r"C:\Users\UNKNOWN_007\.cursor\projects\d-0223"),
]
for root in roots:
    if not root.exists():
        continue
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        name = p.name.lower()
        if "page" in name and p.suffix in {".tsx", ".ts", ".bak", ".txt", ".jsx"}:
            if p.stat().st_size > 80000:
                print(p.stat().st_size, p)
