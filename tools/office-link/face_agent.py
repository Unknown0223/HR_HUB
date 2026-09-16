"""Office LAN face agent — pull server queue and apply on the terminal.

No Cloudflare tunnel required: Nest only queues faces; this process (on office
PC Wi‑Fi/LAN) enrolls/deletes via ISAPI. Called from service_worker loop.
"""
from __future__ import annotations

import logging
import time
from typing import Any

from api_client import api_req, is_success
from credential_store import read_device_credential, save_device_credential
from paths import find_root, load_config, load_service_config, read_link_key

logger = logging.getLogger("face_agent")


def _is_transient_disconnect(exc: BaseException) -> bool:
    from isapi_http import is_transient_error

    return is_transient_error(exc)


def _digest_request(
    host: str,
    port: int,
    method: str,
    path: str,
    username: str,
    password: str,
    *,
    json_body: dict | None = None,
    xml_body: str | None = None,
    timeout: float = 30.0,
    retries: int = 4,
) -> tuple[int, str]:
    from isapi_http import digest_httpx

    content = None
    content_type = None
    if xml_body is not None:
        content = xml_body.encode("utf-8")
        content_type = "application/xml"
    # Face / UserInfo: longer read, short connect.
    t = (min(6.0, float(timeout)), float(timeout))
    return digest_httpx(
        host,
        port,
        method,
        path,
        username,
        password,
        json_body=json_body,
        content=content,
        content_type=content_type,
        timeout=t,
        retries=retries,
    )


def _employee_no(raw: str) -> str:
    digits = "".join(ch for ch in str(raw or "") if ch.isdigit())
    if not digits:
        return str(raw or "").strip()[:32]
    return str(int(digits))


def enroll_face(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    employee_no: str,
    employee_name: str,
    face_b64: str,
) -> tuple[bool, str]:
    import base64
    from io import BytesIO

    no = _employee_no(employee_no)
    name = (employee_name or no).strip()[:32] or no
    b64 = (face_b64 or "").strip()
    if "," in b64 and b64.lower().startswith("data:"):
        b64 = b64.split(",", 1)[1].strip()
    if not no or not b64:
        return False, "missing employeeNo/face"
    try:
        raw = base64.b64decode(b64, validate=False)
    except Exception as exc:
        return False, f"bad base64: {exc}"
    # DS-K1T: large JPEGs + faceURL data-URIs cause disconnect / badJsonContent.
    def _shrink(jpeg: bytes, side: int, quality: int) -> bytes:
        from PIL import Image  # type: ignore

        img = Image.open(BytesIO(jpeg)).convert("RGB")
        img.thumbnail((side, side))
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        return buf.getvalue()

    try:
        # Always normalize — terminals choke on phone-camera megabyte photos.
        raw = _shrink(raw, 360, 75)
        if len(raw) > 35_000:
            raw = _shrink(raw, 280, 68)
        if len(raw) > 28_000:
            raw = _shrink(raw, 240, 62)
        b64 = base64.b64encode(raw).decode("ascii")
    except Exception:
        pass

    begin, end = "2017-08-01T00:00:00", "2037-12-31T23:59:59"
    user = {
        "UserInfo": {
            "employeeNo": no,
            "name": name,
            "userType": "normal",
            "Valid": {
                "enable": True,
                "beginTime": begin,
                "endTime": end,
                "timeType": "local",
            },
            "doorRight": "1",
            "RightPlan": [{"doorNo": 1, "planTemplateNo": "1"}],
        }
    }
    code, body = _digest_request(
        host, port, "PUT", "/ISAPI/AccessControl/UserInfo/SetUp?format=json",
        username, password, json_body=user,
    )
    if code >= 400:
        code, body = _digest_request(
            host, port, "POST", "/ISAPI/AccessControl/UserInfo/Record?format=json",
            username, password, json_body=user,
        )
    if code >= 400 and "employeeNoAlreadyExist" not in body:
        return False, f"UserInfo HTTP {code}: {body[:160]}"

    record = {
        "faceLibType": "blackFD",
        "FDID": "1",
        "FPID": no,
        "employeeNo": no,
    }
    from isapi_http import digest_httpx, is_transient_error

    def _multipart_ok(jpeg: bytes) -> tuple[bool, str]:
        files = {
            "FaceDataRecord": (
                None,
                __import__("json").dumps(record),
                "application/json",
            ),
            "FaceImage": ("face.jpg", jpeg, "image/jpeg"),
        }
        try:
            code_m, text_m = digest_httpx(
                host,
                port,
                "POST",
                "/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json",
                username,
                password,
                files=files,
                timeout=(8.0, 90.0),
                retries=4,
            )
            if code_m < 400 or "deviceUserAlreadyExistFace" in text_m:
                return True, "ok"
            return False, f"Face multipart HTTP {code_m}: {text_m[:160]}"
        except Exception as exc:
            return False, f"Face multipart error: {exc}"[:180]

    # 1) Multipart first — DS-K1T343 prefers binary FaceImage over JSON faceURL.
    ok_mp, last = _multipart_ok(raw)
    if ok_mp:
        return True, "ok"

    # 2) Retry multipart with tinier JPEG after disconnect / WinError 10053.
    if any(
        t in last.lower()
        for t in ("disconnect", "10053", "timeout", "aborted", "reset", "parse multipart")
    ):
        time.sleep(1.2)
        try:
            tiny = _shrink(raw, 200, 55)
        except Exception:
            tiny = raw
        ok_mp, last2 = _multipart_ok(tiny)
        if ok_mp:
            return True, "ok"
        last = last2

    # 3) JSON faceData only — never faceURL (firmware returns badJsonContent/faceURL).
    attempts: list[dict] = [
        {**record, "faceData": b64},
        {"FaceDataRecord": {**record, "faceData": b64}},
    ]
    for payload in attempts:
        try:
            code, body = _digest_request(
                host,
                port,
                "POST",
                "/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json",
                username,
                password,
                json_body=payload,
                timeout=60.0,
                retries=3,
            )
        except Exception as exc:
            last = f"Face disconnect: {exc}"[:180]
            if is_transient_error(exc):
                time.sleep(1.0)
            continue
        last = f"Face HTTP {code}: {body[:160]}"
        if code < 400 or "deviceUserAlreadyExistFace" in body:
            return True, "ok"
        # Skip useless retries on permanent JSON reject.
        if "badjsoncontent" in body.lower() or "faceurl" in body.lower():
            break
    return False, last


def delete_user(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    employee_no: str,
) -> tuple[bool, str]:
    no = _employee_no(employee_no)
    if not no:
        return False, "empty employeeNo"
    payload = {"UserInfoDelCond": {"EmployeeNoList": [{"employeeNo": no}]}}
    code, body = _digest_request(
        host, port, "PUT", "/ISAPI/AccessControl/UserInfo/Delete?format=json",
        username, password, json_body=payload,
    )
    body_l = body.lower()
    if code < 400 or any(
        t in body_l
        for t in ("employeenotexist", "usernotexist", "invalidoperation")
    ):
        return True, "ok"
    return False, f"Delete HTTP {code}: {body[:160]}"


def list_users(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    page_size: int = 30,
    max_users: int = 2000,
) -> list[dict[str, str]]:
    """List AccessControl users on the terminal (employeeNo + userType/name)."""
    import json as _json

    out: list[dict[str, str]] = []
    pos = 0
    while pos < max_users:
        payload = {
            "UserInfoSearchCond": {
                "searchID": "1",
                "searchResultPosition": pos,
                "maxResults": min(page_size, max_users - pos),
            }
        }
        code, body = _digest_request(
            host,
            port,
            "POST",
            "/ISAPI/AccessControl/UserInfo/Search?format=json",
            username,
            password,
            json_body=payload,
            timeout=45.0,
        )
        if code >= 400:
            logger.warning("UserInfo/Search HTTP %s: %s", code, body[:160])
            break
        try:
            data = _json.loads(body) if body.strip().startswith("{") else {}
        except Exception:
            break
        search = data.get("UserInfoSearch") or data
        rows = search.get("UserInfo") or []
        if isinstance(rows, dict):
            rows = [rows]
        if not isinstance(rows, list) or not rows:
            break
        for row in rows:
            if not isinstance(row, dict):
                continue
            no = _employee_no(
                str(row.get("employeeNo") or row.get("employeeNoString") or "")
            )
            if not no:
                continue
            out.append(
                {
                    "employeeNo": no,
                    "name": str(row.get("name") or "").strip(),
                    "userType": str(row.get("userType") or "").strip().lower(),
                }
            )
        total = int(search.get("totalMatches") or 0)
        pos += len(rows)
        if total and pos >= total:
            break
        if len(rows) < page_size:
            break
    return out


def _is_protected_device_user(user: dict[str, str]) -> bool:
    """Never delete Hikvision administrator AccessControl accounts."""
    ut = (user.get("userType") or "").lower()
    if ut in ("administrator", "admin"):
        return True
    return False


def reconcile_device_users(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    keep_employee_nos: set[str],
) -> tuple[int, int]:
    """Delete terminal users that are not in the server keep-set.

    keep_employee_nos empty => remove all non-protected users (terminal mirrors
    an empty location roster).
    """
    keep = {_employee_no(x) for x in keep_employee_nos if _employee_no(x)}
    deleted = 0
    failed = 0
    try:
        users = list_users(
            host=host, port=port, username=username, password=password,
        )
    except Exception as exc:
        logger.warning("list_users failed: %s", exc)
        return 0, 1
    for user in users:
        no = user.get("employeeNo") or ""
        if not no or _is_protected_device_user(user):
            continue
        if no in keep:
            continue
        ok, msg = delete_user(
            host=host,
            port=port,
            username=username,
            password=password,
            employee_no=no,
        )
        if ok:
            deleted += 1
            logger.info("purged orphan employeeNo=%s name=%s", no, user.get("name"))
        else:
            failed += 1
            logger.warning("purge orphan %s failed: %s", no, msg)
    return deleted, failed


def tick_once(root=None) -> dict[str, Any]:
    """One poll cycle. Safe to call from service_worker every N seconds."""
    root = root or find_root()
    cfg = load_config(root)
    svc = load_service_config(root) or {}
    api = str(svc.get("apiUrl") or cfg.get("apiUrl") or "").rstrip("/")
    tenant = str(svc.get("tenantCode") or cfg.get("tenantCode") or "demo")
    key = read_link_key(root)
    cred = read_device_credential(root) or {}
    device_id = str(cred.get("deviceId") or svc.get("deviceId") or "").strip()
    host = str(cred.get("host") or svc.get("host") or "").strip()
    port = int(cred.get("port") or svc.get("port") or 80)
    username = str(cred.get("username") or svc.get("username") or "admin").strip() or "admin"
    password = str(cred.get("password") or "").strip()

    result: dict[str, Any] = {
        "ok": False,
        "upsertOk": 0,
        "upsertFail": 0,
        "deleteOk": 0,
        "deleteFail": 0,
        "purgeOk": 0,
        "purgeFail": 0,
        "message": "",
    }
    if not api or not device_id:
        result["message"] = "no apiUrl/deviceId — Ulash first"
        return result
    if not host or not password:
        result["message"] = "no host/password in device-credential.json"
        return result
    if not key:
        result["message"] = "no link.key"
        return result

    code, data = api_req(
        api,
        "GET",
        f"/api/attendance/office-link/devices/{device_id}/pending-faces"
        f"?tenantCode={tenant}",
        key,
        timeout=120.0,
    )
    if not is_success(code) or not isinstance(data, dict):
        result["message"] = f"pending-faces HTTP {code}"
        return result
    # Tolerate legacy/truncated wrappers if any.
    if "items" not in data and isinstance(data.get("raw"), str):
        try:
            import json as _json

            parsed = _json.loads(data["raw"])
            if isinstance(parsed, dict):
                data = parsed
        except Exception:
            pass

    items = data.get("items") if isinstance(data.get("items"), list) else []
    deletes = data.get("deletes") if isinstance(data.get("deletes"), list) else []
    result["pending"] = len(items) + len(deletes)

    # Prefer live vault password from pending-faces (covers Ulash / password sync).
    device_meta = data.get("device") if isinstance(data.get("device"), dict) else {}
    vault_pwd = str(device_meta.get("password") or "").strip()
    if vault_pwd and vault_pwd != password:
        password = vault_pwd
        try:
            save_device_credential(
                host=host,
                password=password,
                username=username,
                port=port,
                device_id=device_id,
                serial=str(cred.get("serialNumber") or ""),
                location_id=str(cred.get("locationId") or ""),
                phase="vault_refresh",
                root=root,
            )
        except Exception as exc:
            logger.warning("vault password refresh save failed: %s", exc)

    for raw in deletes:
        if not isinstance(raw, dict):
            continue
        face_sync_id = str(raw.get("faceSyncId") or "").strip()
        emp_no = str(raw.get("employeeNo") or "").strip()
        ok, msg = delete_user(
            host=host, port=port, username=username, password=password, employee_no=emp_no,
        )
        if ok:
            result["deleteOk"] += 1
        else:
            result["deleteFail"] += 1
            logger.warning("delete %s failed: %s", emp_no, msg)
        if face_sync_id:
            api_req(
                api,
                "POST",
                f"/api/attendance/office-link/devices/{device_id}/faces/"
                f"{face_sync_id}/ack?tenantCode={tenant}",
                key,
                {"ok": ok, "error": None if ok else msg, "action": "delete"},
                timeout=30.0,
            )

    for raw in items:
        if not isinstance(raw, dict):
            continue
        face_sync_id = str(raw.get("faceSyncId") or "").strip()
        emp_no = str(raw.get("employeeNo") or "").strip()
        emp_name = str(raw.get("employeeName") or "").strip()
        face_b64 = str(raw.get("faceBase64") or "").strip()
        if not face_b64:
            result["upsertFail"] += 1
            if face_sync_id:
                api_req(
                    api,
                    "POST",
                    f"/api/attendance/office-link/devices/{device_id}/faces/"
                    f"{face_sync_id}/ack?tenantCode={tenant}",
                    key,
                    {"ok": False, "error": "No face photo", "action": "upsert"},
                    timeout=30.0,
                )
            continue
        ok, msg = False, "enroll skipped"
        for enroll_try in range(3):
            try:
                ok, msg = enroll_face(
                    host=host,
                    port=port,
                    username=username,
                    password=password,
                    employee_no=emp_no,
                    employee_name=emp_name,
                    face_b64=face_b64,
                )
                if ok:
                    break
                if enroll_try + 1 < 3 and (
                    _is_transient_disconnect(RuntimeError(msg))
                    or "disconnect" in msg.lower()
                    or "timeout" in msg.lower()
                ):
                    time.sleep(1.0 * (enroll_try + 1))
                    continue
                break
            except Exception as exc:
                ok, msg = False, f"enroll exception: {exc}"[:200]
                if enroll_try + 1 < 3 and _is_transient_disconnect(exc):
                    time.sleep(1.0 * (enroll_try + 1))
                    continue
                break
        # Give weak DS-K1T firmware breathing room between faces.
        time.sleep(0.85)
        if ok:
            result["upsertOk"] += 1
        else:
            result["upsertFail"] += 1
            logger.warning("enroll %s failed: %s", emp_no, msg)
        if face_sync_id:
            api_req(
                api,
                "POST",
                f"/api/attendance/office-link/devices/{device_id}/faces/"
                f"{face_sync_id}/ack?tenantCode={tenant}",
                key,
                {"ok": ok, "error": None if ok else msg, "action": "upsert"},
                timeout=30.0,
            )

    # Mirror server roster on the terminal: remove manually added / stale users.
    keep_raw = data.get("keepEmployeeNos")
    reconcile = data.get("reconcileDevice")
    if reconcile is None:
        reconcile = True
    force_reconcile = bool(data.get("forceReconcile"))
    if reconcile and isinstance(keep_raw, list):
        due = force_reconcile
        if not due:
            stamp = root / "data" / "last_device_reconcile.txt"
            try:
                age = time.time() - stamp.stat().st_mtime
                due = age >= 90
            except OSError:
                due = True
        if due:
            keep = {str(x).strip() for x in keep_raw if str(x).strip()}
            try:
                purged, purge_fail = reconcile_device_users(
                    host=host,
                    port=port,
                    username=username,
                    password=password,
                    keep_employee_nos=keep,
                )
                result["purgeOk"] = purged
                result["purgeFail"] = purge_fail
                result["deleteOk"] += purged
                result["deleteFail"] += purge_fail
                try:
                    stamp = root / "data" / "last_device_reconcile.txt"
                    stamp.parent.mkdir(parents=True, exist_ok=True)
                    stamp.write_text(str(int(time.time())), encoding="utf-8")
                except OSError:
                    pass
            except Exception as exc:
                result["purgeFail"] = 1
                logger.warning("reconcile_device_users failed: %s", exc)

    result["ok"] = True
    result["message"] = (
        f"upsert +{result['upsertOk']}/-{result['upsertFail']} "
        f"delete +{result['deleteOk']}/-{result['deleteFail']}"
        + (
            f" purge +{result['purgeOk']}/-{result['purgeFail']}"
            if result.get("purgeOk") or result.get("purgeFail")
            else ""
        )
    )
    return result
