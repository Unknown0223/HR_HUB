"""Restore local transfer/hrhub.dump into Railway via the SSH tunnel on 127.0.0.1:55432."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DUMP = ROOT / "data" / "verifix-dump" / "transfer" / "hrhub.dump"
URLF = ROOT / "data" / "verifix-dump" / "_railway_url.txt"
u = urlsplit(URLF.read_text(encoding="utf-8").strip())
if not DUMP.exists():
    raise SystemExit(f"dump yo‘q: {DUMP}")

cmd = [
    "docker",
    "run",
    "--rm",
    "--add-host=host.docker.internal:host-gateway",
    "-e",
    f"PGPASSWORD={u.password}",
    "-v",
    f"{DUMP}:/dump.dump:ro",
    "postgres:16-alpine",
    "pg_restore",
    "-h",
    "host.docker.internal",
    "-p",
    str(u.port or 55432),
    "-U",
    u.username or "postgres",
    "-d",
    (u.path or "/railway").lstrip("/"),
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-acl",
    "--verbose",
    "/dump.dump",
]
print("RESTORE_START", DUMP.name, "->", u.hostname, u.port, flush=True)
r = subprocess.run(cmd)
print("RESTORE_EXIT", r.returncode, flush=True)
sys.exit(r.returncode)
