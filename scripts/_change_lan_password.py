"""Wait for Hikvision login lock, then set a new ISAPI password and save to Railway."""
from __future__ import annotations

import json
import os
import secrets
import string
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
HIST = [p for p in os.environ.get("HIK_PASSWORD_HISTORY", "").split("|") if p]


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


def xml_tag(body: str, tag: str) -> str:
    a, b = f"<{tag}>", f"</{tag}>"
    if a not in body:
        return ""
    return body.split(a)[1].split(b)[0]


def probe(pwd: str) -> tuple[int, str, str]:
    r = httpx.get(
        f"http://{HOST}/ISAPI/System/deviceInfo",
        auth=DigestAuth("admin", pwd),
        timeout=8,
    )
    return r.status_code, r.text, xml_tag(r.text, "lockStatus")


def new_password() -> str:
    alphabet = string.ascii_letters + string.digits
    body = "".join(secrets.choice(alphabet) for _ in range(8))
    pwd = f"Hr{body}9"[:16]
    if "admin" in pwd.lower():
        pwd = f"Kx{body}7"[:16]
    return pwd


def change_on_device(old_pwd: str, new_pwd: str) -> tuple[int, str]:
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<User>"
        "<id>1</id>"
        "<userName>admin</userName>"
        f"<password>{new_pwd}</password>"
        f"<loginPassword>{old_pwd}</loginPassword>"
        "<userLevel>Administrator</userLevel>"
        "</User>"
    )
    r = httpx.put(
        f"http://{HOST}/ISAPI/Security/users/1",
        content=xml.encode("utf-8"),
        headers={"Content-Type": "application/xml"},
        auth=DigestAuth("admin", old_pwd),
        timeout=15,
    )
    return r.status_code, r.text[:400]


def main() -> int:
    wait = 1520
    print(f"waiting_unlock_seconds={wait}", flush=True)
    time.sleep(wait)
    print("wait_done", flush=True)

    print("=== LOGIN RAILWAY ===", flush=True)
    code, login = req("POST", "/api/auth/login", {"email": EMAIL, "password": WEB_PASSWORD})
    if code >= 400:
        print("LOGIN_FAIL", code)
        return 1
    auth = {
        "Authorization": f"Bearer {login['accessToken']}",
        "X-Tenant-Id": login["tenant"]["id"],
    }
    code, detail = req("GET", f"/api/attendance/devices/{DEVICE}", headers=auth)
    stored = (detail.get("passwordEnc") or "").strip()
    print("device_status", detail.get("status"), "stored_pwd", "yes" if stored else "no", flush=True)

    candidates = []
    if stored:
        candidates.append(stored)
    for p in HIST:
        if p not in candidates:
            candidates.append(p)

    current = None
    for i, pwd in enumerate(candidates):
        status, body, lock = probe(pwd)
        retry = xml_tag(body, "retryLoginTime")
        unlock = xml_tag(body, "unlockTime")
        print(
            f"try_{i}",
            "status=",
            status,
            "lock=",
            lock or "none",
            "unlock=",
            unlock or "0",
            "retry=",
            retry or "-",
            flush=True,
        )
        if status < 400:
            current = pwd
            print("AUTH_OK", flush=True)
            break
        if lock == "lock":
            extra = int(unlock or "0") + 5
            print(f"re_locked waiting={extra}", flush=True)
            time.sleep(max(extra, 30))
            status2, body2, lock2 = probe(pwd)
            print("retry_after_lock", status2, "lock=", lock2 or "none", flush=True)
            if status2 < 400:
                current = pwd
                print("AUTH_OK", flush=True)
                break
            print("STILL_WRONG_OR_LOCKED")
            return 2

    if not current:
        print("NO_CURRENT_PASSWORD")
        return 2

    nxt = new_password()
    print("=== CHANGE ON TERMINAL ===", flush=True)
    st, body = change_on_device(current, nxt)
    print("change_http", st, flush=True)
    if st >= 400:
        print("CHANGE_FAIL", body.replace("\n", " ")[:240], flush=True)
        return 3

    st2, _, _ = probe(nxt)
    print("verify_new", st2, flush=True)
    if st2 >= 400:
        print("NEW_PASSWORD_NOT_ACCEPTED")
        return 3

    print("=== SAVE TO RAILWAY + GW ===", flush=True)
    code, patched = req(
        "PATCH",
        f"/api/attendance/devices/{DEVICE}",
        {
            "host": HOST,
            "port": 80,
            "username": "admin",
            "password": nxt,
            "adapterType": "hikvision",
            "isActive": True,
        },
        headers=auth,
    )
    print("patch", code, flush=True)
    for action in ("sync", "heartbeat"):
        code, res = req("POST", f"/api/attendance/devices/{DEVICE}/{action}", headers=auth)
        print(action, code, res.get("status") if isinstance(res, dict) else code, flush=True)

    print("NEW_PASSWORD", nxt, flush=True)
    print("DONE", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
