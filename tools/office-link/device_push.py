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
) -> dict[str, Any]:
    path_clean = url_path if url_path.startswith("/") else f"/{url_path}"
    payload = {
        "HttpHostNotification": {
            "id": "1",
            "url": path_clean,
            "protocolType": protocol_type,
            "parameterFormatType": "JSON",
            "addressingFormatType": "hostname",
            "hostName": api_host_name,
            "portNo": int(api_port),
            "httpAuthenticationMethod": "none",
        }
    }
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
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<HttpHostNotificationList version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">'
        "<HttpHostNotification>"
        "<id>1</id>"
        f"<url>{path_clean}</url>"
        f"<protocolType>{protocol_type}</protocolType>"
        "<parameterFormatType>JSON</parameterFormatType>"
        "<addressingFormatType>hostname</addressingFormatType>"
        f"<hostName>{api_host_name}</hostName>"
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
    return configure_http_host_notification(
        host,
        int(port or 80),
        username,
        password,
        api_host_name=str(hik_push.get("hostName") or ""),
        api_port=int(hik_push.get("portNo") or 443),
        url_path=str(hik_push.get("urlPath") or ""),
        protocol_type=str(hik_push.get("protocolType") or "HTTPS"),
    )
