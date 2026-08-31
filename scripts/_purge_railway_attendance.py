"""Purge attendance on Railway via tunnel URL in _railway_url.txt (no secret prints)."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
src = ROOT / "data" / "verifix-dump" / "_railway_url.txt"
if not src.exists():
    raise SystemExit("_railway_url.txt yo‘q")

raw = src.read_text(encoding="utf-8").strip()
if raw.startswith("DATABASE_URL="):
    raw = raw.split("=", 1)[1].strip().strip('"').strip("'")
u = urlsplit(raw)
if not u.username or not u.password:
    raise SystemExit("URL incomplete")

# Always use local Railway SSH tunnel
netloc = f"{u.username}:{u.password}@127.0.0.1:55432"
url = urlunsplit(("postgresql", netloc, u.path or "/railway", "", ""))
env = os.environ.copy()
env["DATABASE_URL"] = url
print("RAILWAY_ATTENDANCE_PURGE_START", "via", "127.0.0.1:55432", flush=True)
r = subprocess.run(
    ["node", "apps/api/scripts/purge-attendance.js"],
    cwd=str(ROOT),
    env=env,
)
print("RAILWAY_ATTENDANCE_PURGE_EXIT", r.returncode, flush=True)
sys.exit(r.returncode)
