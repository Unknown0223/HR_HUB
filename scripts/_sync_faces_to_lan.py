"""Sync local Verifix JPEGs to LAN Hikvision via device-gw."""
from __future__ import annotations

import base64
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

API = "https://hr-hubapi-production.up.railway.app"
DEVICE = "34b673f8-5b7e-4a81-ba7d-577c408cff72"
GW = "http://127.0.0.1:8800"
EMAIL = "admin@demo.local"
PASSWORD = "Demo1234!"
PHOTOS = Path(r"D:\hr-hub\data\verifix-dump\live\photos")
EMP_DUMP = Path(r"D:\hr-hub\data\verifix-dump\live\employees.json")
CONCURRENCY = 3


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
        except json.JSONDecodeError:
            payload = {"raw": raw[:200]}
        return e.code, payload


def emp_no_from_tab(tab: str) -> str:
    digits = "".join(ch for ch in str(tab or "") if ch.isdigit())
    if not digits:
        return str(tab)[:32]
    return str(int(digits))


def load_dump_map() -> dict[str, dict]:
    out: dict[str, dict] = {}
    if not EMP_DUMP.exists():
        return out
    data = json.loads(EMP_DUMP.read_text(encoding="utf-8"))
    for r in data.get("rows") or []:
        eid = str(r.get("employee_id") or "").strip()
        if not eid:
            continue
        out[eid] = {
            "name": (
                r.get("name")
                or f"{r.get('last_name') or ''} {r.get('first_name') or ''}"
            ).strip(),
            "employee_number": str(r.get("employee_number") or "").strip(),
            "last_name": r.get("last_name") or "",
            "first_name": r.get("first_name") or "",
        }
    return out


def main() -> int:
    code, login = req("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
    if code >= 400:
        print("LOGIN_FAIL", code, flush=True)
        return 1
    auth = {
        "Authorization": f"Bearer {login['accessToken']}",
        "X-Tenant-Id": login["tenant"]["id"],
    }
    code, _ = req("POST", f"/api/attendance/devices/{DEVICE}/sync", headers=auth)
    print("device_sync", code, flush=True)

    dump = load_dump_map()
    files = sorted(PHOTOS.glob("*.jpg"))
    print("photos", len(files), "dump_emps", len(dump), flush=True)

    cache: dict[str, dict | None] = {}

    def lookup_railway(vf_id: str) -> dict | None:
        if vf_id in cache:
            return cache[vf_id]
        q = urllib.parse.quote(f"verifix:{vf_id}")
        _c, data = req("GET", f"/api/employees?q={q}&limit=10", headers=auth)
        items = data.get("items") if isinstance(data, dict) else []
        hit = None
        for e in items or []:
            if str(e.get("externalId")) == f"verifix:{vf_id}":
                hit = e
                break
        if not hit:
            info = dump.get(vf_id) or {}
            ln = (info.get("last_name") or "").strip()
            fn = (info.get("first_name") or "").strip()
            if ln:
                q2 = urllib.parse.quote(f"{ln} {fn}".strip())
                _c, data = req("GET", f"/api/employees?q={q2}&limit=10", headers=auth)
                for e in data.get("items") or []:
                    if (e.get("lastName") or "").upper() == ln.upper() and (
                        not fn or (e.get("firstName") or "").upper() == fn.upper()
                    ):
                        hit = e
                        break
        cache[vf_id] = hit
        return hit

    def sync_file(path: Path) -> tuple[str, bool, str]:
        vf_id = path.stem
        emp = lookup_railway(vf_id)
        info = dump.get(vf_id) or {}
        if emp:
            tab = emp.get("tabNumber") or info.get("employee_number") or ""
            name = (
                f"{emp.get('lastName') or ''} {emp.get('firstName') or ''}".strip()
                or info.get("name")
                or vf_id
            )
        elif info.get("employee_number"):
            tab = info["employee_number"]
            name = info.get("name") or vf_id
        else:
            return vf_id, False, "no_employee"
        no = emp_no_from_tab(tab)
        b64 = base64.b64encode(path.read_bytes()).decode("ascii")
        code, res = req(
            "POST",
            f"/devices/{DEVICE}/sync-face",
            {
                "employee_external_id": no,
                "employee_name": name or no,
                "face_image_base64": b64,
            },
            base=GW,
            timeout=90,
        )
        ok = code < 400 and bool(res.get("synced") and res.get("face_enrolled"))
        return no, ok, "ok" if ok else f"http{code}"

    ok_n = fail_n = miss = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futs = {pool.submit(sync_file, p): p for p in files}
        for i, fut in enumerate(as_completed(futs), 1):
            no, ok, detail = fut.result()
            if detail == "no_employee":
                miss += 1
            elif ok:
                ok_n += 1
            else:
                fail_n += 1
            if i % 20 == 0 or (not ok and detail != "no_employee"):
                elapsed = max(1.0, time.time() - t0)
                print(
                    f"[{i}/{len(files)}] ok={ok_n} fail={fail_n} miss={miss} "
                    f"{no} {detail} {ok_n/elapsed:.2f}/s",
                    flush=True,
                )

    print(
        f"DONE ok={ok_n} fail={fail_n} miss={miss} sec={int(time.time()-t0)}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
