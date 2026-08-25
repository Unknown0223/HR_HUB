# -*- coding: utf-8 -*-
from pathlib import Path

root = Path(r"C:/Users/UNKNOWN_007/AppData/Roaming/Cursor/User/History")
hits = []
for p in root.rglob("*.tsx"):
    if p.stat().st_size < 90000:
        continue
    try:
        text = p.read_text(encoding="utf-8", errors="replace")
    except Exception:
        continue
    if (
        "plannedAccruals" in text
        and "tab === 'absences'" in text
        and "function EmployeeDetailPage" in text
    ):
        hits.append((p.stat().st_size, p.stat().st_mtime, str(p)))

print("hits", len(hits))
for h in sorted(hits, reverse=True)[:15]:
    print(h)
