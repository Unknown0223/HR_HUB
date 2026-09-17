"""LAN punch relay: terminal HttpHost → office PC → Railway API.

Hikvision terminals often cannot open outbound HTTPS (DNS/TLS/Wi‑Fi WAN).
While Link service_worker runs, point HttpHost at this HTTP listener on the PC.
"""
from __future__ import annotations

import json
import logging
import socket
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger("punch_proxy")

DEFAULT_PORT = 8787


def lan_ipv4_for_device(device_host: str = "") -> str:
    """Pick a local IPv4 that shares a subnet with the terminal when possible."""
    candidates: list[str] = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127."):
                candidates.append(ip)
    except OSError:
        pass

    # UDP connect trick: OS chooses outbound interface toward device / public net.
    for target in (device_host, "8.8.8.8"):
        if not target:
            continue
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(0.4)
            s.connect((target, 80))
            ip = s.getsockname()[0]
            s.close()
            if ip and not ip.startswith("127."):
                if ip not in candidates:
                    candidates.insert(0, ip)
                else:
                    candidates.remove(ip)
                    candidates.insert(0, ip)
                break
        except OSError:
            continue

    if device_host:
        try:
            parts = device_host.strip().split(".")
            if len(parts) == 4:
                prefix = ".".join(parts[:3]) + "."
                same = [c for c in candidates if c.startswith(prefix)]
                if same:
                    return same[0]
        except Exception:
            pass
    return candidates[0] if candidates else ""


class PunchProxy:
    def __init__(self, api_base: str, port: int = DEFAULT_PORT) -> None:
        self.api_base = (api_base or "").rstrip("/")
        self.port = int(port or DEFAULT_PORT)
        self._httpd: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None
        self.last_forward: dict[str, Any] = {}
        self.forward_ok = 0
        self.forward_fail = 0

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive() and self._httpd is not None

    def start(self) -> dict[str, Any]:
        if not self.api_base:
            return {"ok": False, "message": "api_base empty"}
        if self.running:
            return {"ok": True, "port": self.port, "already": True}

        api_base = self.api_base
        proxy = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
                logger.info("punch_proxy: " + fmt, *args)

            def _read_body(self) -> bytes:
                n = int(self.headers.get("Content-Length") or 0)
                if n <= 0:
                    return b""
                return self.rfile.read(n)

            def _reply(self, code: int, body: bytes, content_type: str = "application/json") -> None:
                self.send_response(code)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Connection", "close")
                self.end_headers()
                if body:
                    self.wfile.write(body)

            def do_GET(self) -> None:  # noqa: N802
                if self.path in ("/", "/health", "/api/health"):
                    payload = {
                        "ok": True,
                        "service": "hrhub-punch-proxy",
                        "apiBase": api_base,
                        "forwardOk": proxy.forward_ok,
                        "forwardFail": proxy.forward_fail,
                        "last": proxy.last_forward,
                    }
                    raw = json.dumps(payload).encode("utf-8")
                    self._reply(200, raw)
                    return
                self._reply(404, b'{"ok":false,"error":"not_found"}')

            def do_POST(self) -> None:  # noqa: N802
                path = self.path.split("?", 1)[0]
                if not path.startswith("/api/attendance/hikvision/events/"):
                    self._reply(404, b'{"ok":false,"error":"not_found"}')
                    return
                body = self._read_body()
                ct = self.headers.get("Content-Type") or "application/json"
                target = f"{api_base}{path}"
                req = urllib.request.Request(
                    target,
                    data=body,
                    method="POST",
                    headers={"Content-Type": ct, "User-Agent": "HRHUB-Link-punch-proxy/1.0"},
                )
                try:
                    with urllib.request.urlopen(req, timeout=25) as resp:
                        out = resp.read()
                        code = int(resp.status)
                        proxy.forward_ok += 1
                        proxy.last_forward = {
                            "ok": True,
                            "status": code,
                            "path": path,
                            "bytes": len(body),
                        }
                        self._reply(code, out or b'{"ok":true}', resp.headers.get("Content-Type") or "application/json")
                except urllib.error.HTTPError as exc:
                    out = exc.read() if exc.fp else b""
                    proxy.forward_fail += 1
                    proxy.last_forward = {
                        "ok": False,
                        "status": int(exc.code),
                        "path": path,
                        "error": str(exc.reason)[:120],
                    }
                    self._reply(int(exc.code), out or json.dumps({"ok": False, "error": str(exc.reason)}).encode())
                except Exception as exc:  # noqa: BLE001
                    proxy.forward_fail += 1
                    proxy.last_forward = {"ok": False, "path": path, "error": str(exc)[:160]}
                    self._reply(502, json.dumps({"ok": False, "error": str(exc)[:160]}).encode())

        try:
            httpd = ThreadingHTTPServer(("0.0.0.0", self.port), Handler)
            httpd.daemon_threads = True
        except OSError as exc:
            return {"ok": False, "message": f"bind :{self.port}: {exc}"[:200]}

        self._httpd = httpd

        def _serve() -> None:
            try:
                httpd.serve_forever(poll_interval=0.5)
            except Exception:
                logger.exception("punch_proxy serve_forever")

        t = threading.Thread(target=_serve, name="hrhub-punch-proxy", daemon=True)
        self._thread = t
        t.start()
        return {"ok": True, "port": self.port, "apiBase": api_base}

    def stop(self) -> None:
        httpd = self._httpd
        self._httpd = None
        if httpd is not None:
            try:
                httpd.shutdown()
            except Exception:
                pass
            try:
                httpd.server_close()
            except Exception:
                pass


_PROXY: PunchProxy | None = None


def ensure_punch_proxy(api_base: str, port: int = DEFAULT_PORT) -> PunchProxy:
    global _PROXY
    base = (api_base or "").rstrip("/")
    if _PROXY is None or _PROXY.api_base != base or _PROXY.port != int(port):
        if _PROXY is not None:
            _PROXY.stop()
        _PROXY = PunchProxy(base, port)
    if not _PROXY.running:
        started = _PROXY.start()
        if not started.get("ok"):
            raise RuntimeError(started.get("message") or "punch proxy start failed")
    return _PROXY


def punch_proxy_status() -> dict[str, Any]:
    p = _PROXY
    if p is None:
        return {"ok": False, "running": False}
    return {
        "ok": p.running,
        "running": p.running,
        "port": p.port,
        "apiBase": p.api_base,
        "forwardOk": p.forward_ok,
        "forwardFail": p.forward_fail,
        "last": p.last_forward,
    }


def build_lan_hik_push(
    *,
    url_path: str,
    lan_ip: str,
    port: int = DEFAULT_PORT,
) -> dict[str, Any]:
    path = url_path if str(url_path).startswith("/") else f"/{url_path}"
    return {
        "protocolType": "HTTP",
        "addressingFormatType": "ipaddress",
        "hostName": "",
        "ipAddress": lan_ip,
        "portNo": int(port),
        "urlPath": path,
        "httpAuthenticationMethod": "none",
        "mode": "lan_punch_proxy",
        "fullNotifyUrl": f"http://{lan_ip}:{int(port)}{path}",
    }


def configure_http_host_to_lan_proxy(
    host: str,
    port: int,
    username: str,
    password: str,
    *,
    url_path: str,
    lan_ip: str,
    proxy_port: int = DEFAULT_PORT,
) -> dict[str, Any]:
    from device_push import configure_http_host_notification

    cfg = build_lan_hik_push(url_path=url_path, lan_ip=lan_ip, port=proxy_port)
    # device_push currently only sends hostname — extend call with ip mode via local PUT
    return _configure_ip_http_host(
        host,
        port,
        username,
        password,
        ip_address=lan_ip,
        api_port=proxy_port,
        url_path=cfg["urlPath"],
        protocol_type="HTTP",
    )


def _configure_ip_http_host(
    host: str,
    port: int,
    username: str,
    password: str,
    *,
    ip_address: str,
    api_port: int,
    url_path: str,
    protocol_type: str = "HTTP",
) -> dict[str, Any]:
    from isapi_http import digest_raw

    path_clean = url_path if url_path.startswith("/") else f"/{url_path}"
    payload = {
        "HttpHostNotification": {
            "id": "1",
            "url": path_clean,
            "protocolType": protocol_type,
            "parameterFormatType": "JSON",
            "addressingFormatType": "ipaddress",
            "ipAddress": ip_address,
            "portNo": int(api_port),
            "httpAuthenticationMethod": "none",
        }
    }
    body = json.dumps(payload).encode("utf-8")
    try:
        code, _hdrs, raw = digest_raw(
            host,
            port,
            "PUT",
            "/ISAPI/Event/notification/httpHosts/1?format=json",
            username,
            password,
            body=body,
            content_type="application/json",
            timeout=15,
            retries=4,
        )
        if 200 <= int(code) < 400:
            return {"ok": True, "status": int(code), "path": "httpHosts/1", "mode": "lan_proxy"}
        text = raw.decode("utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001
        code, text = 0, str(exc)

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<HttpHostNotificationList version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">'
        "<HttpHostNotification>"
        "<id>1</id>"
        f"<url>{path_clean}</url>"
        f"<protocolType>{protocol_type}</protocolType>"
        "<parameterFormatType>JSON</parameterFormatType>"
        "<addressingFormatType>ipaddress</addressingFormatType>"
        f"<ipAddress>{ip_address}</ipAddress>"
        f"<portNo>{int(api_port)}</portNo>"
        "<httpAuthenticationMethod>none</httpAuthenticationMethod>"
        "</HttpHostNotification>"
        "</HttpHostNotificationList>"
    ).encode("utf-8")
    try:
        code3, _h3, raw3 = digest_raw(
            host,
            port,
            "PUT",
            "/ISAPI/Event/notification/httpHosts",
            username,
            password,
            body=xml,
            content_type="application/xml",
            timeout=15,
            retries=4,
        )
        if 200 <= int(code3) < 400:
            return {"ok": True, "status": int(code3), "path": "httpHosts-xml", "mode": "lan_proxy"}
        return {
            "ok": False,
            "status": int(code3),
            "message": raw3.decode("utf-8", errors="replace")[:240],
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "status": int(code) if code else 0, "message": (text or str(exc))[:240]}


def api_host_from_url(api_url: str) -> str:
    try:
        return urlparse(api_url).hostname or ""
    except Exception:
        return ""
