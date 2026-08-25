# -*- coding: utf-8 -*-
from pathlib import Path
import re

p = Path(r"d:\0223\hr-hub\apps\web\.next\static\webpack\app\(app)\employees\[id]\page.556157ec545fffca.hot-update.js")
raw = p.read_text(encoding="utf-8", errors="replace")
# Unescape the eval string roughly
for needle in [
    "absFilterPanel",
    "Родство",
    "passportOpen",
    "tab === 'family'",
    "tab === \\\\'family\\\\'",
    "family",
    "absAddOpen",
    "Плановые начисления",
    "Показать все",
    "Применить",
]:
    print(needle, needle in raw)

# Try to recover original source from source map if any
maps = list(Path(r"d:\0223\hr-hub\apps\web\.next\static\webpack\app\(app)\employees\[id]").glob("*.map"))
print("maps", len(maps))

# Check server chunk for original
srv = Path(r"d:\0223\hr-hub\apps\web\.next\server\app\(app)\employees\[id]\page.js")
print("server size", srv.stat().st_size)
sraw = srv.read_text(encoding="utf-8", errors="replace")
for needle in ["absFilterPanel", "Родство", "passportOpen", "absFilterApplied", "loadAbsenceTypes"]:
    print("srv", needle, needle in sraw)
