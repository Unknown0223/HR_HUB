# -*- coding: utf-8 -*-
from pathlib import Path
import re, json, base64

p = Path(r"d:\0223\hr-hub\apps\web\.next\static\webpack\app\(app)\employees\[id]\page.bf17d65a714c1ccd.hot-update.js")
raw = p.read_text(encoding="utf-8", errors="replace")
# find sourceMappingURL
m = re.search(r"sourceMappingURL=data:application/json;([^,]+),([^\s\"']+)", raw)
if not m:
    # try charset
    m = re.search(r"sourceMappingURL=data:application/json;charset=utf-8;base64,([A-Za-z0-9+/=]+)", raw)
    if m:
        data = base64.b64decode(m.group(1))
    else:
        # print nearby
        i = raw.find("sourceMappingURL")
        print(raw[i:i+200])
        raise SystemExit("no map")
else:
    enc, payload = m.group(1), m.group(2)
    print("enc", enc)
    if "base64" in enc:
        data = base64.b64decode(payload)
    else:
        data = payload.encode()

sm = json.loads(data)
print("keys", sm.keys())
print("sources", sm.get("sources"))
sc = sm.get("sourcesContent")
if sc:
    for i, s in enumerate(sc):
        print(i, "len", len(s) if s else None)
        if s and "absFilterOpen" in s:
            out = Path(r"d:\0223\hr-hub\apps\api\scripts\_recovered_from_map.tsx")
            out.write_text(s, encoding="utf-8")
            print("WROTE", out, len(s))
else:
    print("no sourcesContent")
