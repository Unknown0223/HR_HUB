# -*- coding: utf-8 -*-
from pathlib import Path

root = Path(r"C:/Users/UNKNOWN_007/AppData/Roaming/Cursor/User/History")
needles = ["loadAbsenceTypes", "absFilterApplied", "Не подтвержденные запросы", "hireDocumentId"]
hits = []
for p in root.rglob("*.tsx"):
    sz = p.stat().st_size
    if sz < 50000:
        continue
    try:
        text = p.read_text(encoding="utf-8", errors="replace")
    except Exception:
        continue
    score = sum(1 for n in needles if n in text)
    if score >= 2 and "useParams" in text and "page.module.css" in text:
        hits.append((score, sz, p.stat().st_mtime, str(p)))

print("hits", len(hits))
for h in sorted(hits, reverse=True)[:20]:
    print(h)
