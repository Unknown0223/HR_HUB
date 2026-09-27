"""Auto-resume after network / device power loss — no full Ulash required.

Persisted state (link.key, device-credential, service.json) is enough to continue:
spawn worker, rewrite HttpHost when the terminal returns, re-announce reach URL.
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

# Module-level: detect offline → online edge for HttpHost rewrite.
_last_device_online: bool | None = None
_last_httphost_at: float = 0.0
_HTTPHOST_MIN_INTERVAL = 120.0  # soft rewrite at most every 2 min


def persist_hik_push_to_service(
    root: Path,
    api_url: str,
    tenant: str,
    hik: dict[str, Any] | None,
    *,
    host: str = "",
    port: int = 80,
    device_id: str = "",
) -> None:
    """Save hikPush fields into service.json for later auto-resume."""
    if not isinstance(hik, dict) or not hik.get("urlPath"):
        return
    patch: dict[str, Any] = {}
    _persist_hik(patch, hik)
    if host:
        patch["host"] = host
    if port:
        patch["port"] = int(port)
    if device_id:
        patch["deviceId"] = device_id
    _merge_service(root, api_url, tenant, patch)


def ensure_background_worker(root: Path | None = None) -> bool:
    """Start service_worker + ONLOGON task if Ulash/reconnect already wrote service.json."""
    from paths import find_root, load_service_config
    from tunnel_watch import install_startup_task, spawn_detached_worker

    root = root or find_root()
    svc = load_service_config(root)
    if not svc or svc.get("enabled") is False:
        return False
    if not str(svc.get("apiUrl") or "").strip():
        return False
    try:
        install_startup_task(root)
    except Exception:
        pass
    return bool(spawn_detached_worker(root))


def _device_reachable(host: str, port: int = 80) -> bool:
    host = (host or "").strip()
    if not host:
        return False
    try:
        from discovery import probe_online

        info = probe_online(host, int(port or 80), timeout=2.5)
        return bool(info.online)
    except Exception:
        return False


def _load_cred(root: Path) -> dict[str, Any]:
    try:
        from credential_store import peek_device_host, read_device_credential

        full = read_device_credential(root)
        if full:
            return full
        return peek_device_host(root) or {}
    except Exception:
        return {}


def _merge_service(root: Path, api_url: str, tenant: str, patch: dict[str, Any]) -> None:
    """Update service.json without dropping existing keys."""
    from paths import load_service_config, write_service_config

    svc = load_service_config(root) or {}
    extra = {k: v for k, v in svc.items() if k not in (
        "enabled",
        "apiUrl",
        "tenantCode",
        "tunnelMode",
        "writtenAt",
    )}
    extra.update(patch)
    write_service_config(
        api_url=api_url or str(svc.get("apiUrl") or ""),
        tenant=tenant or str(svc.get("tenantCode") or "demo"),
        tunnel_mode=str(svc.get("tunnelMode") or "quick"),
        root=root,
        extra=extra,
    )


def _hik_from_svc(svc: dict[str, Any]) -> dict[str, Any] | None:
    url_path = str(svc.get("hikPushUrlPath") or "").strip()
    if not url_path:
        return None
    return {
        "urlPath": url_path,
        "hostName": str(svc.get("hikPushHost") or ""),
        "portNo": int(svc.get("hikPushPort") or 443),
        "protocolType": str(svc.get("hikPushProtocol") or "HTTPS"),
        "addressingFormatType": str(svc.get("hikPushAddressing") or "hostname"),
        "ipAddress": str(svc.get("hikPushIp") or ""),
    }


def _persist_hik(svc_patch: dict[str, Any], hik: dict[str, Any]) -> None:
    svc_patch["hikPushUrlPath"] = str(hik.get("urlPath") or "")
    if hik.get("hostName"):
        svc_patch["hikPushHost"] = str(hik.get("hostName") or "")
    if hik.get("portNo") is not None:
        svc_patch["hikPushPort"] = int(hik.get("portNo") or 443)
    if hik.get("protocolType"):
        svc_patch["hikPushProtocol"] = str(hik.get("protocolType") or "HTTPS")
    if hik.get("addressingFormatType"):
        svc_patch["hikPushAddressing"] = str(hik.get("addressingFormatType") or "")
    if hik.get("ipAddress") is not None:
        svc_patch["hikPushIp"] = str(hik.get("ipAddress") or "")


def _fetch_hik_push(
    api_url: str,
    tenant: str,
    root: Path,
    device_id: str,
    *,
    host: str = "",
    port: int = 80,
    serial: str = "",
    update_host: bool = False,
) -> dict[str, Any] | None:
    """Get hikPush from API (ensure-push or reconnect)."""
    if not device_id:
        return None
    try:
        import api_client
        from paths import read_link_key, read_pairing_token

        key = read_link_key(root) or ""
        pairing = read_pairing_token(root) or ""
        if not key and not pairing:
            return None

        if update_host and host:
            code, data = api_client.reconnect_device(
                api_url,
                key,
                tenant,
                device_id=device_id,
                host=host,
                port=port,
                serial_number=serial or None,
                pairing_token=pairing or None,
            )
            if api_client.is_success(code) and isinstance(data, dict):
                hik = data.get("hikPush")
                if isinstance(hik, dict) and hik.get("urlPath"):
                    return hik

        code, data = api_client.ensure_push(
            api_url,
            key,
            tenant,
            device_id=device_id,
            pairing_token=pairing or None,
        )
        if api_client.is_success(code) and isinstance(data, dict):
            hik = data.get("hikPush")
            if isinstance(hik, dict) and hik.get("urlPath"):
                return hik
    except Exception:
        return None
    return None


def _resolve_device_id(
    api_url: str,
    tenant: str,
    root: Path,
    serial: str,
    device_id: str,
) -> str:
    if device_id:
        return device_id
    if not serial:
        return ""
    try:
        import api_client
        from paths import read_link_key, read_pairing_token

        key = read_link_key(root) or ""
        pairing = read_pairing_token(root) or ""
        if not key and not pairing:
            return ""
        code, data = api_client.list_office_link_devices(
            api_url, key, tenant, pairing_token=pairing or None
        )
        if not api_client.is_success(code):
            return ""
        rows = data if isinstance(data, list) else (
            data.get("devices") if isinstance(data, dict) else None
        )
        if not isinstance(rows, list):
            return ""
        sn = serial.strip().lower()
        for row in rows:
            if not isinstance(row, dict):
                continue
            if str(row.get("serialNumber") or "").strip().lower() == sn:
                return str(row.get("id") or "").strip()
    except Exception:
        return ""
    return ""


def _rediscover_host(
    root: Path,
    cred: dict[str, Any],
    username: str,
    password: str,
) -> tuple[str, int, str]:
    """If saved IP is dead, scan LAN and match by serial (password verify)."""
    old = str(cred.get("host") or "").strip()
    old_port = int(cred.get("port") or 80)
    serial = str(
        cred.get("serialNumber") or cred.get("serial") or ""
    ).strip().lower()
    if not password:
        return old, old_port, serial

    try:
        from discovery import find_devices, verify_password
    except Exception:
        return old, old_port, serial

    try:
        found = find_devices() or []
    except Exception:
        return old, old_port, serial

    for info in found:
        host = str(getattr(info, "host", "") or "").strip()
        port = int(getattr(info, "port", None) or 80)
        if not host or host == old:
            continue
        try:
            vr = verify_password(host, port, username, password, timeout=3.0)
        except Exception:
            continue
        if getattr(vr, "kind", "") != "ok":
            continue
        sn = str(getattr(vr, "serialNumber", "") or "").strip().lower()
        if serial and sn and sn != serial:
            continue
        if serial and not sn:
            continue
        return host, port, sn or serial

    # Single Hikvision + password works → take it (first Ulash left one device).
    if len(found) == 1 and not serial:
        info = found[0]
        host = str(getattr(info, "host", "") or "").strip()
        port = int(getattr(info, "port", None) or 80)
        try:
            from discovery import verify_password

            vr = verify_password(host, port, username, password, timeout=3.0)
            if getattr(vr, "kind", "") == "ok":
                return host, port, str(getattr(vr, "serialNumber", "") or "")
        except Exception:
            pass

    return old, old_port, serial


def reconcile_link(
    root: Path,
    api_url: str,
    tenant: str,
    *,
    force_httphost: bool = False,
) -> dict[str, Any]:
    """Heal after outage: punch proxy, HttpHost, announce, host rediscovery.

    Safe to call periodically from service_worker / face_worker.
    Does not rotate passwords. Full Ulash is NOT required when credential exists.
    """
    global _last_device_online, _last_httphost_at

    from paths import load_service_config, read_tunnel_url
    from tunnel_watch import announce_best_effort

    out: dict[str, Any] = {"ok": False, "steps": []}
    svc = load_service_config(root) or {}
    cred = _load_cred(root)
    host = str(cred.get("host") or svc.get("host") or "").strip()
    port = int(cred.get("port") or svc.get("port") or 80)
    username = str(cred.get("username") or svc.get("username") or "admin").strip() or "admin"
    password = str(cred.get("password") or "").strip()
    serial = str(cred.get("serialNumber") or cred.get("serial") or "").strip()
    device_id = str(cred.get("deviceId") or svc.get("deviceId") or "").strip()
    host_changed = False

    # 1) Punch proxy always (LAN HttpHost / local API).
    try:
        from punch_proxy import DEFAULT_PORT, ensure_punch_proxy, punch_proxy_status

        ensure_punch_proxy(api_url, DEFAULT_PORT)
        pst = punch_proxy_status()
        out["steps"].append(
            {"id": "punch_proxy", "ok": bool(pst.get("running")), "detail": pst}
        )
    except Exception as exc:  # noqa: BLE001
        out["steps"].append(
            {"id": "punch_proxy", "ok": False, "detail": str(exc)[:160]}
        )

    # 2) If terminal IP died (DHCP / power cycle), rediscover on LAN.
    if host and not _device_reachable(host, port):
        new_host, new_port, new_serial = _rediscover_host(
            root, cred, username, password
        )
        if new_host and new_host != host and _device_reachable(new_host, new_port):
            out["steps"].append(
                {
                    "id": "rediscover",
                    "ok": True,
                    "detail": f"{host} → {new_host}",
                }
            )
            host, port = new_host, new_port
            if new_serial:
                serial = new_serial
            host_changed = True
            force_httphost = True
            if password:
                try:
                    from credential_store import save_device_credential

                    save_device_credential(
                        host=host,
                        password=password,
                        username=username,
                        port=port,
                        serial=serial,
                        device_id=device_id,
                        phase="auto_resume_ip",
                        root=root,
                    )
                except Exception:
                    pass
            try:
                _merge_service(
                    root,
                    api_url,
                    tenant,
                    {"host": host, "port": port, "deviceId": device_id},
                )
            except Exception:
                pass
        else:
            out["steps"].append(
                {
                    "id": "device",
                    "ok": False,
                    "detail": f"offline {host}:{port} — qayta ulanish kutilmoqda",
                }
            )
            _last_device_online = False
            out["deviceOnline"] = False
            out["ok"] = True  # proxy/announce still useful when device returns
            return out
    elif host:
        out["steps"].append({"id": "device", "ok": True, "detail": f"{host}:{port}"})

    device_online = bool(host and _device_reachable(host, port))
    out["deviceOnline"] = device_online

    # Offline → online edge: always rewrite HttpHost.
    if device_online and _last_device_online is False:
        force_httphost = True
    _last_device_online = device_online

    device_id = _resolve_device_id(api_url, tenant, root, serial, device_id)

    # 3) Re-apply HttpHost when device is up.
    now = time.monotonic()
    need_push = force_httphost or (
        device_online and (now - _last_httphost_at) >= _HTTPHOST_MIN_INTERVAL
    )
    if device_online and password and need_push:
        hik = _hik_from_svc(svc)
        if not hik or host_changed or force_httphost:
            fetched = _fetch_hik_push(
                api_url,
                tenant,
                root,
                device_id,
                host=host,
                port=port,
                serial=serial,
                update_host=host_changed,
            )
            if fetched:
                hik = fetched
        if hik and hik.get("urlPath"):
            try:
                from device_push import apply_hik_push_prefer_lan

                push_res = apply_hik_push_prefer_lan(
                    host,
                    port,
                    username,
                    password,
                    hik,
                    api_base=api_url,
                )
                ok_push = bool(push_res.get("ok"))
                out["steps"].append(
                    {
                        "id": "httphost",
                        "ok": ok_push,
                        "detail": push_res.get("mode")
                        or push_res.get("message")
                        or "",
                    }
                )
                if ok_push:
                    _last_httphost_at = now
                    patch: dict[str, Any] = {
                        "host": host,
                        "port": port,
                        "deviceId": device_id,
                        "punchMode": str(push_res.get("mode") or ""),
                        "lastReconcileAt": time.strftime(
                            "%Y-%m-%dT%H:%M:%SZ", time.gmtime()
                        ),
                    }
                    _persist_hik(patch, hik)
                    try:
                        _merge_service(root, api_url, tenant, patch)
                    except Exception:
                        pass
            except Exception as exc:  # noqa: BLE001
                out["steps"].append(
                    {"id": "httphost", "ok": False, "detail": str(exc)[:160]}
                )
        else:
            out["steps"].append(
                {
                    "id": "httphost",
                    "ok": False,
                    "detail": "hikPush yo‘q — bir marta Ulash kerak",
                }
            )
    elif device_online and not password:
        out["steps"].append(
            {
                "id": "httphost",
                "ok": False,
                "detail": "credential yo‘q — bir marta Ulash kerak",
            }
        )

    # 4) Re-announce current tunnel/LAN URL so API reach stays fresh.
    current = (
        str(svc.get("tunnelUrl") or "").strip()
        or read_tunnel_url(root)
        or ""
    )
    if not current and host:
        # Prefer announcing punch-proxy LAN URL so API knows PC is alive.
        try:
            from punch_proxy import lan_ipv4_for_device

            lan = lan_ipv4_for_device(host)
            if lan:
                current = f"http://{lan}:8787"
        except Exception:
            current = f"http://{host}:{port}"
    if current:
        ok_ann = announce_best_effort(
            root, api_url, tenant, current, device_id=device_id or None
        )
        out["steps"].append(
            {"id": "announce", "ok": ok_ann, "detail": current[:80]}
        )

    out["ok"] = any(s.get("ok") for s in out["steps"])
    return out
