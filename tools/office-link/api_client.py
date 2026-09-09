"""HR HUB office-link HTTP client (stdlib). Never prints the link key."""
from __future__ import annotations

import http.client
import json
import ssl
from typing import Any
from urllib.parse import urlencode

from discovery import split_host


def is_success(code: int) -> bool:
    """Nest POST often returns 201 Created — treat any 2xx as OK."""
    return 200 <= int(code or 0) < 300


def api_req(
    api: str,
    method: str,
    path: str,
    key: str = "",
    body: dict | None = None,
    timeout: float = 45.0,
    *,
    pairing_token: str | None = None,
) -> tuple[int, Any]:
    host, port, base, tls = split_host(api)
    full = (base + path) if path.startswith("/") else (base + "/" + path)
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "HRHUB-OfficeLink/1.0",
    }
    token = (pairing_token or "").strip()
    link = (key or "").strip()
    if token:
        headers["X-Pairing-Token"] = token
    if link:
        headers["X-Device-Link-Key"] = link
    try:
        if tls:
            ctx = ssl.create_default_context()
            conn: http.client.HTTPConnection = http.client.HTTPSConnection(
                host, port, timeout=timeout, context=ctx
            )
        else:
            conn = http.client.HTTPConnection(host, port, timeout=timeout)
        try:
            conn.request(method.upper(), full, body=payload, headers=headers)
            resp = conn.getresponse()
            raw = resp.read(512_000)
            try:
                data = json.loads(raw.decode("utf-8", errors="replace") or "null")
            except Exception:
                data = {"raw": raw[:400].decode("utf-8", errors="replace")}
            return resp.status, data
        finally:
            conn.close()
    except Exception as exc:
        return 0, {"error": str(exc)}


def ping(
    api: str,
    key: str,
    tenant: str,
    *,
    pairing_token: str | None = None,
) -> tuple[int, Any]:
    q = urlencode({"tenantCode": tenant})
    return api_req(
        api,
        "GET",
        f"/api/attendance/office-link/ping?{q}",
        key,
        pairing_token=pairing_token,
    )


def announce(
    api: str,
    key: str,
    tenant: str,
    tunnel_url: str,
    *,
    pairing_token: str | None = None,
) -> tuple[int, Any]:
    return api_req(
        api,
        "POST",
        "/api/attendance/office-link/announce",
        key,
        {"tenantCode": tenant, "tunnelUrl": tunnel_url},
        pairing_token=pairing_token,
    )


def register_device(
    api: str,
    key: str,
    tenant: str,
    device: dict[str, Any],
    username: str,
    password: str,
    location_id: str | None = None,
    *,
    pairing_token: str | None = None,
) -> tuple[int, Any]:
    body: dict[str, Any] = {
        "tenantCode": tenant,
        "host": device.get("host"),
        "port": device.get("port") or 80,
        "username": username,
        "password": password,
        "serialNumber": device.get("serialNumber") or "",
        "name": device.get("name") or "",
        "model": device.get("model") or "",
    }
    loc = (location_id or "").strip()
    if loc:
        body["locationId"] = loc
    return api_req(
        api,
        "POST",
        "/api/attendance/office-link/device",
        key,
        body,
        pairing_token=pairing_token,
    )


def list_locations(
    api: str,
    key: str,
    tenant: str,
    *,
    pairing_token: str | None = None,
) -> tuple[int, Any]:
    q = urlencode({"tenantCode": tenant})
    return api_req(
        api,
        "GET",
        f"/api/attendance/office-link/locations?{q}",
        key,
        pairing_token=pairing_token,
    )


def list_office_link_devices(
    api: str,
    key: str,
    tenant: str,
    *,
    pairing_token: str | None = None,
) -> tuple[int, Any]:
    """GET devices + vault passwords (pairing or link-key)."""
    q = urlencode({"tenantCode": tenant})
    return api_req(
        api,
        "GET",
        f"/api/attendance/office-link/devices?{q}",
        key,
        pairing_token=pairing_token,
    )


def reconnect_device(
    api: str,
    key: str,
    tenant: str,
    *,
    device_id: str,
    host: str,
    port: int = 80,
    serial_number: str | None = None,
    pairing_token: str | None = None,
) -> tuple[int, Any]:
    """POST reconnect — update host/port only (no password rotate)."""
    body: dict[str, Any] = {
        "tenantCode": tenant,
        "deviceId": device_id,
        "host": host,
        "port": int(port or 80),
    }
    serial = (serial_number or "").strip()
    if serial:
        body["serialNumber"] = serial
    return api_req(
        api,
        "POST",
        "/api/attendance/office-link/reconnect",
        key,
        body,
        pairing_token=pairing_token,
    )


def patch_progress(
    api: str,
    key: str,
    tenant: str,
    *,
    session_id: str | None = None,
    step: str = "",
    percent: int | None = None,
    message: str = "",
    status: str | None = None,
    host: str | None = None,
    serial: str | None = None,
    device_id: str | None = None,
    pairing_token: str | None = None,
) -> tuple[int, Any]:
    """PATCH /office-link/session/:id/progress — requires X-Pairing-Token."""
    if not session_id:
        return 0, {"skipped": True, "reason": "no_session"}
    token = (pairing_token or "").strip()
    if not token:
        return 0, {"skipped": True, "reason": "no_pairing_token"}
    body: dict[str, Any] = {"tenantCode": tenant, "step": step, "message": message}
    if percent is not None:
        body["percent"] = percent
    if status:
        body["status"] = status
    if host:
        body["host"] = host
    if serial:
        body["serial"] = serial
    if device_id:
        body["deviceId"] = device_id
    return api_req(
        api,
        "PATCH",
        f"/api/attendance/office-link/session/{session_id}/progress",
        key,
        body,
        pairing_token=token,
    )


def create_pairing_session(
    api: str,
    key: str,
    tenant: str,
    *,
    pairing_token: str | None = None,
    host: str | None = None,
    serial: str | None = None,
) -> tuple[int, Any]:
    """POST /office-link/session — bind client to pairing session (X-Pairing-Token)."""
    token = (pairing_token or "").strip()
    if not token:
        return 0, {"skipped": True, "reason": "no_pairing_token"}
    body: dict[str, Any] = {"tenantCode": tenant}
    if host:
        body["host"] = host
    if serial:
        body["serial"] = serial
    return api_req(
        api,
        "POST",
        "/api/attendance/office-link/session",
        key,
        body,
        pairing_token=token,
    )


def detect_device(
    api: str,
    key: str,
    tenant: str,
    *,
    pairing_token: str | None = None,
    host: str | None = None,
    port: int | None = None,
    state: str | None = None,
) -> tuple[int, Any]:
    token = (pairing_token or "").strip()
    if not token:
        return 0, {"skipped": True, "reason": "no_pairing_token"}
    body: dict[str, Any] = {"tenantCode": tenant}
    if host:
        body["host"] = host
    if port is not None:
        body["port"] = port
    if state:
        body["state"] = state
    return api_req(
        api,
        "POST",
        "/api/attendance/office-link/device/detect",
        key,
        body,
        pairing_token=token,
    )
