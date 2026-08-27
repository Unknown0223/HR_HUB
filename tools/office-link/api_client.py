"""HR HUB office-link HTTP client (stdlib). Never prints the link key."""
from __future__ import annotations

import http.client
import json
import ssl
from typing import Any
from urllib.parse import urlencode

from discovery import split_host


def api_req(
    api: str,
    method: str,
    path: str,
    key: str,
    body: dict | None = None,
    timeout: float = 45.0,
) -> tuple[int, Any]:
    host, port, base, tls = split_host(api)
    full = (base + path) if path.startswith("/") else (base + "/" + path)
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {
        "Accept": "application/json",
        "X-Device-Link-Key": key,
        "Content-Type": "application/json",
        "User-Agent": "HRHUB-OfficeLink/1.0",
    }
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


def ping(api: str, key: str, tenant: str) -> tuple[int, Any]:
    q = urlencode({"tenantCode": tenant})
    return api_req(api, "GET", f"/api/attendance/office-link/ping?{q}", key)


def announce(api: str, key: str, tenant: str, tunnel_url: str) -> tuple[int, Any]:
    return api_req(
        api,
        "POST",
        "/api/attendance/office-link/announce",
        key,
        {"tenantCode": tenant, "tunnelUrl": tunnel_url},
    )


def register_device(
    api: str,
    key: str,
    tenant: str,
    device: dict[str, Any],
    username: str,
    password: str,
) -> tuple[int, Any]:
    return api_req(
        api,
        "POST",
        "/api/attendance/office-link/device",
        key,
        {
            "tenantCode": tenant,
            "host": device.get("host"),
            "port": device.get("port") or 80,
            "username": username,
            "password": password,
            "serialNumber": device.get("serialNumber") or "",
            "name": device.get("name") or "",
            "model": device.get("model") or "",
        },
    )
