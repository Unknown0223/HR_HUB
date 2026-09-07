"""Hikvision terminal password rules, generator, and ISAPI change."""
from __future__ import annotations

import secrets
import socket
import string
import xml.etree.ElementTree as ET
from typing import Any

from discovery import (
    UNAUTHORIZED,
    OK,
    TIMEOUT,
    ERROR,
    OFFLINE,
    _http_request,
    build_digest_header,
    parse_www_authenticate,
    verify_password,
)


def hikvision_password_error(password: str, username: str = "") -> str | None:
    """Match device-gw MinMoe rules (8–16 chars, ≥2 classes, no username)."""
    pwd = password or ""
    if len(pwd) < 8 or len(pwd) > 16:
        return "Parol 8–16 belgidan iborat bo‘lishi kerak"
    user = (username or "").strip()
    if user and user.lower() in pwd.lower():
        return "Parol foydalanuvchi nomini o‘z ichiga olmasligi kerak"
    classes = 0
    if any(c.islower() for c in pwd):
        classes += 1
    if any(c.isupper() for c in pwd):
        classes += 1
    if any(c.isdigit() for c in pwd):
        classes += 1
    if any(not c.isalnum() for c in pwd):
        classes += 1
    if classes < 2:
        return "Kamida 2 xil belgi turi kerak (katta/kichik/raqam/maxsus)"
    return None


def generate_terminal_password(username: str = "admin") -> str:
    """Strong password for platform ownership (same shape as Nest generateTerminalPassword)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    body = "".join(alphabet[b % len(alphabet)] for b in secrets.token_bytes(10))
    pwd = f"Hr{body}9"
    user = (username or "admin").lower()
    if user and user in pwd.lower():
        pwd = f"Kx{body}7"
    pwd = pwd[:16]
    # Ensure rules; rare retry.
    for _ in range(8):
        if hikvision_password_error(pwd, username) is None:
            return pwd
        body = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(10))
        pwd = f"Hr{body}9"[:16]
        if user in pwd.lower():
            pwd = f"Kx{body}7"[:16]
    return "HrHub9xK2mP4q"[:16]


def _xml_escape(value: str) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _xml_local(tag: str) -> str:
    return tag.split("}")[-1] if tag else ""


def digest_request(
    host: str,
    port: int,
    method: str,
    path: str,
    username: str,
    password: str,
    body: bytes | None = None,
    *,
    content_type: str = "application/xml",
    timeout: float = 15.0,
) -> tuple[int, dict[str, str], bytes]:
    """HTTP with Digest auth (401 challenge → retry)."""
    headers: dict[str, str] = {"Accept": "*/*"}
    if body is not None:
        headers["Content-Type"] = content_type
    try:
        status, resp_headers, resp_body = _http_request(
            host, port, method, path, body=body, headers=headers, timeout=timeout
        )
    except TimeoutError:
        raise
    except OSError:
        raise

    www = resp_headers.get("www-authenticate") or ""
    if status != 401 or "digest" not in www.lower():
        return status, resp_headers, resp_body

    challenge = parse_www_authenticate(www)
    auth = build_digest_header(challenge, username, password, method.upper(), path)
    headers2 = dict(headers)
    headers2["Authorization"] = auth
    return _http_request(
        host, port, method, path, body=body, headers=headers2, timeout=timeout
    )


def resolve_security_user_id(
    host: str,
    port: int,
    username: str,
    password: str,
    timeout: float = 10.0,
) -> str:
    try:
        status, _h, body = digest_request(
            host, port, "GET", "/ISAPI/Security/users", username, password, timeout=timeout
        )
    except (socket.timeout, OSError, TimeoutError):
        return "1"
    if status >= 400 or not body:
        return "1"
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return "1"
    wanted = (username or "admin").lower()
    fallback = "1"
    for el in root.iter():
        if _xml_local(el.tag) != "User":
            continue
        uid = ""
        uname = ""
        for child in el:
            loc = _xml_local(child.tag)
            if loc == "id" and child.text:
                uid = child.text.strip()
            elif loc == "userName" and child.text:
                uname = child.text.strip()
        if uid:
            fallback = uid
        if uname.lower() == wanted and uid:
            return uid
    return fallback


def change_admin_password(
    host: str,
    port: int,
    username: str,
    old_password: str,
    new_password: str,
    timeout: float = 15.0,
) -> dict[str, Any]:
    """PUT /ISAPI/Security/users/{id} with loginPassword (current)."""
    user = (username or "admin").strip() or "admin"
    old_password = (old_password or "").strip()
    new_password = (new_password or "").strip()
    if not host or not old_password or not new_password:
        return {"ok": False, "reason": "missing", "message": "Parol yoki host yo‘q"}
    rule = hikvision_password_error(new_password, user)
    if rule:
        return {"ok": False, "reason": "policy", "message": rule}

    try:
        uid = resolve_security_user_id(host, port, user, old_password, timeout=min(timeout, 10.0))
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            "<User>"
            f"<id>{_xml_escape(uid)}</id>"
            f"<userName>{_xml_escape(user)}</userName>"
            f"<password>{_xml_escape(new_password)}</password>"
            f"<loginPassword>{_xml_escape(old_password)}</loginPassword>"
            "<userLevel>Administrator</userLevel>"
            "</User>"
        )
        status, _h, body = digest_request(
            host,
            port,
            "PUT",
            f"/ISAPI/Security/users/{uid}",
            user,
            old_password,
            body=xml.encode("utf-8"),
            timeout=timeout,
        )
    except (socket.timeout, TimeoutError):
        return {"ok": False, "reason": TIMEOUT, "message": "Tarmoq kutish vaqti tugadi"}
    except OSError as exc:
        msg = str(exc).lower()
        if "timed out" in msg or "timeout" in msg:
            return {"ok": False, "reason": TIMEOUT, "message": "Tarmoq kutish vaqti tugadi"}
        return {"ok": False, "reason": OFFLINE, "message": f"Tarmoq xatosi: {exc}"[:160]}

    if status == 401:
        return {
            "ok": False,
            "reason": UNAUTHORIZED,
            "message": "Joriy parol noto‘g‘ri yoki ruxsat yo‘q",
        }
    if status >= 400:
        detail = (body or b"")[:240].decode("utf-8", errors="replace")
        return {
            "ok": False,
            "reason": ERROR,
            "message": f"Terminal parolni rad etdi (HTTP {status}): {detail}",
        }

    check = verify_password(host, port, user, new_password, timeout=min(timeout, 8.0))
    if check.kind != OK:
        return {
            "ok": False,
            "reason": "verify_failed",
            "message": "Parol o‘zgardi, lekin yangi parol bilan tekshirib bo‘lmadi",
        }
    return {"ok": True, "reason": "changed", "message": "Parol platformaga topshirildi", "userId": uid}
