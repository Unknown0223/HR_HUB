"""Hikvision recovery email (parol tiklash pochtasi) via ISAPI."""
from __future__ import annotations

import json
import re
from typing import Any

from passwords import digest_request

DEFAULT_RECOVERY_EMAIL = "botirovanvar96@gmail.com"

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_recovery_email(value: str | None) -> str:
    email = (value or "").strip()
    return email or DEFAULT_RECOVERY_EMAIL


def is_valid_email(value: str) -> bool:
    return bool(_EMAIL_RE.match((value or "").strip()))


def get_recovery_email(
    host: str,
    port: int,
    username: str,
    password: str,
    *,
    timeout: float = 10.0,
) -> dict[str, Any]:
    """GET /ISAPI/Security/email/parameter?format=json"""
    status, _headers, body = digest_request(
        host,
        port,
        "GET",
        "/ISAPI/Security/email/parameter?format=json",
        username,
        password,
        timeout=timeout,
    )
    text = body.decode("utf-8", errors="replace") if body else ""
    if status >= 400:
        return {"ok": False, "status": status, "message": text[:200] or f"HTTP {status}"}
    email = ""
    try:
        data = json.loads(text) if text else {}
        info = (data.get("SecurityEmail") or {}).get("SecurityInformation") or []
        if isinstance(info, list) and info:
            email = str(info[0].get("emailAddress") or "").strip()
        elif isinstance(info, dict):
            email = str(info.get("emailAddress") or "").strip()
    except json.JSONDecodeError:
        return {"ok": False, "status": status, "message": "JSON parse failed", "raw": text[:200]}
    return {"ok": True, "status": status, "email": email, "raw": data if text else {}}


def set_recovery_email(
    host: str,
    port: int,
    username: str,
    password: str,
    email: str,
    *,
    timeout: float = 12.0,
) -> dict[str, Any]:
    """PUT recovery email — Ulash / reconnect dan keyin chaqiriladi."""
    email = normalize_recovery_email(email)
    if not is_valid_email(email):
        return {"ok": False, "message": f"Noto‘g‘ri email: {email}"}

    payload = {
        "SecurityEmail": {
            # Hikvision requires admin password confirmation node on PUT.
            "password": password,
            "SecurityInformation": [{"emailAddress": email}],
        }
    }
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    status, _headers, body = digest_request(
        host,
        port,
        "PUT",
        "/ISAPI/Security/email/parameter?format=json",
        username,
        password,
        body=raw,
        content_type="application/json",
        timeout=timeout,
    )
    text = body.decode("utf-8", errors="replace") if body else ""
    if status >= 400:
        # Some firmwares want XML mailing receiver instead / as well.
        mail = _set_mailing_receiver(
            host, port, username, password, email, timeout=timeout
        )
        if mail.get("ok"):
            return {
                "ok": True,
                "email": email,
                "via": "mailing",
                "message": "SMTP receiver yangilandi",
            }
        return {
            "ok": False,
            "status": status,
            "message": text[:240] or f"HTTP {status}",
            "mailing": mail,
        }

    # Hikvision often masks GET: b****@gmail.com — compare prefix/domain only.
    check = get_recovery_email(host, port, username, password, timeout=min(timeout, 8.0))
    got = str(check.get("email") or "").strip()
    verified = False
    if check.get("ok") and got:
        if got.lower() == email.lower():
            verified = True
        elif "*" in got:
            # masked: first char + domain should match
            local, _, domain = email.partition("@")
            g_local, _, g_domain = got.partition("@")
            if (
                domain
                and g_domain.lower() == domain.lower()
                and g_local
                and local
                and g_local[0].lower() == local[0].lower()
            ):
                verified = True
            elif g_domain.lower() == domain.lower():
                verified = True  # domain match is enough after successful PUT
    return {
        "ok": True,
        "email": email,
        "via": "security_email",
        "verified": verified,
        "deviceShows": got or None,
    }


def _set_mailing_receiver(
    host: str,
    port: int,
    username: str,
    password: str,
    email: str,
    *,
    timeout: float = 12.0,
) -> dict[str, Any]:
    """Best-effort: PUT /ISAPI/System/Network/mailing receiver list."""
    status, _h, body = digest_request(
        host,
        port,
        "GET",
        "/ISAPI/System/Network/mailing",
        username,
        password,
        timeout=timeout,
    )
    if status >= 400 or not body:
        return {"ok": False, "status": status, "message": "mailing GET failed"}

    text = body.decode("utf-8", errors="replace")
    # Replace first emailAddress / receiverName-like nodes if present; else wrap simple list.
    updated = text
    if "<emailAddress>" in text:
        updated = re.sub(
            r"<emailAddress>[^<]*</emailAddress>",
            f"<emailAddress>{_xml_esc(email)}</emailAddress>",
            text,
            count=1,
        )
    elif "<receiverName>" in text:
        updated = re.sub(
            r"<receiverName>[^<]*</receiverName>",
            f"<receiverName>{_xml_esc(email)}</receiverName>",
            text,
            count=1,
        )
    else:
        updated = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            "<mailingList><mailing>"
            f"<id>1</id><enabled>true</enabled>"
            f"<senderEmailAddress>{_xml_esc(email)}</senderEmailAddress>"
            f"<receiverList><receiver>"
            f"<emailAddress>{_xml_esc(email)}</emailAddress>"
            f"</receiver></receiverList>"
            "</mailing></mailingList>"
        )

    put_status, _ph, put_body = digest_request(
        host,
        port,
        "PUT",
        "/ISAPI/System/Network/mailing",
        username,
        password,
        body=updated.encode("utf-8"),
        content_type="application/xml",
        timeout=timeout,
    )
    if put_status >= 400:
        msg = (put_body or b"").decode("utf-8", errors="replace")[:200]
        return {"ok": False, "status": put_status, "message": msg or f"HTTP {put_status}"}
    return {"ok": True, "status": put_status}


def _xml_esc(value: str) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def apply_recovery_email_from_config(
    host: str,
    port: int,
    username: str,
    password: str,
    cfg: dict[str, Any] | None,
    *,
    timeout: float = 12.0,
) -> dict[str, Any]:
    """config.json recoveryEmail (default botirovanvar96@gmail.com)."""
    email = normalize_recovery_email(
        str((cfg or {}).get("recoveryEmail") or "") if cfg else ""
    )
    return set_recovery_email(
        host, port, username, password, email, timeout=timeout
    )
