"""Reset LAN device password via working GW memory, unlock face auth, re-enroll key faces."""
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

API = "https://hr-hubapi-production.up.railway.app"
GW = "http://127.0.0.1:8800"
DEVICE = "34b673f8-5b7e-4a81-ba7d-577c408cff72"
HOST = "192.168.0.116"
NEW_PWD = os.environ.get("HIK_NEW_PASSWORD") or ""
EMAIL = "admin@demo.local"
PASS = "Demo1234!"

# Key people to re-enroll (empNo on device = digits from tab / external)
KEY_FACES = [
    # (label, employee_id_on_api_or_external, photo_candidates)
    ("FACE_ANVAR", "1", [Path(r"D:\hr-hub\data\verifix-dump\live\photos\1.jpg")]),
    (
        "XAMIDOV",
        "124248",
        [
            Path(r"D:\hr-hub\data\verifix-dump\live\photos\94110.jpg"),
            Path(r"D:\hr-hub\data\verifix-dump\live\photos\124248.jpg"),
        ],
    ),
]


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
            payload = {"raw": raw[:400]}
        return e.code, payload


def gw(method: str, path: str, body=None, timeout=60):
    return req(method, path, body=body, base=GW, timeout=timeout)


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
        results = []
        for path in (
            "/ISAPI/AccessControl/CardReaderCfg/1?format=json",
            "/ISAPI/AccessControl/CardReaderCfg?format=json",
        ):
            g = await c.get(path)
            if g.status_code >= 400:
                results.append(f"{path}:get={g.status_code}")
                continue
            data = g.json() if g.content else {}
            cfg = data.get("CardReaderCfg")
            if isinstance(cfg, list):
                cfg = cfg[0] if cfg else {}
            if not isinstance(cfg, dict) or not cfg:
                results.append(f"{path}:empty")
                continue
            was = cfg.get("enable")
            payload = dict(cfg)
            payload["enable"] = True
            put = await c.put(path, json={"CardReaderCfg": payload})
            results.append(f"CardReaderCfg was={was} put={put.status_code}")
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
        results.append(f"FaceRecognizeMode was={was} put={put.status_code}")
        return "; ".join(results)


def load_photo(paths: list[Path]) -> str | None:
    for p in paths:
        if p.exists() and p.stat().st_size > 100:
            return base64.b64encode(p.read_bytes()).decode("ascii")
    return None


def main() -> int:
    if not NEW_PWD:
        print("Set HIK_NEW_PASSWORD")
        return 1
    code, login = req("POST", "/api/auth/login", {"email": EMAIL, "password": PASS})
    if code >= 400:
        print("login_fail", code, login)
        return 1
    auth = {
        "Authorization": "Bearer " + login["accessToken"],
        "X-Tenant-Id": login["tenant"]["id"],
    }
    print("login_ok", login["tenant"]["id"])

    code, d = req("GET", f"/api/attendance/devices/{DEVICE}", headers=auth)
    print(
        "device",
        d.get("status"),
        d.get("host"),
        "lastSeen",
        d.get("lastSeenAt"),
        "meta",
        json.dumps(d.get("meta") or d.get("metadata") or {})[:300],
    )

    # 1) Change password on terminal using GW's working credentials
    code, res = gw(
        "POST",
        f"/devices/{DEVICE}/change-password",
        {"new_password": NEW_PWD},
        timeout=30,
    )
    print("change_password", code, res)
    if code >= 400:
        # Maybe already changed earlier in this run? try verify
        code2, res2 = gw(
            "POST",
            f"/devices/{DEVICE}/verify-password",
            {"password": NEW_PWD},
        )
        print("verify_new", code2, res2)
        if code2 >= 400:
            return 2

    # 2) Persist password in Railway
    code, res = req(
        "POST",
        f"/api/attendance/devices/{DEVICE}/sync-password",
        {"password": NEW_PWD},
        headers=auth,
    )
    print("sync_password", code, res if code >= 400 else "ok")

    # 3) Force-enable face/card auth on hardware
    unlock_msg = asyncio.run(enable_punching(NEW_PWD))
    print("unlock", unlock_msg)
    if "auth_fail" in unlock_msg or "put=4" in unlock_msg and "put=200" not in unlock_msg:
        # still continue; some firmwares return 200 only on one path
        pass

    # 4) Heartbeat + sync_clock via GW remote
    code, hb = gw("POST", f"/devices/{DEVICE}/heartbeat")
    print("gw_hb", code, hb.get("status") if isinstance(hb, dict) else hb)
    code, clk = gw(
        "POST",
        f"/devices/{DEVICE}/remote",
        {"action": "sync_clock"},
    )
    print("sync_clock", code, clk)

    # 5) Re-enroll key faces
    for label, emp_no, photos in KEY_FACES:
        b64 = load_photo(photos)
        if not b64:
            # try fetch from API employee photo
            print(label, "no_local_photo")
            continue
        code, res = gw(
            "POST",
            f"/devices/{DEVICE}/sync-face",
            {
                "employee_external_id": emp_no,
                "employee_name": label,
                "face_image_base64": b64,
            },
            timeout=120,
        )
        print("enroll", label, emp_no, code, res if code >= 400 else "ok")

    # Also try enroll current admin user if we can find BOTIROV / ANVAR by search
    code, search = req(
        "GET",
        "/api/employees?search=BOTIROV&limit=5",
        headers=auth,
    )
    items = (search.get("items") if isinstance(search, dict) else None) or []
    print("search_BOTIROV", len(items))
    for emp in items[:3]:
        tab = (emp.get("tabNumber") or "")[-8:].lstrip("0") or emp.get("tabNumber")
        print(
            " ",
            emp.get("lastName"),
            emp.get("firstName"),
            "tab",
            emp.get("tabNumber"),
            "ext",
            emp.get("externalId"),
            "hasPhoto",
            bool(emp.get("photoUrl") or emp.get("facePhotoUrl")),
        )

    # 6) Pull events + Railway heartbeat freshness
    code, pulled = gw(
        "POST", f"/devices/{DEVICE}/pull-events?publish=true", timeout=90
    )
    print("pull", code, "count=", pulled.get("count") if isinstance(pulled, dict) else pulled)

    code, d2 = req("GET", f"/api/attendance/devices/{DEVICE}", headers=auth)
    print("device_after", d2.get("status"), d2.get("lastSeenAt"))

    code, marks = req("GET", "/api/attendance/marks?limit=5", headers=auth)
    for m in (marks.get("items") or [])[:5]:
        emp = m.get("employee") or {}
        print(
            "mark",
            m.get("occurredAt"),
            m.get("employeeExternalId"),
            emp.get("lastName"),
        )

    print("DONE pwd_set=yes unlock_attempted=yes")
    print("ACTION: terminalda yuzni sinab ko'ring (admin emas, oddiy punch).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
