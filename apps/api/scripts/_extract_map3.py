# -*- coding: utf-8 -*-
from pathlib import Path
import re, json, base64

p = Path(r"d:\0223\hr-hub\apps\web\.next\static\webpack\app\(app)\employees\[id]\page.bf17d65a714c1ccd.hot-update.js")
raw = p.read_text(encoding="utf-8", errors="replace")
i = raw.find("sourceMappingURL=data:application/json;charset=utf-8;base64,")
start = i + len("sourceMappingURL=data:application/json;charset=utf-8;base64,")
# read until we hit a character that's not base64 (or //)
j = start
while j < len(raw) and raw[j] in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=":
    j += 1
b64 = raw[start:j]
print("b64 len", len(b64), "next chars", repr(raw[j:j+20]))
pad = (-len(b64)) % 4
data = base64.b64decode(b64 + "=" * pad)
sm = json.loads(data.decode("utf-8"))
print("sources", sm.get("sources"))
sc = sm.get("sourcesContent") or []
for idx, s in enumerate(sc):
    if not s:
        print(idx, None)
        continue
    print(idx, len(s))
    out = Path(rf"d:\0223\hr-hub\apps\api\scripts\_map_src_{idx}.txt")
    out.write_text(s, encoding="utf-8")
    if "absFilterOpen" in s or ("tab === 'absences'" in s and "use client" in s):
        Path(r"d:\0223\hr-hub\apps\api\scripts\_recovered_from_map.tsx").write_text(s, encoding="utf-8")
        print("RECOVERED page.tsx candidate", len(s))
