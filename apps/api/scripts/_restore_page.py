# -*- coding: utf-8 -*-
from pathlib import Path

src = Path(r"d:\0223\hr-hub\apps\api\scripts\_recovered_from_map.tsx")
dst = Path(r"d:\0223\hr-hub\apps\web\src\app\(app)\employees\[id]\page.tsx")
text = src.read_text(encoding="utf-8")
dst.write_text(text, encoding="utf-8")
print("restored", dst.stat().st_size)
print("family", "tab === 'family'" in text)
print("passport", "passportOpen" in text)
print("absFilter", "absFilterOpen" in text)
print("absAdd", "absAddOpen" in text)
print("lines", text.count("\n") + 1)
