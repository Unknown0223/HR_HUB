# -*- coding: utf-8 -*-
from pathlib import Path
import re, json, base64

p = Path(r"d:\0223\hr-hub\apps\web\.next\static\webpack\app\(app)\employees\[id]\page.bf17d65a714c1ccd.hot-update.js")
raw = p.read_text(encoding="utf-8", errors="replace")

# The map is inside an eval("...") string — find and unescape
i = raw.find("sourceMappingURL=data:application/json")
print("idx", i)
snippet = raw[i:i+120]
print("snippet", snippet)

# Grab until end of eval string - look for base64 body
m = re.search(
    r"sourceMappingURL=data:application/json;charset=utf-8;base64,([A-Za-z0-9+/=\\n]+)",
    raw,
)
if not m:
    raise SystemExit("no match")
b64 = m.group(1)
# Unescape JS string escapes
b64 = b64.replace("\\n", "").replace("\\/", "/").replace("\\\\", "\\")
# Sometimes truncated by quote - find last quote context
print("b64 len", len(b64), "tail", b64[-20:])
# pad
pad = (-len(b64)) % 4
b64p = b64 + ("=" * pad)
try:
    data = base64.b64decode(b64p)
except Exception as e:
    print("decode fail", e)
    # try cut at non-b64
    clean = re.sub(r"[^A-Za-z0-9+/=]", "", b64)
    pad = (-len(clean)) % 4
    data = base64.b64decode(clean + "=" * pad)

sm = json.loads(data)
print("sources", sm.get("sources"))
sc = sm.get("sourcesContent") or []
print("contents", len(sc))
for i, s in enumerate(sc):
    if not s:
        continue
    print(i, len(s), s[:80].replace("\n", " "))
    if "EmployeeDetailPage" in s or "absFilterOpen" in s or "tab === 'absences'" in s:
        out = Path(r"d:\0223\hr-hub\apps\web\src\app\(app)\employees\[id]\page.tsx")
        # don't overwrite yet — write to scripts
        Path(r"d:\0223\hr-hub\apps\api\scripts\_recovered_from_map.tsx").write_text(s, encoding="utf-8")
        print("SAVED recovered", len(s))
