"""Configure Hikvision HttpHostNotification to push punches to Railway API."""
from __future__ import annotations

import json
from typing import Any

from isapi_http import digest_raw


def _put(
    host: str,
    port: int,
    path: str,
    username: str,
    password: str,
    body: bytes,
    content_type: str,
    timeout: float = 15.0,
) -> tuple[int, str]:
    try:
        code, _hdrs, raw = digest_raw(
            host,
            port,
            "PUT",
            path,
            username,
            password,
            body=body,
            content_type=content_type,
            timeout=timeout,
            retries=4,
        )
        return int(code), raw.decode("utf-8", errors="replace")
    except Exception as exc:
        return 0, str(exc)


def _get(
    host: str,
    port: int,
    path: str,
    username: str,
    password: str,
    timeout: float = 12.0,
) -> tuple[int, str]:
    try:
        code, _hdrs, raw = digest_raw(
            host,
            port,
            "GET",
            path,
            username,
            password,
            timeout=timeout,
            retries=3,
        )
        return int(code), raw.decode("utf-8", errors="replace")
    except Exception as exc:
        return 0, str(exc)


def ensure_capture_photo_settings(
    host: str,
    port: int,
    username: str,
    password: str,
) -> dict[str, Any]:
    """Enable terminal capture upload so HttpHost multipart includes JPEG.

    Without uploadCapPic / saveCapPic, marks arrive without ФОТО.
    """
    code, text = _get(
        host, port, "/ISAPI/AccessControl/AcsCfg?format=json", username, password
    )
    if code < 200 or code >= 400:
        return {"ok": False, "status": code, "message": text[:200]}
    try:
        data = json.loads(text)
    except Exception:
        return {"ok": False, "status": code, "message": "AcsCfg JSON parse failed"}
    acs = data.get("AcsCfg") if isinstance(data, dict) else None
    if not isinstance(acs, dict):
        return {"ok": False, "message": "AcsCfg missing"}
    wanted = {
        "uploadCapPic": True,
        "saveCapPic": True,
        "uploadVerificationPic": True,
        "saveVerificationPic": True,
        "showPicture": True,
    }
    changed = False
    for key, val in wanted.items():
        if key not in acs:
            continue
        if acs.get(key) is not True:
            acs[key] = val
            changed = True
    if not changed:
        return {"ok": True, "changed": False}
    body = json.dumps({"AcsCfg": acs}).encode("utf-8")
    code2, text2 = _put(
        host,
        port,
        "/ISAPI/AccessControl/AcsCfg?format=json",
        username,
        password,
        body,
        "application/json",
    )
    if 200 <= code2 < 400:
        return {"ok": True, "changed": True, "status": code2}
    return {"ok": False, "status": code2, "message": text2[:200]}


def configure_http_host_notification(
    host: str,
    port: int,
    username: str,
    password: str,
    *,
    api_host_name: str,
    api_port: int,
    url_path: str,
    protocol_type: str = "HTTPS",
    addressing_format_type: str = "hostname",
    ip_address: str = "",
) -> dict[str, Any]:
    path_clean = url_path if url_path.startswith("/") else f"/{url_path}"
    addr = (addressing_format_type or "hostname").strip().lower()
    use_ip = addr == "ipaddress" and bool(str(ip_address or "").strip())
    notify: dict[str, Any] = {
        "id": "1",
        "url": path_clean,
        "protocolType": protocol_type,
        "parameterFormatType": "JSON",
        "addressingFormatType": "ipaddress" if use_ip else "hostname",
        "portNo": int(api_port),
        "httpAuthenticationMethod": "none",
    }
    if use_ip:
        notify["ipAddress"] = str(ip_address).strip()
    else:
        notify["hostName"] = api_host_name
    payload = {"HttpHostNotification": notify}
    body = json.dumps(payload).encode("utf-8")
    code, text = _put(
        host,
        port,
        "/ISAPI/Event/notification/httpHosts/1?format=json",
        username,
        password,
        body,
        "application/json",
    )
    if 200 <= code < 400:
        return {"ok": True, "status": code, "path": "httpHosts/1"}
    list_body = json.dumps(
        {"HttpHostNotificationList": {"HttpHostNotification": [payload["HttpHostNotification"]]}}
    ).encode("utf-8")
    code2, text2 = _put(
        host,
        port,
        "/ISAPI/Event/notification/httpHosts?format=json",
        username,
        password,
        list_body,
        "application/json",
    )
    if 200 <= code2 < 400:
        return {"ok": True, "status": code2, "path": "httpHosts"}
    if use_ip:
        addr_xml = (
            "<addressingFormatType>ipaddress</addressingFormatType>"
            f"<ipAddress>{str(ip_address).strip()}</ipAddress>"
        )
    else:
        addr_xml = (
            "<addressingFormatType>hostname</addressingFormatType>"
            f"<hostName>{api_host_name}</hostName>"
        )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<HttpHostNotificationList version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">'
        "<HttpHostNotification>"
        "<id>1</id>"
        f"<url>{path_clean}</url>"
        f"<protocolType>{protocol_type}</protocolType>"
        "<parameterFormatType>JSON</parameterFormatType>"
        f"{addr_xml}"
        f"<portNo>{int(api_port)}</portNo>"
        "<httpAuthenticationMethod>none</httpAuthenticationMethod>"
        "</HttpHostNotification>"
        "</HttpHostNotificationList>"
    ).encode("utf-8")
    code3, text3 = _put(
        host,
        port,
        "/ISAPI/Event/notification/httpHosts",
        username,
        password,
        xml,
        "application/xml",
    )
    if 200 <= code3 < 400:
        return {"ok": True, "status": code3, "path": "httpHosts-xml"}
    return {
        "ok": False,
        "status": code3 or code2 or code,
        "message": (text3 or text2 or text)[:240],
    }


def apply_hik_push_from_api_response(
    host: str,
    port: int,
    username: str,
    password: str,
    hik_push: dict[str, Any] | None,
) -> dict[str, Any]:
    if not isinstance(hik_push, dict) or not hik_push:
        return {"ok": False, "message": "hikPush missing"}
    try:
        ensure_capture_photo_settings(host, int(port or 80), username, password)
    except Exception:
        pass
    return configure_http_host_notification(
        host,
        int(port or 80),
        username,
        password,
        api_host_name=str(hik_push.get("hostName") or ""),
        api_port=int(hik_push.get("portNo") or 443),
        url_path=str(hik_push.get("urlPath") or ""),
        protocol_type=str(hik_push.get("protocolType") or "HTTPS"),
        addressing_format_type=str(
            hik_push.get("addressingFormatType") or "hostname"
        ),
        ip_address=str(hik_push.get("ipAddress") or ""),
    )


def apply_hik_push_prefer_lan(
    host: str,
    port: int,
    username: str,
    password: str,
    hik_push: dict[str, Any] | None,
    *,
    api_base: str = "",
    proxy_port: int = 8787,
    mode: str | None = None,
) -> dict[str, Any]:
    """Configure HttpHost for punches.

    Default: **direct HTTPS → Railway** (Link ochiq bo‘lishi shart emas).
    LAN punch-proxy (:8787) faqat:
      - mode/env ``lan`` bo‘lsa, yoki
      - to‘g‘ridan sozlash muvaffaqiyatsiz bo‘lsa (fallback).

    Env: ``OFFICE_LINK_PUNCH_MODE=direct|lan|auto`` (default ``direct``).
    """
    import os

    if not isinstance(hik_push, dict) or not hik_push.get("urlPath"):
        return {"ok": False, "message": "hikPush missing"}

    raw_mode = (mode or os.environ.get("OFFICE_LINK_PUNCH_MODE") or "direct").strip().lower()
    if raw_mode not in ("direct", "lan", "auto"):
        raw_mode = "direct"

    def _try_direct() -> dict[str, Any]:
        direct = apply_hik_push_from_api_response(
            host, port, username, password, hik_push
        )
        if direct.get("ok"):
            return {**direct, "mode": "direct_https"}
        return direct

    def _try_lan() -> dict[str, Any]:
        url_path = str(hik_push.get("urlPath") or "")
        try:
            from punch_proxy import (
                DEFAULT_PORT,
                ensure_punch_proxy,
                lan_ipv4_for_device,
            )

            pport = int(proxy_port or DEFAULT_PORT)
            if api_base:
                ensure_punch_proxy(api_base, pport)
            lan_ip = lan_ipv4_for_device(host)
            if not lan_ip:
                return {"ok": False, "message": "no LAN IP for punch proxy"}
            lan_cfg = {
                "urlPath": url_path,
                "protocolType": "HTTP",
                "addressingFormatType": "ipaddress",
                "ipAddress": lan_ip,
                "portNo": pport,
                "hostName": "",
            }
            res = apply_hik_push_from_api_response(
                host, port, username, password, lan_cfg
            )
            if res.get("ok"):
                return {
                    **res,
                    "mode": "lan_proxy",
                    "lanIp": lan_ip,
                    "proxyPort": pport,
                }
            return res
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "message": str(exc)[:160]}

    # Explicit LAN-only (rare: terminal has no WAN).
    if raw_mode == "lan":
        lan = _try_lan()
        if lan.get("ok"):
            return lan
        direct = _try_direct()
        if direct.get("ok"):
            return {**direct, "lanNote": lan.get("message") or "lan failed"}
        return lan

    # Default / auto: direct first (linksiz), then LAN fallback.
    direct = _try_direct()
    if direct.get("ok"):
        return direct
    if raw_mode == "direct":
        # Still try LAN as last resort so Ulash doesn't leave punches dead.
        lan = _try_lan()
        if lan.get("ok"):
            return {
                **lan,
                "directNote": direct.get("message") or "direct failed",
            }
        return direct

    # auto: same as direct-first
    lan = _try_lan()
    if lan.get("ok"):
        return {**lan, "directNote": direct.get("message") or "direct failed"}
    return direct


# Clearer alias — callers may use either name.
apply_hik_push = apply_hik_push_prefer_lan

