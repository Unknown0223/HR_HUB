"""Configure Hikvision HttpHostNotification to push punches to Railway API."""
from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from discovery import build_digest_header, parse_www_authenticate


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
    url = f"http://{host}:{int(port)}{path}"
    req = Request(url, data=body, method="PUT")
    req.add_header("Content-Type", content_type)
    req.add_header("Accept", "*/*")
    try:
        with urlopen(req, timeout=timeout) as resp:
            return int(resp.status), resp.read().decode("utf-8", errors="replace")
    except HTTPError as e:
        www = e.headers.get("WWW-Authenticate") or ""
        if e.code == 401 and "digest" in www.lower():
            challenge = parse_www_authenticate(www)
            auth = build_digest_header(
                challenge, username, password, "PUT", path
            )
            req2 = Request(url, data=body, method="PUT")
            req2.add_header("Content-Type", content_type)
            req2.add_header("Authorization", auth)
            req2.add_header("Accept", "*/*")
            try:
                with urlopen(req2, timeout=timeout) as resp:
                    return int(resp.status), resp.read().decode(
                        "utf-8", errors="replace"
                    )
            except HTTPError as e2:
                return int(e2.code), (e2.read() or b"").decode(
                    "utf-8", errors="replace"
                )
        return int(e.code), (e.read() or b"").decode("utf-8", errors="replace")
    except URLError as e:
        return 0, str(e.reason if hasattr(e, "reason") else e)


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
