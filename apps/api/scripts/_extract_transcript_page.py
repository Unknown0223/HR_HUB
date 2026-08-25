# -*- coding: utf-8 -*-
import json
from pathlib import Path

transcript = Path(
    r"C:\Users\UNKNOWN_007\.cursor\projects\d-0223\agent-transcripts\4ba18a08-2522-4e58-8f91-adc56447d7f8\4ba18a08-2522-4e58-8f91-adc56447d7f8.jsonl"
)

best = None
for i, line in enumerate(transcript.open(encoding="utf-8")):
    try:
        obj = json.loads(line)
    except Exception:
        continue
    msg = obj.get("message") or {}
    content = msg.get("content")
    if not isinstance(content, list):
        continue
    for part in content:
        if part.get("type") != "tool_use":
            continue
        name = part.get("name")
        inp = part.get("input") or {}
        if name == "Write" and str(inp.get("path", "")).replace("\\", "/").endswith(
            "employees/[id]/page.tsx"
        ):
            contents = inp.get("contents") or ""
            print(f"line={i} Write len={len(contents)}")
            if best is None or len(contents) > len(best[1]):
                best = (i, contents)
        if name == "StrReplace" and "employees/[id]/page.tsx" in str(inp.get("path", "")).replace(
            "\\", "/"
        ):
            ns = inp.get("new_string") or ""
            if len(ns) > 50000:
                print(f"line={i} big StrReplace new_string len={len(ns)}")

if best:
    out = Path(r"d:\0223\hr-hub\apps\api\scripts\_page_from_transcript.tsx")
    out.write_text(best[1], encoding="utf-8")
    print("wrote", out, "from line", best[0], "chars", len(best[1]))
