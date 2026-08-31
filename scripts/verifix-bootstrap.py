"""Download Verifix live data and import it into this HR Hub instance.

Needs:
  data/verifix-dump/live/credentials.json  {"login":"...","password":"..."}
  or env VERIFIX_LOGIN / VERIFIX_PASSWORD

  Local Postgres (npm run infra:up) and seeded tenant (npm run db:seed).

Usage:
  python scripts/verifix-bootstrap.py
  python scripts/verifix-bootstrap.py --dump-only
  python scripts/verifix-bootstrap.py --import-only
  python scripts/verifix-bootstrap.py --skip-tracks
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _vf_live_dump import OUT, dump_live  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"


def run_node(script: str):
    cmd = ["node", script]
    print("RUN", " ".join(cmd), "cwd=", API)
    r = subprocess.run(cmd, cwd=str(API))
    if r.returncode != 0:
        raise SystemExit(r.returncode)


def print_dump_counts():
    stats_path = OUT / "dump-stats.json"
    if not stats_path.exists():
        print("dump-stats.json yo‘q")
        return
    stats = json.loads(stats_path.read_text(encoding="utf-8"))
    print("DUMP")
    for k, v in stats.items():
        print(f"  {k}: {v}")


def main():
    p = argparse.ArgumentParser(description="Verifix -> HR Hub bootstrap")
    p.add_argument("--dump-only", action="store_true", help="Faqat Verifixdan yuklab olish")
    p.add_argument("--import-only", action="store_true", help="Faqat mavjud JSON ni bazaga yozish")
    p.add_argument("--skip-tracks", action="store_true", help="Kelish-ketish (tracks) ni tashlab ketish")
    args = p.parse_args()

    cred = OUT / "credentials.json"
    print("OUT", OUT)
    if not args.import_only and not cred.exists():
        print(
            "credentials.json topilmadi. Yozing:\n"
            f"  {cred}\n"
            '  {"login":"...","password":"..."}\n'
            "yoki VERIFIX_LOGIN / VERIFIX_PASSWORD qo‘ying."
        )
        raise SystemExit(2)

    if not args.import_only:
        dump_live(skip_tracks=args.skip_tracks)
        print_dump_counts()

    emp = OUT / "employees.json"
    if not emp.exists():
        raise SystemExit("live/employees.json yo‘q — avval dump qiling")

    if args.dump_only:
        print("DUMP-ONLY done")
        return

    run_node("scripts/import-verifix-live.js")
    run_node("scripts/import-verifix-live-extra.js")
    print("BOOTSTRAP DONE")
    print("Xodimlar: http://localhost:3000/employees")
    print("Tabel:    http://localhost:3000  → Зарплата / Табель")


if __name__ == "__main__":
    main()
