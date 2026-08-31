"""Dump extra Verifix lists: requests, applications, timeoff, ranks, timetable."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _vf_live_dump import Client, OUT  # noqa: E402

FORMS = [
    ("applications", "/vhr/hpd/application/application_list"),
    ("requests", "/vhr/htt/request_list"),
    ("timeoff", "/vhr/hpd/timeoff_list"),
    ("ranks", "/anor/mhr/rank_list"),
    ("timetable", "/vhr/htt/time_table_list"),
    ("dismissal_reasons", "/vhr/href/dismissal_reason_list"),
    ("request_kinds", "/vhr/htt/request_kind_list"),
    ("candidates_rep", "/vhr/rep/href/candidate"),
]


def parse_cols(html: str) -> list[str]:
    req = re.search(r'required="([^"]+)"', html)
    extra = re.search(r'extra-columns="([^"]+)"', html)
    cols: list[str] = []
    for blob in (req.group(1) if req else "", extra.group(1) if extra else ""):
        for part in re.split(r"[,\s]+", blob):
            name = part.strip()
            if name and name not in cols and re.match(r"^[A-Za-z][A-Za-z0-9_]*$", name):
                cols.append(name)
    bcols = re.findall(r'<b-col name="([A-Za-z0-9_]+)"', html)
    for name in bcols:
        if name not in cols:
            cols.append(name)
    return cols[:40] or ["name"]


def main():
    c = Client()
    import urllib.error
    import urllib.request

    stats = {}
    for name, path in FORMS:

        req = urllib.request.Request(
            "https://app2.verifix.com/page/form" + path + ".html",
            headers={"User-Agent": "Mozilla/5.0", "Referer": "https://app2.verifix.com/"},
        )
        try:
            with c.opener.open(req, timeout=30) as resp:
                html = resp.read().decode("utf-8", "replace")
                gst = resp.status
        except urllib.error.HTTPError as e:
            html = e.read().decode("utf-8", "replace")
            gst = e.code
        (OUT / f"form{path.replace('/', '_')}.html").write_text(html, encoding="utf-8")
        cols = parse_cols(html)
        print(f"FORM {name} html={gst} cols={cols[:12]}")
        if gst != 200 or "script biruni" not in html[:200].lower() and "b-grid" not in html:
            # reports may not be grids
            c.open_form(path)
            st2, probe = c.query(path, cols or ["name"], limit=1)
            print("  probe", st2, str(probe)[:180])
            if st2 != 200:
                stats[name] = ["fail", st2]
                continue
        stats[name] = c.dump_all(name, path, cols, limit=200, max_rows=8000)
    (OUT / "dump-extra-stats.json").write_text(json.dumps(stats, indent=2), encoding="utf-8")
    print("STATS", json.dumps(stats))


if __name__ == "__main__":
    main()
