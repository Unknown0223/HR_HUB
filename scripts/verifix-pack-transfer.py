"""Pack Verifix JSON (unmodified copies) + Postgres snapshot for a new machine.

Does not rewrite dump rows. Credentials are never copied.

  python scripts/verifix-pack-transfer.py
  python scripts/verifix-restore-machine.py
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "data" / "verifix-dump" / "live"
PACK = ROOT / "data" / "verifix-dump" / "transfer"
DATA_NAMES = [
    "employees",
    "divisions",
    "jobs",
    "robots",
    "persons",
    "schedules",
    "locations",
    "devices",
    "tracks",
    "time_kinds",
    "request_kinds",
    "dismissal_reasons",
    "applications",
    "timeoff",
    "timetable",
    "ranks",
]


def count_file(path: Path):
    if not path.exists():
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        return {"rows": len(raw), "count": len(raw), "bytes": path.stat().st_size}
    rows = raw.get("rows") or []
    return {
        "rows": len(rows),
        "count": raw.get("count"),
        "columns": raw.get("columns"),
        "bytes": path.stat().st_size,
    }


def pg_dump_file(dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "docker",
        "exec",
        "hrhub-postgres",
        "pg_dump",
        "-U",
        "hrhub",
        "-d",
        "hrhub",
        "-Fc",
        "--no-owner",
        "--no-acl",
    ]
    print("RUN", " ".join(cmd))
    try:
        with dest.open("wb") as f:
            r = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE)
    except FileNotFoundError:
        print("docker topilmadi — Postgres snapshot o‘tkazildi")
        return False
    if r.returncode != 0:
        print(r.stderr.decode("utf-8", "replace")[:800])
        return False
    print("pg_dump", dest, dest.stat().st_size)
    return True


def pack():
    PACK.mkdir(parents=True, exist_ok=True)
    live_out = PACK / "live"
    if live_out.exists():
        shutil.rmtree(live_out)
    live_out.mkdir()

    manifest = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "source": "https://app2.verifix.com",
        "company": "OOO World of Trade",
        "filial": "88862",
        "note": "Raw Verifix JSON copies. Rows are not rewritten.",
        "files": {},
    }
    missing = []
    for name in DATA_NAMES:
        src = LIVE / f"{name}.json"
        info = count_file(src)
        if not info:
            missing.append(name)
            continue
        shutil.copy2(src, live_out / f"{name}.json")
        manifest["files"][name] = info
        print(f"copy {name:22} rows={info['rows']}")

    stats_src = LIVE / "dump-stats.json"
    if stats_src.exists():
        shutil.copy2(stats_src, live_out / "dump-stats.json")

    dumped = pg_dump_file(PACK / "hrhub.dump")
    manifest["postgresDump"] = dumped
    manifest["missing"] = missing
    (PACK / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("PACK", PACK)
    print("missing", missing)
    return manifest


def restore():
    """Restore packed JSON into this machine (import only). Credentials not required."""
    src_live = PACK / "live"
    if not src_live.exists():
        raise SystemExit(f"Paket yo‘q: {src_live} — avval verifix-pack-transfer.py")
    LIVE.mkdir(parents=True, exist_ok=True)
    for src in src_live.glob("*.json"):
        dest = LIVE / src.name
        shutil.copy2(src, dest)
        print("restore dump", dest.name)
    dump_pg = PACK / "hrhub.dump"
    if dump_pg.exists():
        print("Postgres snapshot bor:", dump_pg)
        print("Tikash: docker exec -i hrhub-postgres pg_restore -U hrhub -d hrhub --clean --if-exists < hrhub.dump")
    api = ROOT / "apps" / "api"
    r = subprocess.run(["node", "scripts/import-verifix-live.js"], cwd=str(api))
    if r.returncode != 0:
        raise SystemExit(r.returncode)
    r = subprocess.run(["node", "scripts/import-verifix-live-extra.js"], cwd=str(api))
    if r.returncode != 0:
        raise SystemExit(r.returncode)
    print("RESTORE DONE")


if __name__ == "__main__":
    if "--restore" in sys.argv:
        restore()
    else:
        pack()
