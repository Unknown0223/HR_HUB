"""Office LAN face agent — pull server queue and apply on the terminal.

No Cloudflare tunnel required: Nest only queues faces; this process (on office
PC Wi‑Fi/LAN) enrolls/deletes via ISAPI. Called from service_worker loop.
"""
from __future__ import annotations

import logging
from typing import Any

from api_client import api_req, is_success
from credential_store import read_device_credential
from paths import find_root, load_config, load_service_config, read_link_key

logger = logging.getLogger("face_agent")


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
) -> tuple[int, str]:
    import httpx
    from httpx import DigestAuth

    base = f"http://{host}:{int(port or 80)}"
    headers: dict[str, str] = {}
    content: bytes | None = None
    if json_body is not None:
        import json as _json

        content = _json.dumps(json_body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    elif xml_body is not None:
        content = xml_body.encode("utf-8")
        headers["Content-Type"] = "application/xml"
    with httpx.Client(
        base_url=base,
        auth=DigestAuth(username or "admin", password or ""),
        timeout=timeout,
        verify=False,
    ) as client:
        resp = client.request(method.upper(), path, content=content, headers=headers)
        return resp.status_code, (resp.text or "")[:500]


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
    # Oversized JPEGs disconnect some terminals mid-upload.
    if len(raw) > 100_000:
        try:
            from PIL import Image  # type: ignore

            img = Image.open(BytesIO(raw)).convert("RGB")
            img.thumbnail((480, 480))
            buf = BytesIO()
            img.save(buf, format="JPEG", quality=85)
            raw = buf.getvalue()
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
    attempts: list[dict] = [
        {**record, "faceData": b64},
        {"FaceDataRecord": {**record, "faceData": b64}},
        {**record, "faceURL": f"data:image/jpeg;base64,{b64}"},
        {"FaceDataRecord": {**record, "faceURL": f"data:image/jpeg;base64,{b64}"}},
    ]
    last = ""
    for payload in attempts:
        code, body = _digest_request(
            host,
            port,
            "POST",
            "/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json",
            username,
            password,
            json_body=payload,
            timeout=45.0,
        )
        last = f"Face HTTP {code}: {body[:160]}"
        if code < 400 or "deviceUserAlreadyExistFace" in body:
            return True, "ok"

    # Multipart fallback (DS-K1T / some firmware)
    try:
        import httpx
        from httpx import DigestAuth

        files = {
            "FaceDataRecord": (None, __import__("json").dumps(record), "application/json"),
            "FaceImage": ("face.jpg", raw, "image/jpeg"),
        }
        with httpx.Client(
            base_url=f"http://{host}:{int(port or 80)}",
            auth=DigestAuth(username or "admin", password or ""),
            timeout=45.0,
            verify=False,
        ) as client:
            resp = client.post(
                "/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json",
                files=files,
            )
            text = resp.text or ""
            if resp.status_code < 400 or "deviceUserAlreadyExistFace" in text:
                return True, "ok"
            last = f"Face multipart HTTP {resp.status_code}: {text[:160]}"
    except Exception as exc:
        last = f"Face multipart error: {exc}"
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
        except Exception as exc:
            ok, msg = False, f"enroll exception: {exc}"[:200]
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

    result["ok"] = True
    result["message"] = (
        f"upsert +{result['upsertOk']}/-{result['upsertFail']} "
        f"delete +{result['deleteOk']}/-{result['deleteFail']}"
    )
    return result
