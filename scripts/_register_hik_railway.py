"""Register Hikvision on Railway HR HUB and sync via tunnel."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

API = "https://hr-hubapi-production.up.railway.app"
EMAIL = "admin@demo.local"
PASSWORD = "Demo1234!"
HOST = "192.168.0.107"
# Known candidates from earlier sessions (try in order)
PASSWORDS = ["B4101820", "b994040223"]


def req(method: str, path: str, body: dict | None = None, headers: dict | None = None):
    data = None if body is None else json.dumps(body).encode()
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if headers:
        h.update(headers)
    r = urllib.request.Request(API + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as res:
            raw = res.read().decode()
            return res.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"raw": raw[:500]}
        return e.code, payload


def main() -> int:
    code, login = req("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
    if code >= 400:
        print("LOGIN_FAIL", code, login)
        return 1
    token = login.get("accessToken") or login.get("token")
    tenant = (login.get("tenant") or {}).get("id") or (login.get("user") or {}).get(
        "tenantId"
    )
    if not token or not tenant:
        print("LOGIN_SHAPE", sorted(login.keys()))
        return 1
    print("LOGIN_OK", "tenant", tenant[:8] + "…")

    auth = {"Authorization": f"Bearer {token}", "X-Tenant-Id": tenant}

    # List existing devices
    code, devices = req("GET", "/api/attendance/devices", headers=auth)
    if isinstance(devices, list):
        for d in devices:
            host = d.get("host") or ""
            print("EXISTING", d.get("id", "")[:8], d.get("name"), host, d.get("status"))
            if host == HOST:
                print("ALREADY_HAS_HOST", d.get("id"))
                device_id = d["id"]
                break
        else:
            device_id = None
    else:
        print("DEVICES_LIST_FAIL", code, devices)
        return 1

    if not device_id:
        body = {
            "name": "Hikvision DS-K1T343",
            "serialNumber": "DS-K1T343MFWX-LAN",
            "adapterType": "hikvision_isapi",
            "host": HOST,
            "port": 80,
            "username": "admin",
            "password": PASSWORDS[0],
            "model": "DS-K1T343MFWX",
            "isActive": True,
        }
        code, created = req("POST", "/api/attendance/devices", body, auth)
        if code >= 400:
            print("CREATE_FAIL", code, created)
            return 1
        device_id = created["id"]
        print("CREATED", device_id)

    # Try sync with each password
    last_err = None
    for pwd in PASSWORDS:
        code, _ = req(
            "PATCH",
            f"/api/attendance/devices/{device_id}",
            {"password": pwd, "isActive": True, "host": HOST, "username": "admin"},
            auth,
        )
        print("PASSWORD_SET", pwd[:2] + "***", "http", code)
        code, sync = req(
            "POST", f"/api/attendance/devices/{device_id}/sync", headers=auth
        )
        print("SYNC", code, sync if code >= 400 else "ok")
        if code < 400:
            break
        last_err = sync
    else:
        print("SYNC_ALL_FAILED", last_err)
        # keep going — show heartbeat status

    code, hb = req(
        "POST", f"/api/attendance/devices/{device_id}/heartbeat", headers=auth
    )
    print("HEARTBEAT", code, hb)

    code, remote = req(
        "POST",
        f"/api/attendance/devices/{device_id}/remote",
        {"action": "sync_clock"},
        auth,
    )
    print("SYNC_CLOCK", code, remote)

    code, detail = req("GET", f"/api/attendance/devices/{device_id}", headers=auth)
    if code < 400 and isinstance(detail, dict):
        print(
            "DEVICE",
            "id=" + detail.get("id", ""),
            "status=" + str(detail.get("status")),
            "active=" + str(detail.get("isActive")),
            "host=" + str(detail.get("host")),
            "gw=" + str(detail.get("gatewayRef")),
        )
        print("WEB", f"https://hr-hubweb-production.up.railway.app/catalog/devices/{device_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
