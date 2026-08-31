"""Full recovery: Railway device online + force-enable face auth + re-enroll key faces."""
from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

import httpx
from httpx import DigestAuth

API = "https://hr-hubapi-production.up.railway.app"
DEVICE = "34b673f8-5b7e-4a81-ba7d-577c408cff72"
GW = "http://127.0.0.1:8800"
HOST = "192.168.0.116"
EMAIL = "admin@demo.local"
PASSWORD = "Demo1234!"
DEVICE_PWDS = [p for p in os.environ.get("HIK_PASSWORD_HISTORY", "").split("|") if p]
PHOTOS = Path(r"D:\hr-hub\data\verifix-dump\live\photos")


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


def emp_no(tab: str) -> str:
    digits = "".join(c for c in str(tab or "") if c.isdigit())
    return str(int(digits)) if digits else str(tab)[:32]


def enable_auth(client: httpx.Client) -> list[str]:
    ok = []
    # FaceRecognizeMode
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
        ok.append(f"FaceRecognizeMode={put.status_code}")
    except Exception as e:
        ok.append(f"FaceRecognizeModeERR={e}")

    # CardReaderCfg
    for path in (
        "/ISAPI/AccessControl/CardReaderCfg/1?format=json",
        "/ISAPI/AccessControl/CardReaderCfg?format=json",
    ):
        try:
            r = client.get(path)
            if r.status_code >= 400:
                continue
            data = r.json() if r.content else {}
            cfg = data.get("CardReaderCfg") if isinstance(data, dict) else None
            if isinstance(cfg, list):
                cfg = cfg[0] if cfg else {}
            if not isinstance(cfg, dict) or not cfg:
                continue
            payload = dict(cfg)
            payload["enable"] = True
            put = client.put(path, json={"CardReaderCfg": payload})
            ok.append(f"CardReaderCfg={put.status_code}:{path}")
            if put.status_code < 400:
                break
        except Exception as e:
            ok.append(f"CardReaderCfgERR={e}")
    return ok


def main() -> int:
    print("=== 1) LOGIN RAILWAY ===", flush=True)
    code, login = req("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
    if code >= 400:
        print("LOGIN_FAIL", code, login)
        return 1
    auth = {
        "Authorization": f"Bearer {login['accessToken']}",
        "X-Tenant-Id": login["tenant"]["id"],
    }

    print("=== 2) DEVICE SYNC/HEARTBEAT ===", flush=True)
    for action in ("sync", "heartbeat"):
        code, res = req("POST", f"/api/attendance/devices/{DEVICE}/{action}", headers=auth)
        print(action, code, res.get("status") if isinstance(res, dict) else res, flush=True)

    for _ in range(3):
        code, res = req(
            "POST",
            f"/api/attendance/devices/{DEVICE}/remote",
            {"action": "sync_clock"},
            headers=auth,
        )
        print("sync_clock", code, res.get("ok") if isinstance(res, dict) else res, flush=True)
        time.sleep(1)

    code, detail = req("GET", f"/api/attendance/devices/{DEVICE}", headers=auth)
    lock = ((detail.get("meta") or {}).get("clockGuard") or {}).get("punchLock") or {}
    print(
        "device",
        detail.get("status"),
        detail.get("host"),
        "lockActive=",
        lock.get("active"),
        "lastSeen=",
        detail.get("lastSeenAt"),
        flush=True,
    )

    print("=== 3) FORCE ENABLE FACE AUTH ON TERMINAL ===", flush=True)
    client = None
    pwd_ok = None
    for pwd in DEVICE_PWDS:
        try:
            c = httpx.Client(
                base_url=f"http://{HOST}",
                auth=DigestAuth("admin", pwd),
                timeout=15.0,
            )
            r = c.get("/ISAPI/System/deviceInfo")
            print("auth_try", pwd[:2] + "***", r.status_code, flush=True)
            if r.status_code < 400:
                client = c
                pwd_ok = pwd
                break
            c.close()
        except Exception as e:
            print("auth_fail", pwd[:2], e, flush=True)
    if not client:
        print("DEVICE_AUTH_FAILED")
        return 1
    print("enable:", enable_auth(client), flush=True)

    # Also clear GW in-memory lock by unlocking if adapter supports via remote not available —
    # re-register device so GW reconnects with fresh adapter state
    code, _ = req("POST", f"/api/attendance/devices/{DEVICE}/sync", headers=auth)
    print("re_sync", code, flush=True)

    print("=== 4) RE-ENROLL KEY FACES ===", flush=True)
    # FACE ANVAR externalId=1 / tab 1 — use latest mark photo if no file
    key_people = []
    # XAMIDOV
    key_people.append(
        {
            "emp_no": "124248",
            "name": "XAMIDOV NIZOMXON",
            "photo": PHOTOS / "94110.jpg",
        }
    )
    # Try find BOTIROV / ANVAR faces from API
    for q, prefer_tab in (("FACE", "1"), ("BOTIROV ANVAR", None), ("XAMIDOV", "0000124248")):
        code, data = req("GET", f"/api/employees?q={q}&limit=10", headers=auth)
        for e in data.get("items") or []:
            tab = str(e.get("tabNumber") or "")
            if prefer_tab and tab.lstrip("0") != prefer_tab.lstrip("0") and tab != prefer_tab:
                if e.get("externalId") != prefer_tab:
                    continue
            fp = e.get("faceProfile") or {}
            url = fp.get("photoUrl") or ""
            b64 = None
            # local by verifix id
            ext = str(e.get("externalId") or "")
            if ext.startswith("verifix:"):
                local = PHOTOS / f"{ext.split(':',1)[1]}.jpg"
                if local.exists():
                    b64 = base64.b64encode(local.read_bytes()).decode()
            if not b64 and url.startswith("data:") and "base64," in url:
                b64 = url.split("base64,", 1)[1]
            if not b64:
                continue
            no = emp_no(tab or ext)
            name = f"{e.get('lastName') or ''} {e.get('firstName') or ''}".strip()
            key_people.append({"emp_no": no, "name": name, "b64": b64})

    # FACE ANVAR from mark photo if needed
    code, marks = req("GET", "/api/attendance/marks?limit=20", headers=auth)
    for m in marks.get("items") or []:
        if str(m.get("employeeExternalId")) == "1" and (m.get("photoUrl") or "").startswith("data:"):
            key_people.insert(
                0,
                {
                    "emp_no": "1",
                    "name": "FACE ANVAR",
                    "b64": m["photoUrl"].split("base64,", 1)[1],
                },
            )
            break

    seen = set()
    enrolled = 0
    for person in key_people:
        no = person["emp_no"]
        if no in seen:
            continue
        seen.add(no)
        if person.get("photo") and Path(person["photo"]).exists():
            b64 = base64.b64encode(Path(person["photo"]).read_bytes()).decode()
        else:
            b64 = person.get("b64")
        if not b64:
            print("skip_no_photo", no, person.get("name"), flush=True)
            continue
        code, res = req(
            "POST",
            f"/devices/{DEVICE}/sync-face",
            {
                "employee_external_id": no,
                "employee_name": person.get("name") or no,
                "face_image_base64": b64,
            },
            base=GW,
            timeout=120,
        )
        ok = code < 400 and bool(res.get("face_enrolled"))
        print("enroll", no, person.get("name"), "OK" if ok else f"FAIL {code} {res}", flush=True)
        if ok:
            enrolled += 1
        time.sleep(0.5)

    print("=== 5) VERIFY TUNNEL + PULL ===", flush=True)
    # tunnel health from railway var via local gw
    try:
        h = httpx.get(f"{GW}/health", timeout=5)
        print("gw_health", h.status_code, h.text[:120], flush=True)
    except Exception as e:
        print("gw_health_err", e, flush=True)

    code, pull = req(
        "POST",
        f"/api/attendance/devices/{DEVICE}/remote",
        {"action": "pull_events"},
        headers=auth,
    )
    print("pull", code, pull if code >= 400 else pull.get("count"), flush=True)

    code, detail = req("GET", f"/api/attendance/devices/{DEVICE}", headers=auth)
    print(
        "FINAL",
        detail.get("status"),
        detail.get("lastSeenAt"),
        "lock=",
        ((detail.get("meta") or {}).get("clockGuard") or {}).get("punchLock", {}).get("active"),
        flush=True,
    )
    print("ENROLLED", enrolled, flush=True)

    # resolve open admin login problems
    code, probs = req("GET", "/api/attendance/problems", headers=auth)
    if isinstance(probs, list):
        for p in probs:
            if p.get("reason") == "device_admin_login" and not p.get("resolved"):
                req("PATCH", f"/api/attendance/problems/{p['id']}/resolve", headers=auth)
                print("resolved_admin_problem", p["id"], flush=True)

    client.close()
    print("DONE", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
