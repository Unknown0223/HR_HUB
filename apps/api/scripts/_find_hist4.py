# -*- coding: utf-8 -*-
from pathlib import Path
import json

root = Path(r"C:/Users/UNKNOWN_007/AppData/Roaming/Cursor/User/History")
n = 0
for d in root.iterdir():
    if not d.is_dir():
        continue
    e = d / "entries.json"
    if not e.exists():
        continue
    try:
        raw = e.read_text(encoding="utf-8")
    except Exception:
        continue
    if "page.tsx" in raw and ("0223" in raw or "hr-hub" in raw or "employees" in raw):
        print(d.name, raw[:600])
        print("---")
        n += 1
        if n >= 10:
            break
print("total matched", n)
