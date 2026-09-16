"""Hardened LAN ISAPI HTTP for flaky Hikvision terminals.

Design notes (DS-K1T / weak Wi‑Fi):
- Prefer Connection: close — keep-alive reuse often yields
  "Server disconnected without sending a response".
- Split connect vs read timeouts; retries only on transient errors.
- Fresh TCP for every attempt; short backoff between tries.
"""
from __future__ import annotations

import http.client
import socket
import time
from typing import Any

DEFAULT_CONNECT = 5.0
DEFAULT_READ = 45.0
DEFAULT_RETRIES = 4


def is_transient_error(exc: BaseException | str | None) -> bool:
    if exc is None:
        return False
    name = exc.__class__.__name__ if isinstance(exc, BaseException) else ""
    msg = str(exc).lower()
    needles = (
        "server disconnected",
        "connection reset",
        "connection aborted",
        "broken pipe",
        "remoteprotocolerror",
        "readtimeout",
        "connecttimeout",
        "writetimeout",
        "pooltimeout",
        "timed out",
        "timeout",
        "temporarily unavailable",
        "try again",
        "devicebusy",
        "network is unreachable",
        "no route to host",
        "forcibly closed",
        "connection refused",  # brief power/link flap
        "incomplete read",
        "remote end closed",
        "eof occurred",
    )
    if any(n in msg for n in needles):
        return True
    return name in {
        "RemoteProtocolError",
        "ReadTimeout",
        "ConnectTimeout",
        "ConnectError",
        "WriteTimeout",
        "PoolTimeout",
        "TimeoutException",
        "TimeoutError",
        "BrokenPipeError",
        "ConnectionResetError",
        "ConnectionAbortedError",
        "IncompleteRead",
    }


def is_transient_http(status: int, body: str | bytes = "") -> bool:
    if int(status or 0) in {0, 408, 425, 429, 500, 502, 503, 504}:
        return True
    text = body.decode("utf-8", errors="replace") if isinstance(body, (bytes, bytearray)) else str(body or "")
    low = text.lower()
    return any(
        t in low
        for t in (
            "timeout",
            "busy",
            "try again",
            "devicebusy",
            "temporar",
            "service unavailable",
            "disconnected",
        )
    )


def backoff_sleep(attempt: int, *, base: float = 0.45, cap: float = 4.0) -> None:
    """attempt is 0-based index of the failed try."""
    delay = min(cap, base * (1.7**attempt))
    # Tiny jitter so parallel enrolls don't stampede the terminal.
    delay += 0.05 * (attempt + 1)
    time.sleep(delay)


def make_timeout(
    timeout: float | tuple[float, float] | Any | None = None,
    *,
    connect: float = DEFAULT_CONNECT,
    read: float = DEFAULT_READ,
):
    """Build httpx.Timeout or a single float for stdlib."""
    if timeout is None:
        connect_s, read_s = connect, read
    elif isinstance(timeout, (tuple, list)) and len(timeout) >= 2:
        connect_s, read_s = float(timeout[0]), float(timeout[1])
    elif isinstance(timeout, (int, float)):
        # Single value: short connect, same as read budget.
        connect_s = min(float(timeout), connect)
        read_s = float(timeout)
    else:
        # Already an httpx.Timeout-like object.
        return timeout
    try:
        import httpx

        return httpx.Timeout(connect=connect_s, read=read_s, write=read_s, pool=connect_s)
    except Exception:
        return read_s


def http_raw(
    host: str,
    port: int,
    method: str,
    path: str,
    *,
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 8.0,
    retries: int = 1,
    max_body: int = 512_000,
) -> tuple[int, dict[str, str], bytes]:
    """stdlib HTTP with optional retries. Always Connection: close."""
    attempts = max(1, int(retries or 1))
    last_exc: BaseException | None = None
    for attempt in range(attempts):
        conn: http.client.HTTPConnection | None = None
        try:
            # (connect, read) style — Python 3.11+ supports float only on HTTPConnection;
            # use single timeout but keep connect budget modest via socket default.
            conn = http.client.HTTPConnection(host, int(port or 80), timeout=timeout)
            hdrs: dict[str, str] = {
                "Accept": "*/*",
                "Connection": "close",
                "User-Agent": "HRHUB-OfficeLink-ISAPI/1.1",
            }
            if headers:
                hdrs.update(headers)
            if body is not None and "content-type" not in {k.lower() for k in hdrs}:
                hdrs["Content-Type"] = "application/xml"
            conn.request(method.upper(), path, body=body, headers=hdrs)
            resp = conn.getresponse()
            resp_body = resp.read(max_body)
            resp_hdrs = {k.lower(): v for k, v in resp.getheaders()}
            status = int(resp.status)
            if (
                attempt + 1 < attempts
                and is_transient_http(status, resp_body)
                and status != 401
            ):
                backoff_sleep(attempt)
                continue
            return status, resp_hdrs, resp_body
        except (socket.timeout, TimeoutError, OSError, http.client.HTTPException) as exc:
            last_exc = exc
            if attempt + 1 >= attempts or not is_transient_error(exc):
                raise
            backoff_sleep(attempt)
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass
    if last_exc is not None:
        raise last_exc
    return 0, {}, b""


def digest_raw(
    host: str,
    port: int,
    method: str,
    path: str,
    username: str,
    password: str,
    *,
    body: bytes | None = None,
    content_type: str = "application/xml",
    timeout: float = 15.0,
    retries: int = DEFAULT_RETRIES,
) -> tuple[int, dict[str, str], bytes]:
    """Digest-auth stdlib request with retries (passwords / push / provision)."""
    from discovery import build_digest_header, parse_www_authenticate

    attempts = max(1, int(retries or 1))
    last_exc: BaseException | None = None
    last_status = 0
    last_headers: dict[str, str] = {}
    last_body = b""

    for attempt in range(attempts):
        try:
            headers: dict[str, str] = {"Accept": "*/*"}
            if body is not None:
                headers["Content-Type"] = content_type
            status, resp_headers, resp_body = http_raw(
                host,
                port,
                method,
                path,
                body=body,
                headers=headers,
                timeout=timeout,
                retries=1,
            )
            www = resp_headers.get("www-authenticate") or ""
            if status == 401 and "digest" in www.lower():
                challenge = parse_www_authenticate(www)
                auth = build_digest_header(
                    challenge, username, password, method.upper(), path
                )
                headers2 = dict(headers)
                headers2["Authorization"] = auth
                status, resp_headers, resp_body = http_raw(
                    host,
                    port,
                    method,
                    path,
                    body=body,
                    headers=headers2,
                    timeout=timeout,
                    retries=1,
                )
            last_status, last_headers, last_body = status, resp_headers, resp_body
            if status == 401:
                return status, resp_headers, resp_body
            if attempt + 1 < attempts and is_transient_http(status, resp_body):
                backoff_sleep(attempt)
                continue
            return status, resp_headers, resp_body
        except (socket.timeout, TimeoutError, OSError, http.client.HTTPException) as exc:
            last_exc = exc
            if attempt + 1 >= attempts or not is_transient_error(exc):
                raise
            backoff_sleep(attempt)

    if last_exc is not None and last_status == 0:
        raise last_exc
    return last_status, last_headers, last_body


def digest_httpx(
    host: str,
    port: int,
    method: str,
    path: str,
    username: str,
    password: str,
    *,
    json_body: dict | None = None,
    content: bytes | None = None,
    content_type: str | None = None,
    files: dict | None = None,
    timeout: float | tuple[float, float] | Any = 45.0,
    retries: int = DEFAULT_RETRIES,
) -> tuple[int, str]:
    """httpx Digest request — no keep-alive, Connection: close, retries."""
    import httpx
    from httpx import DigestAuth

    base = f"http://{host}:{int(port or 80)}"
    headers: dict[str, str] = {
        "Connection": "close",
        "Accept": "*/*",
        "User-Agent": "HRHUB-OfficeLink-ISAPI/1.1",
    }
    data: bytes | None = content
    if json_body is not None:
        import json as _json

        data = _json.dumps(json_body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    elif content is not None and content_type:
        headers["Content-Type"] = content_type

    t = make_timeout(timeout)
    limits = httpx.Limits(max_keepalive_connections=0, max_connections=8)
    attempts = max(1, int(retries or 1))
    last_exc: BaseException | None = None

    for attempt in range(attempts):
        try:
            with httpx.Client(
                base_url=base,
                auth=DigestAuth(username or "admin", password or ""),
                timeout=t,
                verify=False,
                limits=limits,
                headers={"Connection": "close"},
            ) as client:
                if files is not None:
                    resp = client.request(method.upper(), path, files=files, headers=headers)
                else:
                    resp = client.request(
                        method.upper(), path, content=data, headers=headers
                    )
                text = resp.text or ""
                code = int(resp.status_code)
                if (
                    attempt + 1 < attempts
                    and is_transient_http(code, text)
                    and code not in {401, 403}
                ):
                    backoff_sleep(attempt)
                    continue
                return code, text[:800]
        except Exception as exc:
            last_exc = exc
            if attempt + 1 >= attempts or not is_transient_error(exc):
                raise
            backoff_sleep(attempt)

    assert last_exc is not None
    raise last_exc
