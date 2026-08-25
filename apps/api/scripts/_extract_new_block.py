# -*- coding: utf-8 -*-
from pathlib import Path
import re

patch = Path(r"d:\0223\hr-hub\apps\api\scripts\_patch_abs_ui.py").read_text(encoding="utf-8")
m = re.search(r"NEW = r'''(.*?)'''\s*\n\ntext2", patch, flags=re.S)
if not m:
    raise SystemExit("NEW not extracted")
block = m.group(1)
# ensure trailing newline
if not block.endswith("\n"):
    block += "\n"
out = Path(r"d:\0223\hr-hub\apps\api\scripts\_absences_block.tsx")
out.write_text(block, encoding="utf-8")
print("wrote", out, "len", len(block), "has panel", "absFilterPanel" in block)
