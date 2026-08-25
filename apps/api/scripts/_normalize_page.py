# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r"d:\0223\hr-hub\apps\web\src\app\(app)\employees\[id]\page.tsx")
text = p.read_text(encoding="utf-8")
# Collapse double newlines from source map (line\n\nline -> line\nline)
# But keep intentional blank lines (triple+ -> single blank)
import re
# First: replace \n\n with \n (removes all blank lines)
# Then restore paragraph breaks where we had \n\n\n originally... 
# Simpler: if pattern is "X\n\nY" for every line, just do text.replace('\n\n','\n')
norm = text.replace("\r\n", "\n")
while "\n\n\n" in norm:
    norm = norm.replace("\n\n\n", "\n\n")
# If most lines are separated by blank line, collapse once
lines = norm.split("\n")
# Detect double-spaced: many empty lines alternating
empty = sum(1 for L in lines if L.strip() == "")
print("lines", len(lines), "empty", empty, "ratio", empty / max(len(lines), 1))
if empty > len(lines) * 0.4:
    # collapse consecutive empties to none between code lines — i.e. remove blank lines that sit between non-empty
    out = []
    for L in lines:
        if L.strip() == "":
            # keep one blank only if previous out line was non-empty and next will be handled... 
            # Actually for double-spaced source, EVERY other line is empty — just skip empty lines entirely
            continue
        out.append(L)
    norm = "\n".join(out) + "\n"
    print("collapsed to", norm.count("\n") + 1, "lines")
p.write_text(norm, encoding="utf-8")
print("done", p.stat().st_size)
