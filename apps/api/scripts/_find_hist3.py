# -*- coding: utf-8 -*-
from pathlib import Path
import json

root = Path(r"C:/Users/UNKNOWN_007/AppData/Roaming/Cursor/User/History")
for d in root.iterdir():
    if not d.is_dir():
        continue
    e = d / "entries.json"
    if not e.exists():
        continue
    try:
        data = json.loads(e.read_text(encoding="utf-8"))
    except Exception:
        continue
    resource = str(data.get("resource", "")) + str(data.get("entries", ""))
    if "0223" in resource.replace("\\", "/") and "employees" in resource.lower():
        print("DIR", d)
        print(json.dumps(data, ensure_ascii=False)[:500])
        print("---")
