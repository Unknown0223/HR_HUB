"""Append remaining August tracks that the main dump capped at 40000."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _vf_live_dump import TRACK_COLS, Client, OUT  # noqa: E402


def main():
    path = OUT / "tracks.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data["rows"]
    cols = data.get("columns") or TRACK_COLS
    print("existing", len(rows), "count", data.get("count"))
    seen = {r.get("track_id") for r in rows}
    c = Client()
    c.open_form("/vhr/htt/track_list")
    offset = len(rows)
    limit = 200
    while True:
        st, payload = c.query(
            "/vhr/htt/track_list",
            cols,
            offset=offset,
            limit=limit,
            filt=["track_time", ">=", "01.08.2026"],
            sort=["-track_time"],
        )
        if st != 200:
            print("FAIL", st, str(payload)[:300])
            break
        chunk = payload.get("data") or []
        count = int(payload.get("count") or 0)
        added = 0
        for rec in chunk:
            row = rec if isinstance(rec, dict) else {cols[i]: rec[i] if i < len(rec) else None for i in range(len(cols))}
            tid = row.get("track_id")
            if tid in seen:
                continue
            seen.add(tid)
            rows.append(row)
            added += 1
        print(f"  tracks {len(rows)}/{count} +{added}")
        if not chunk or offset + limit >= count:
            break
        offset += limit
    data["rows"] = rows
    data["count"] = count if "count" in locals() else data.get("count")
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print("wrote", len(rows))


if __name__ == "__main__":
    main()
