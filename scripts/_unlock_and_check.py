"""Force-enable face/card auth on LAN Hikvision + health check against Railway."""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import urllib.error
import urllib.request

import httpx
from httpx import DigestAuth

API = "https://hr-hubapi-production.up.railway.app"
DEVICE = "34b673f8-5b7e-4a81-ba7d-577c408cff72"
HOST = "192.168.0.116"


def req(method: str, path: str, body=None, headers=None):
    data = None if body is None else json.dumps(body).encode()
    h = {"Content-Type": "application/json"}
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
        except Exception:
            payload = {"raw": raw[:300]}
        return e.code, payload


def collect_password_candidates() -> list[str]:
    pwds: list[str] = []
    for p in (
        r"D:\hr-hub\apps\device-gw\.env",
        r"D:\hr-hub\.env",
        r"D:\hr-hub\apps\api\.env",
    ):
        if not os.path.exists(p):
            continue
        txt = open(p, encoding="utf-8", errors="ignore").read()
        for m in re.finditer(
            r"(?i)(DEVICE.*?PASS|HIK.*?PASS|TERMINAL.*?PASS|PASSWORD)\s*=\s*(.+)",
            txt,
        ):
            val = m.group(2).strip().strip('"').strip("'")
            if val and not val.startswith("$") and len(val) >= 4:
                pwds.append(val)
    extra = [p for p in os.environ.get("HIK_PASSWORD_HISTORY", "").split("|") if p]
    pwds += extra
    seen: set[str] = set()
    out: list[str] = []
    for p in pwds:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


async def try_unlock(pwd: str) -> tuple[bool, str]:
    async with httpx.AsyncClient(
        base_url=f"http://{HOST}",
        auth=DigestAuth("admin", pwd),
        timeout=10.0,
        verify=False,
    ) as c:
        r = await c.get("/ISAPI/System/deviceInfo")
        if r.status_code >= 400:
            return False, f"auth_{r.status_code}"
        sn = ""
        if "<serialNumber>" in r.text:
            sn = r.text.split("<serialNumber>")[1].split("</serialNumber>")[0]
        # Prefer CardReaderCfg
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
            return put.status_code < 400, f"CardReaderCfg sn={sn} was={was} put={put.status_code}"
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
        return put.status_code < 400, f"FaceRecognizeMode sn={sn} was={was} put={put.status_code}"


async def unlock_all(cands: list[str]) -> bool:
    for pwd in cands:
        try:
            ok, msg = await try_unlock(pwd)
            print(f"unlock_try pwd_len={len(pwd)} ok={ok} {msg}")
            if ok:
                return True
        except Exception as e:  # noqa: BLE001
            print(f"unlock_err pwd_len={len(pwd)} {type(e).__name__}: {str(e)[:140]}")
    return False


def main() -> int:
    code, login = req(
        "POST",
        "/api/auth/login",
        {"email": "admin@demo.local", "password": "Demo1234!"},
    )
    if code >= 400:
        print("login_fail", code, login)
        return 1
    auth = {
        "Authorization": "Bearer " + login["accessToken"],
        "X-Tenant-Id": login["tenant"]["id"],
    }
    print("login_ok tenant", login["tenant"]["id"])

    code, d = req("GET", f"/api/attendance/devices/{DEVICE}", headers=auth)
    print(
        "device",
        code,
        "status=",
        d.get("status"),
        "host=",
        d.get("host"),
        "lastSeen=",
        d.get("lastSeenAt"),
    )
    meta = d.get("metadata") or {}
    if isinstance(meta, dict):
        print("meta.auth", json.dumps(meta.get("auth"), ensure_ascii=False)[:500])

    for action in ("sync", "heartbeat"):
        code, res = req(
            "POST", f"/api/attendance/devices/{DEVICE}/{action}", headers=auth
        )
        print(action, code, res.get("status") if isinstance(res, dict) else type(res).__name__)

    # Local GW state
    try:
        with urllib.request.urlopen("http://127.0.0.1:8800/health", timeout=5) as res:
            print("gw_health", res.read().decode())
    except Exception as e:  # noqa: BLE001
        print("gw_health_err", e)

    cands = collect_password_candidates()
    print("password_candidates", len(cands))
    unlocked = asyncio.run(unlock_all(cands))
    print("UNLOCKED" if unlocked else "UNLOCK_FAILED")

    # If password candidates failed, ask running GW via verify with each candidate
    # (updates adapter password) then we still need hardware enable — try remote reboot? no.
    if not unlocked:
        for pwd in cands:
            try:
                body = json.dumps({"password": pwd}).encode()
                r = urllib.request.Request(
                    f"http://127.0.0.1:8800/devices/{DEVICE}/verify-password",
                    data=body,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(r, timeout=15) as res:
                    print("gw_verify_ok", pwd[:1] + "***", res.read().decode()[:120])
                    # verify succeeded — retry unlock with this pwd
                    ok, msg = asyncio.run(try_unlock(pwd))
                    print("unlock_after_verify", ok, msg)
                    if ok:
                        unlocked = True
                        break
            except urllib.error.HTTPError as e:
                print("gw_verify", e.code, e.read().decode(errors="replace")[:120])
            except Exception as e:  # noqa: BLE001
                print("gw_verify_err", e)

    # Pull events
    try:
        r = urllib.request.Request(
            f"http://127.0.0.1:8800/devices/{DEVICE}/pull-events?publish=true",
            method="POST",
            data=b"",
        )
        with urllib.request.urlopen(r, timeout=60) as res:
            raw = res.read().decode()
            data = json.loads(raw) if raw else {}
            print("pull_events count=", data.get("count"))
    except Exception as e:  # noqa: BLE001
        print("pull_err", e)

    code, marks = req("GET", "/api/attendance/marks?limit=8", headers=auth)
    items = marks.get("items") or []
    print("recent_marks", len(items))
    for m in items[:6]:
        emp = m.get("employee") or {}
        print(
            " ",
            m.get("occurredAt"),
            m.get("employeeExternalId"),
            emp.get("lastName") or emp.get("firstName"),
            "photo" if m.get("photoUrl") or m.get("mediaUrl") else "nophoto",
        )

    # Employees with photos count (sample)
    code, emps = req("GET", "/api/employees?limit=5&hasPhoto=true", headers=auth)
    print("employees_sample", code, type(emps).__name__, str(emps)[:200])

    return 0 if unlocked else 2


if __name__ == "__main__":
    sys.exit(main())
