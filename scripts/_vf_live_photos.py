"""Download Verifix employee face photos (photo_sha) without rewriting rows.

Saves JPEGs to data/verifix-dump/live/photos/{employee_id}.jpg
Default: working staff (status=W). Pass --all for dismissed too.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _vf_live_dump import BASE, OUT, Client  # noqa: E402

PHOTOS = OUT / "photos"


def main():
    want_all = "--all" in sys.argv
    emps = json.loads((OUT / "employees.json").read_text(encoding="utf-8"))["rows"]
    rows = [e for e in emps if e.get("photo_sha") and e.get("employee_id")]
    if not want_all:
        rows = [e for e in rows if e.get("status") == "W"]
    PHOTOS.mkdir(parents=True, exist_ok=True)
    c = Client()
    ok = skip = fail = 0
    for i, e in enumerate(rows, 1):
        eid = str(e["employee_id"])
        dest = PHOTOS / f"{eid}.jpg"
        if dest.exists() and dest.stat().st_size > 200:
            skip += 1
            continue
        sha = e["photo_sha"]
        url = f"{BASE}/b/biruni/m:load_image_v2?_v=2&sha={urllib.parse.quote(sha)}"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0", "Referer": BASE + "/"},
        )
        try:
            with c.opener.open(req, timeout=45) as resp:
                data = resp.read()
            if not data.startswith(b"\xff\xd8"):
                fail += 1
                print(f"  not-jpeg {eid} {len(data)}", flush=True)
                continue
            dest.write_bytes(data)
            ok += 1
        except Exception as err:
            fail += 1
            print(f"  FAIL {eid} {err}", flush=True)
        if i % 50 == 0 or i == len(rows):
            print(f"photos {i}/{len(rows)} saved={ok} skip={skip} fail={fail}", flush=True)
        time.sleep(0.04)
    print("DONE", json.dumps({"saved": ok, "skipped": skip, "fail": fail, "wanted": len(rows)}))


if __name__ == "__main__":
    main()
