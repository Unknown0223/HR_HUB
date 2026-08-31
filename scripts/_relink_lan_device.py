"""Relink LAN Hikvision to Railway without printing secrets."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

import httpx
from httpx import DigestAuth

API = "https://hr-hubapi-production.up.railway.app"
GW = "http://127.0.0.1:8800"
DEVICE = "34b673f8-5b7e-4a81-ba7d-577c408cff72"
HOST = "192.168.0.116"
EMAIL = "admin@demo.local"
WEB_PASSWORD = "Demo1234!"
CANDIDATES = [p for p in os.environ.get("HIK_PASSWORD_HISTORY", "").split("|") if p]


def req(method, path, body=None, headers=None, base=API, timeout=90):
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
        except json.JSONDecodeError:
            payload = {"raw": raw[:300]}
        return e.code, payload


def try_pwd(pwd: str) -> bool:
    if not pwd:
        return False
    try:
        r = httpx.get(
            f"http://{HOST}/ISAPI/System/deviceInfo",
            auth=DigestAuth("admin", pwd),
            timeout=8,
        )
        return r.status_code < 400
    except Exception:
        return False


def wait_unlock(seconds: int = 840) -> bool:
    """Hikvision lockTime was ~13 min; do not send passwords until it expires."""
    print(f"waiting_unlock_seconds={seconds}", flush=True)
    time.sleep(seconds)
    print("wait_done", flush=True)
    return True


def main() -> int:
    print("=== 1) DEVICE REACHABLE / WAIT UNLOCK ===", flush=True)
    try:
        r = httpx.get(f"http://{HOST}/ISAPI/System/deviceInfo", timeout=6)
        print("isapi_unauth", r.status_code, flush=True)
    except Exception as e:
        print("DEVICE_UNREACHABLE", type(e).__name__, e)
        return 1
    if not wait_unlock():
        print("STILL_LOCKED")
        return 3

    print("=== 2) LOGIN RAILWAY ===", flush=True)
    code, login = req("POST", "/api/auth/login", {"email": EMAIL, "password": WEB_PASSWORD})
    if code >= 400:
        print("LOGIN_FAIL", code)
        return 1
    auth = {
        "Authorization": f"Bearer {login['accessToken']}",
        "X-Tenant-Id": login["tenant"]["id"],
    }
    print("LOGIN_OK", flush=True)

    code, detail = req("GET", f"/api/attendance/devices/{DEVICE}", headers=auth)
    if code >= 400:
        print("DEVICE_GET_FAIL", code)
        return 1
    stored = (detail.get("passwordEnc") or "").strip()
    print(
        "railway",
        detail.get("status"),
        "host=",
        detail.get("host"),
        "active=",
        detail.get("isActive"),
        "stored_pwd=",
        "yes" if stored else "no",
        flush=True,
    )

    print("=== 3) FIND WORKING PASSWORD ===", flush=True)
    pwd_ok = None
    source = None
    if stored and try_pwd(stored):
        pwd_ok = stored
        source = "railway"
        print("pwd_ok railway", flush=True)
    else:
        if stored:
            print("pwd_railway mismatch", flush=True)
        for cand in CANDIDATES:
            if stored and cand == stored:
                continue
            if try_pwd(cand):
                pwd_ok = cand
                source = "candidate"
                print("pwd_ok candidate", flush=True)
                break
    if not pwd_ok:
        print("NO_VALID_PASSWORD")
        return 2

    print("=== 4) PATCH + SYNC TO RAILWAY ===", flush=True)
    code, patched = req(
        "PATCH",
        f"/api/attendance/devices/{DEVICE}",
        {
            "host": HOST,
            "port": 80,
            "username": "admin",
            "password": pwd_ok,
            "adapterType": "hikvision",
            "isActive": True,
        },
        headers=auth,
    )
    print("patch", code, patched.get("status") if isinstance(patched, dict) else code, flush=True)

    for action in ("sync", "heartbeat"):
        code, res = req("POST", f"/api/attendance/devices/{DEVICE}/{action}", headers=auth)
        print(action, code, (res.get("status") if isinstance(res, dict) else res), flush=True)

    for _ in range(2):
        code, res = req(
            "POST",
            f"/api/attendance/devices/{DEVICE}/remote",
            {"action": "sync_clock"},
            headers=auth,
        )
        print("sync_clock", code, res.get("ok") if isinstance(res, dict) else res, flush=True)

    # Enable face auth on terminal
    print("=== 5) ENABLE FACE AUTH ===", flush=True)
    client = httpx.Client(
        base_url=f"http://{HOST}",
        auth=DigestAuth("admin", pwd_ok),
        timeout=15.0,
    )
    try:
        path = "/ISAPI/AccessControl/FaceRecognizeMode?format=json"
        r = client.get(path)
        mode = {}
        if r.status_code < 400 and r.content:
            data = r.json()
            raw = data.get("FaceRecognizeMode") if isinstance(data, dict) else None
            if isinstance(raw, dict):
                mode = dict(raw)
        mode["enable"] = True
        mode["mode"] = "enable"
        put = client.put(path, json={"FaceRecognizeMode": mode})
        print("FaceRecognizeMode", put.status_code, flush=True)
    except Exception as e:
        print("FaceRecognizeModeERR", type(e).__name__, flush=True)
    client.close()

    code, pull = req(
        "POST",
        f"/api/attendance/devices/{DEVICE}/remote",
        {"action": "pull_events"},
        headers=auth,
    )
    print("pull", code, pull.get("count") if isinstance(pull, dict) else pull, flush=True)

    code, detail = req("GET", f"/api/attendance/devices/{DEVICE}", headers=auth)
    lock = ((detail.get("meta") or {}).get("clockGuard") or {}).get("punchLock") or {}
    print(
        "FINAL",
        detail.get("status"),
        "host=",
        detail.get("host"),
        "lock=",
        lock.get("active"),
        "lastSeen=",
        detail.get("lastSeenAt"),
        "source=",
        source,
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
