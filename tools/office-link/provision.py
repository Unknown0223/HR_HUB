"""Device state detection and provision flows (Faza 1 + best-effort Faza 3.1).

Client-side heuristics — factory activation is best-effort only (not all models).
"""
from __future__ import annotations

import socket
from typing import Any, Callable

from discovery import (
    ERROR,
    OK,
    TIMEOUT,
    UNAUTHORIZED,
    _http_get,
    _http_request,
    classify_probe,
    parse_device_payload,
    verify_password,
)
from paths import read_link_key

StatusFn = Callable[[str], None]

STATE_NEW = "new"
STATE_CONFIGURED = "configured"
STATE_UNKNOWN = "unknown"

STATE_LABELS_UZ = {
    STATE_NEW: "Yangi",
    STATE_CONFIGURED: "Admin bor",
    STATE_UNKNOWN: "Noma'lum",
}

# Clear operator message when activation cannot complete (kept if attempts fail).
ACTIVATION_STUB_UZ = (
    "Yangi (aktivatsiya) qurilma uchun avto-sozlash hali to‘liq emas. "
    "Avval terminalda admin parolini o‘rnating (yoki SADP), keyin «Admin bor» yo‘li bilan ulang. "
    "Ba’zi Hikvision modellarda ISAPI aktivatsiya ishlamaydi."
)

# Common Hikvision activation / status probes (best-effort; model-specific).
_ACTIVATE_STATUS_PATHS = (
    "/SDK/activateStatus",
    "/ISAPI/System/activateStatus",
    "/ISAPI/System/Activated",
)
_ACTIVATE_PUT_PATHS = (
    "/ISAPI/System/activate",
    "/ISAPI/Security/activate",
    "/SDK/activate",
)


def state_label_uz(state: str) -> str:
    return STATE_LABELS_UZ.get(state, STATE_LABELS_UZ[STATE_UNKNOWN])


def _xml_escape(value: str) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _body_text(body: bytes) -> str:
    try:
        return body.decode("utf-8", errors="replace") if body else ""
    except Exception:
        return ""


def _looks_activated(text: str) -> bool | None:
    low = (text or "").lower()
    if "<activated>true</activated>" in low or '"activated":true' in low:
        return True
    if "<activated>false</activated>" in low or '"activated":false' in low:
        return False
    return None


def _activate_payloads(password: str) -> list[bytes]:
    pwd = _xml_escape(password)
    return [
        (
            '<?xml version="1.0" encoding="UTF-8"?>'
            f"<ActivateInfo><password>{pwd}</password></ActivateInfo>"
        ).encode("utf-8"),
        (
            '<?xml version="1.0" encoding="UTF-8"?>'
            f"<ActivationInfo><password>{pwd}</password></ActivationInfo>"
        ).encode("utf-8"),
        f'{{"password":"{password}"}}'.encode("utf-8"),
    ]


def attempt_factory_activation(
    host: str,
    password: str,
    port: int = 80,
    timeout: float = 5.0,
    http_get: Callable[..., tuple[int, dict[str, str], bytes]] | None = None,
    http_request: Callable[..., tuple[int, dict[str, str], bytes]] | None = None,
) -> dict[str, Any]:
    """Best-effort Hikvision factory activation (not all models).

    Tries common status + PUT activate endpoints. Does **not** implement full
    RSA challenge/AES flow (needs crypto + model docs). Returns ok=True only
    when an activate call succeeds or device already looks activated.
    """
    get_fn = http_get or _http_get
    req_fn = http_request or _http_request
    host = (host or "").strip()
    password = (password or "").strip()
    attempts: list[dict[str, Any]] = []
    meta: dict[str, Any] = {"host": host, "port": port, "attempts": attempts}

    if not host or not password:
        return {
            "ok": False,
            "reason": "missing_host_or_password",
            "message": ACTIVATION_STUB_UZ,
            "meta": meta,
        }

    already: bool | None = None
    for path in _ACTIVATE_STATUS_PATHS:
        try:
            status, _hdrs, body = get_fn(host, port, path, timeout=timeout)
            text = _body_text(body)
            flag = _looks_activated(text)
            attempts.append(
                {
                    "method": "GET",
                    "path": path,
                    "status": status,
                    "activated": flag,
                }
            )
            if flag is True:
                already = True
                break
            if flag is False:
                already = False
        except (OSError, socket.timeout) as exc:
            attempts.append(
                {
                    "method": "GET",
                    "path": path,
                    "error": str(exc)[:120],
                }
            )

    if already is True:
        meta["alreadyActivated"] = True
        return {
            "ok": True,
            "reason": "already_activated",
            "message": "Qurilma allaqachon aktivatsiya qilingan.",
            "meta": meta,
        }

    for path in _ACTIVATE_PUT_PATHS:
        for payload in _activate_payloads(password):
            ctype = (
                "application/json"
                if payload[:1] == b"{"
                else "application/xml"
            )
            try:
                status, _hdrs, body = req_fn(
                    host,
                    port,
                    "PUT",
                    path,
                    body=payload,
                    headers={"Content-Type": ctype, "Accept": "*/*"},
                    timeout=timeout,
                )
                text = _body_text(body)
                low = text.lower().replace(" ", "")
                okish = status in (200, 201) and (
                    "statusstring>ok<" in low
                    or "<substatuscode>ok</substatuscode>" in text.lower()
                    or (status == 200 and ("ok" in text.lower() or not text.strip()))
                )
                attempts.append(
                    {
                        "method": "PUT",
                        "path": path,
                        "status": status,
                        "okish": okish,
                        "snippet": text[:160],
                    }
                )
                if okish:
                    meta["activatedVia"] = path
                    return {
                        "ok": True,
                        "reason": "activated",
                        "message": "Aktivatsiya muvaffaqiyatli (best-effort).",
                        "meta": meta,
                    }
            except (OSError, socket.timeout) as exc:
                attempts.append(
                    {
                        "method": "PUT",
                        "path": path,
                        "error": str(exc)[:120],
                    }
                )

    # Optional challenge probe — RSA path needs crypto; document only.
    try:
        status, _hdrs, body = req_fn(
            host,
            port,
            "POST",
            "/ISAPI/Security/challenge",
            body=b'<?xml version="1.0"?><PublicKey><key></key></PublicKey>',
            headers={"Content-Type": "application/xml"},
            timeout=timeout,
        )
        attempts.append(
            {
                "method": "POST",
                "path": "/ISAPI/Security/challenge",
                "status": status,
                "note": "RSA challenge requires model-specific crypto (not implemented)",
                "snippet": _body_text(body)[:120],
            }
        )
    except (OSError, socket.timeout) as exc:
        attempts.append(
            {
                "method": "POST",
                "path": "/ISAPI/Security/challenge",
                "error": str(exc)[:120],
            }
        )

    return {
        "ok": False,
        "reason": "activation_failed",
        "message": ACTIVATION_STUB_UZ,
        "meta": meta,
    }


def detect_state(host: str, port: int = 80, timeout: float = 4.0) -> dict[str, Any]:
    """Probe ISAPI without credentials.

    - Unauthenticated deviceInfo/ISAPI success → likely new/open
    - Digest/401 challenge without a session → configured (needs admin password)
    - Otherwise → unknown
    """
    host = (host or "").strip()
    meta: dict[str, Any] = {"host": host, "port": port}
    if not host:
        return {"state": STATE_UNKNOWN, "meta": {**meta, "reason": "empty_host"}}

    path = "/ISAPI/System/deviceInfo"
    try:
        status, headers, body = _http_get(host, port, path, timeout=timeout)
    except socket.timeout:
        return {"state": STATE_UNKNOWN, "meta": {**meta, "reason": "timeout"}}
    except OSError as exc:
        msg = str(exc).lower()
        reason = "timeout" if ("timed out" in msg or "timeout" in msg) else "offline"
        return {"state": STATE_UNKNOWN, "meta": {**meta, "reason": reason, "error": str(exc)[:160]}}

    probe = classify_probe(status, headers, body)
    meta.update(
        {
            "httpStatus": status,
            "likelyHikvision": bool(probe.get("likely_hikvision")),
            "digest": bool(probe.get("digest")),
            "hintName": probe.get("hint_name") or "",
            "server": probe.get("server") or "",
        }
    )

    if status == 200:
        parsed = parse_device_payload(body, headers.get("content-type") or "")
        meta["device"] = parsed
        # Open deviceInfo without auth → activation / open admin path (new).
        return {"state": STATE_NEW, "meta": meta}

    if status == 401:
        www = headers.get("www-authenticate") or ""
        if "digest" in www.lower() or probe.get("digest"):
            meta["reason"] = "digest_challenge"
            return {"state": STATE_CONFIGURED, "meta": meta}
        # Some firmwares return 401 with activation hints without digest.
        blob = f"{www} {body[:400].decode('utf-8', errors='replace')}".lower()
        if any(tok in blob for tok in ("activation", "activate", "not activated")):
            meta["reason"] = "activation_hint"
            return {"state": STATE_NEW, "meta": meta}
        meta["reason"] = "unauthorized"
        return {"state": STATE_CONFIGURED, "meta": meta}

    if status in (403, 404) and probe.get("likely_hikvision"):
        meta["reason"] = f"http_{status}"
        return {"state": STATE_UNKNOWN, "meta": meta}

    meta["reason"] = f"http_{status}"
    return {"state": STATE_UNKNOWN, "meta": meta}


def _progress(session: Any, **kwargs: Any) -> None:
    """Best-effort progress PATCH (needs pairing token + session id)."""
    import api_client

    sid = getattr(session, "provision_session_id", None)
    token = ""
    if hasattr(session, "pairing_token"):
        try:
            token = session.pairing_token() or ""
        except Exception:
            token = ""
    if not sid or not token:
        return
    key = read_link_key(getattr(session, "root", None))
    try:
        api_client.patch_progress(
            session.api_url,
            key,
            session.tenant,
            session_id=sid,
            pairing_token=token,
            host=(session.verified or {}).get("host")
            if getattr(session, "verified", None)
            else (session.chosen.host if getattr(session, "chosen", None) else None),
            serial=(session.verified or {}).get("serialNumber")
            if getattr(session, "verified", None)
            else None,
            **kwargs,
        )
    except Exception:
        pass


class ProvisionEngine:
    """Wrap verify → gateway/tunnel → announce → register (with locationId)."""

    def provision_new(
        self,
        session: Any,
        password: str,
        location_id: str,
        on_status: StatusFn | None = None,
    ) -> Any:
        from passwords import generate_terminal_password
        from session import SubmitResult

        host = ""
        port = 80
        if getattr(session, "chosen", None):
            host = getattr(session.chosen, "host", "") or ""
            port = int(getattr(session.chosen, "port", 80) or 80)

        username = (getattr(session, "username", None) or "admin").strip() or "admin"
        # Always invent — operator must not keep this password.
        platform_pwd = generate_terminal_password(username)

        _emit(on_status, "Yangi qurilma: platforma parol o‘ylab aktivatsiya...")
        _progress(
            session,
            status="configuring",
            step="activation_attempt",
            percent=10,
            message="Factory activation with platform password",
        )

        result = attempt_factory_activation(host, platform_pwd, port=port)
        if result.get("ok"):
            _emit(on_status, "Aktivatsiya OK — boshqaruv platformaga topshirilmoqda...")
            _progress(
                session,
                status="configuring",
                step="activation_ok",
                percent=25,
                message=str(result.get("reason") or "activated"),
            )
            # Password already platform-owned; skip second rotation.
            return self.provision_configured(
                session,
                platform_pwd,
                location_id,
                on_status=on_status,
                rotate_password=False,
            )

        _emit(on_status, "Aktivatsiya muvaffaqiyatsiz — qo‘lda admin o‘rnating.")
        _progress(
            session,
            status="failed",
            step="activation_stub",
            percent=0,
            message=str(result.get("reason") or "activation_failed"),
        )
        return SubmitResult(
            kind=ERROR,
            message=str(result.get("message") or ACTIVATION_STUB_UZ),
        )

    def provision_configured(
        self,
        session: Any,
        password: str,
        location_id: str,
        on_status: StatusFn | None = None,
        *,
        rotate_password: bool = True,
    ) -> Any:
        """Verify → rotate to platform password → register (vault) → Web owns device."""
        import api_client
        import runtime_setup
        from passwords import change_admin_password, generate_terminal_password
        from session import SubmitResult

        location_id = (location_id or "").strip()
        if not location_id:
            return SubmitResult(
                kind="location",
                message="Lokatsiya tanlanmagan. Ulashdan oldin lokatsiyani tanlang.",
            )
        password = (password or "").strip()
        if not password:
            return SubmitResult(kind="empty", message="Parol kiritilmadi.")
        if not session.chosen:
            return SubmitResult(kind="no_device", message="Qurilma topilmadi.")

        key = read_link_key(session.root)
        pairing = ""
        if hasattr(session, "pairing_token"):
            pairing = session.pairing_token() or ""
        if not key and not pairing:
            return SubmitResult(
                kind="no_key",
                message="Pairing token yoki admin kaliti kerak.",
            )

        username = (getattr(session, "username", None) or "admin").strip() or "admin"

        _progress(
            session,
            status="configuring",
            step="verify_password",
            percent=20,
            message="Parol tekshirilmoqda",
        )
        _emit(on_status, "Joriy parol tekshirilmoqda...")
        result = verify_password(
            session.chosen.host,
            session.chosen.port,
            username,
            password,
        )
        if result.kind == TIMEOUT:
            return SubmitResult(
                kind=TIMEOUT,
                message="Tarmoq kutish vaqti tugadi. Parol urinishi hisoblanmadi.",
            )
        if result.kind in (UNAUTHORIZED,):
            _progress(
                session,
                status="failed",
                step="bad_password",
                percent=20,
                message="Parol noto‘g‘ri",
            )
            return SubmitResult(kind=UNAUTHORIZED, message="Parol noto‘g‘ri.")
        if result.kind != OK:
            return SubmitResult(
                kind=result.kind,
                message="Parolni tekshirib bo‘lmadi.",
            )

        session.auth.record_success()
        session.verified = result.as_device()

        if rotate_password:
            new_pwd = generate_terminal_password(username)
            _progress(
                session,
                status="configuring",
                step="change_password",
                percent=30,
                message="Platforma yangi parol o‘rnatmoqda",
            )
            _emit(on_status, "Yangi parol o‘ylab qurilmaga o‘rnatilmoqda...")
            changed = change_admin_password(
                session.chosen.host,
                int(session.chosen.port or 80),
                username,
                password,
                new_pwd,
            )
            if not changed.get("ok"):
                reason = str(changed.get("reason") or "")
                msg = str(changed.get("message") or "Parolni almashtirib bo‘lmadi")
                _progress(
                    session,
                    status="failed",
                    step="change_password_failed",
                    percent=30,
                    message=msg[:120],
                )
                if reason == TIMEOUT:
                    return SubmitResult(kind=TIMEOUT, message=msg)
                if reason == UNAUTHORIZED:
                    return SubmitResult(kind=UNAUTHORIZED, message=msg)
                return SubmitResult(kind=ERROR, message=msg)
            password = new_pwd
            _emit(on_status, "Parol platformaga topshirildi (operatorga ko‘rsatilmaydi)")

        session.password = password
        session.location_id = location_id
        session.username = username

        runtime_setup.ensure_runtime(session.root, on_status)
        bundle = runtime_setup.ServiceBundle()
        bundle.root = session.root
        try:
            # GW needs long-lived punch key; prefer link.key (may arrive via pairing bind).
            gw_key = key or pairing
            _progress(
                session,
                status="configuring",
                step="gateway",
                percent=40,
                message="Gateway",
            )
            _emit(on_status, "Gateway ishga tushirilmoqda...")
            bundle.gw = runtime_setup.start_gateway(
                session.api_url, gw_key, session.root, on_status
            )
            _progress(
                session,
                status="configuring",
                step="tunnel",
                percent=55,
                message="Tunnel",
            )
            _emit(on_status, "Tunnel ochilmoqda...")
            proc, url = runtime_setup.start_tunnel(session.root, on_status)
            bundle.tunnel = proc
            bundle.tunnel_url = url
            if not (url or "").strip():
                bundle.stop()
                _progress(
                    session,
                    status="failed",
                    step="tunnel_url_missing",
                    percent=55,
                    message="Tunnel URL yo‘q",
                )
                return SubmitResult(
                    kind="api",
                    message=(
                        "Tunnel URL topilmadi. trycloudflare yoki config.json da "
                        "namedTunnelUrl / cloudflareTunnelToken ni tekshiring."
                    ),
                )

            _emit(on_status, "Platformaga yozilmoqda...")
            _progress(
                session,
                status="configuring",
                step="ping",
                percent=65,
                message="Platforma ping",
            )
            code, _ping = api_client.ping(
                session.api_url, key, session.tenant, pairing_token=pairing or None
            )
            if code != 200:
                bundle.stop()
                _progress(
                    session,
                    status="failed",
                    step="ping_failed",
                    percent=65,
                    message="Platformaga ulanmadi",
                )
                return SubmitResult(
                    kind="api",
                    message="Platformaga ulanmadi. Internet yoki pairing/admin kalitini tekshiring.",
                )

            _emit(on_status, "Tunnel e'lon qilinmoqda...")
            _progress(
                session,
                status="configuring",
                step="announce",
                percent=75,
                message="Tunnel announce",
            )
            code, _ann = api_client.announce(
                session.api_url,
                key,
                session.tenant,
                url,
                pairing_token=pairing or None,
            )
            if code != 200:
                bundle.stop()
                _progress(
                    session,
                    status="failed",
                    step="announce_failed",
                    percent=75,
                    message="Tunnel yozilmadi",
                )
                return SubmitResult(kind="api", message="Tunnel platformaga yozilmadi.")

            _emit(on_status, "Qurilma + parol serverga yozilmoqda...")
            _progress(
                session,
                status="configuring",
                step="register",
                percent=90,
                message="Register",
            )
            code, linked = api_client.register_device(
                session.api_url,
                key,
                session.tenant,
                session.verified,
                username,
                session.password,
                location_id=location_id,
                pairing_token=pairing or None,
            )
            if code != 200:
                bundle.stop()
                _progress(
                    session,
                    status="failed",
                    step="register_failed",
                    percent=90,
                    message="Register xato",
                )
                return SubmitResult(kind="api", message="Qurilma platformaga yozilmadi.")

            session.services = bundle
            session.password = ""
            dev = linked.get("device") if isinstance(linked, dict) else {}
            device_id = (dev or {}).get("id")
            _progress(
                session,
                status="linked",
                step="linked",
                percent=100,
                message="Ulandi — boshqaruv Webda",
                device_id=device_id,
            )

            name = (dev or {}).get("name") or session.verified.get("name")
            _emit(on_status, "Ulandi — keyingi sozlash faqat Web dan")
            return SubmitResult(
                kind="linked",
                message="Ulandi",
                device={
                    "name": name,
                    "host": session.verified.get("host"),
                    "tunnel": url,
                    "locationId": location_id,
                    "id": device_id,
                    "ownedByPlatform": True,
                },
            )
        except Exception as exc:
            bundle.stop()
            _progress(
                session,
                status="failed",
                step="exception",
                percent=0,
                message=str(exc)[:160],
            )
            return SubmitResult(kind=ERROR, message=str(exc)[:240])


def _emit(cb: StatusFn | None, msg: str) -> None:
    if cb:
        cb(msg)
