"""Read device password via local Postgres tunnel and unlock punching + re-enroll."""
from __future__ import annotations

import asyncio
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

import httpx
from httpx import DigestAuth

try:
    import psycopg2
except ImportError:
    psycopg2 = None

API = "https://hr-hubapi-production.up.railway.app"
GW = "http://127.0.0.1:8800"
DEVICE = "34b673f8-5b7e-4a81-ba7d-577c408cff72"
HOST = "192.168.0.116"
PWD_FILE = Path(r"D:\hr-hub\data\verifix-dump\.device-pwd.tmp")


def req(method: str, path: str, body=None, headers=None, base=API, timeout=90):
    data = None if body is None else json.dumps(body).encode()
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    r = urllib.request.Request(base + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as res:
            raw = res.read().decode()
            return res.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except Exception:
            payload = {"raw": raw[:300]}
        return e.code, payload


def fetch_pwd() -> str:
    if PWD_FILE.exists():
        val = PWD_FILE.read_text(encoding="utf-8").strip()
        if val:
            return val
    if psycopg2 is None:
        raise RuntimeError("psycopg2 missing and no pwd file")
    # Tunnel on 55433 with credentials from DATABASE_URL rewritten
    # Use env DATABASE_URL if provided, else default railway public via tunnel
    dsn = os.environ.get("HRHUB_PG_DSN")
    if not dsn:
        # Expect tunnel: localhost:55433 user/pass from railway internal URL file
        url_file = Path("/tmp/hrhub_db_url")
        if not url_file.exists():
            # windows path via wsl not available — use env only
            raise RuntimeError("Set HRHUB_PG_DSN")
        from urllib.parse import urlparse, urlunparse

        u = urlparse(url_file.read_text().strip())
        u = u._replace(netloc=f"{u.username}:{u.password}@127.0.0.1:55433")
        dsn = urlunparse(u)
    conn = psycopg2.connect(dsn)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT password_enc FROM devices WHERE id = %s",
            (DEVICE,),
        )
        row = cur.fetchone()
        if not row or not row[0]:
            raise RuntimeError("password_enc empty")
        pwd = row[0]
        PWD_FILE.write_text(pwd, encoding="utf-8")
        return pwd
    finally:
        conn.close()


async def enable_punching(pwd: str) -> str:
    async with httpx.AsyncClient(
        base_url=f"http://{HOST}",
        auth=DigestAuth("admin", pwd),
        timeout=12.0,
        verify=False,
    ) as c:
        info = await c.get("/ISAPI/System/deviceInfo")
        if info.status_code >= 400:
            return f"auth_fail_{info.status_code}"
        out = []
        for path in (
            "/ISAPI/AccessControl/CardReaderCfg/1?format=json",
            "/ISAPI/AccessControl/CardReaderCfg?format=json",
        ):
            g = await c.get(path)
            if g.status_code >= 400:
                continue
            data = g.json() if g.content else {}
            cfg = data.get("CardReaderCfg")
            if isinstance(cfg, list):
                cfg = cfg[0] if cfg else {}
            if not isinstance(cfg, dict) or not cfg:
                continue
            was = cfg.get("enable")
            payload = dict(cfg)
            payload["enable"] = True
            put = await c.put(path, json={"CardReaderCfg": payload})
            out.append(f"CardReaderCfg was={was} put={put.status_code}")
            if put.status_code < 400:
                break
        path = "/ISAPI/AccessControl/FaceRecognizeMode?format=json"
        g = await c.get(path)
        mode: dict = {}
        if g.status_code < 400 and g.content:
            raw = (g.json() or {}).get("FaceRecognizeMode")
            if isinstance(raw, dict):
                mode = dict(raw)
        was = mode.get("enable")
        mode["enable"] = True
        mode["mode"] = "enable"
        put = await c.put(path, json={"FaceRecognizeMode": mode})
        out.append(f"FaceRecognizeMode was={was} put={put.status_code}")
        return "; ".join(out) or "no_cfg"


def main() -> int:
    pwd = fetch_pwd()
    print(f"pwd_loaded len={len(pwd)} prefix={pwd[:2]}")

    # Verify + unlock on hardware
    unlock = asyncio.run(enable_punching(pwd))
    print("unlock", unlock)
    if unlock.startswith("auth_fail"):
        return 2

    # Push password into GW memory
    code, res = req(
        "POST",
        f"/devices/{DEVICE}/verify-password",
        {"password": pwd},
        base=GW,
    )
    print("gw_verify", code, res if code >= 400 else "ok")

    code, login = req(
        "POST",
        "/api/auth/login",
        {"email": "admin@demo.local", "password": "Demo1234!"},
    )
    auth = {
        "Authorization": "Bearer " + login["accessToken"],
        "X-Tenant-Id": login["tenant"]["id"],
    }
    # Ensure Railway has same password (already does) and clear auth_failed via sync-password
    code, res = req(
        "POST",
        f"/api/attendance/devices/{DEVICE}/sync-password",
        {"password": pwd},
        headers=auth,
    )
    print("sync_password", code, "ok" if code < 400 else res)

    code, hb = req("POST", f"/api/attendance/devices/{DEVICE}/heartbeat", headers=auth)
    print("api_hb", code, hb.get("status") if isinstance(hb, dict) else hb)

    # Re-enroll key faces
    faces = [
        ("1", "FACE ANVAR", Path(r"D:\hr-hub\data\verifix-dump\live\photos\1.jpg")),
        ("124248", "XAMIDOV", Path(r"D:\hr-hub\data\verifix-dump\live\photos\94110.jpg")),
    ]
    for emp, name, photo in faces:
        if not photo.exists():
            print("skip", name, "no photo")
            continue
        b64 = base64.b64encode(photo.read_bytes()).decode("ascii")
        code, res = req(
            "POST",
            f"/devices/{DEVICE}/sync-face",
            {
                "employee_external_id": emp,
                "employee_name": name,
                "face_image_base64": b64,
            },
            base=GW,
            timeout=120,
        )
        print("enroll", name, emp, code, "ok" if code < 400 else res)

    code, pulled = req(
        "POST",
        f"/devices/{DEVICE}/pull-events?publish=true",
        base=GW,
        timeout=90,
    )
    print("pull", code, pulled.get("count") if isinstance(pulled, dict) else pulled)

    code, d = req("GET", f"/api/attendance/devices/{DEVICE}", headers=auth)
    print("device", d.get("status"), d.get("lastSeenAt"))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    finally:
        # scrub temp password file
        try:
            if PWD_FILE.exists():
                PWD_FILE.unlink()
        except Exception:
            pass
