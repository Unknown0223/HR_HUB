# -*- coding: utf-8 -*-
from pathlib import Path
import re, json

p = Path(r"d:\0223\hr-hub\apps\web\.next\static\webpack\app\(app)\employees\[id]\page.d950f76d540ad958.hot-update.js")
raw = p.read_text(encoding="utf-8", errors="replace")
print("len", len(raw))
# look for sourceMappingURL or sourcesContent
for pat in ["sourcesContent", "sourceMappingURL", "//# sourceURL", "page.tsx"]:
    print(pat, raw.find(pat))

# Try bf17 and 556 too
for name in [
    "page.bf17d65a714c1ccd.hot-update.js",
    "page.556157ec545fffca.hot-update.js",
    "page.8df0a5c7a4635fe9.hot-update.js",
]:
    pp = p.parent / name
    r = pp.read_text(encoding="utf-8", errors="replace")
    print(name, "sourcesContent", r.find("sourcesContent"), "sourceURL", r.find("sourceURL"))
    # extract sourceURL paths
    urls = re.findall(r"sourceURL=([^\s\"']+)", r)
    print("  urls sample", urls[:5], "count", len(urls))
