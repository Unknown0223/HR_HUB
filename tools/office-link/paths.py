"""Office-link folders. Never logs or returns link.key contents to the UI."""
from __future__ import annotations

import os
import sys
from pathlib import Path


def find_root() -> Path:
    starts: list[Path] = []
    if getattr(sys, "frozen", False):
        starts.append(Path(sys.executable).resolve().parent)
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        starts.append(Path(str(meipass)))
    starts.append(Path(__file__).resolve().parent)

    seen: list[Path] = []
    for start in starts:
        p = start
        for _ in range(5):
            if p not in seen:
                seen.append(p)
            p = p.parent

    for p in seen:
        if (p / "BOSHLASH.bat").is_file():
            return p
    for p in seen:
        if (p / "config.json").is_file():
            return p
    return starts[0]


def user_data_root() -> Path:
    """Writable per-user data (Program Files ga yozib bo‘lmasa shu yer)."""
    base = (
        os.environ.get("LOCALAPPDATA")
        or os.environ.get("APPDATA")
        or str(Path.home() / "AppData" / "Local")
    )
    return Path(base) / "HRHUB-Link"


def _dir_is_writable(path: Path) -> bool:
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".hrhub_write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return True
    except OSError:
        return False


def _has_data_marker(path: Path) -> bool:
    try:
        return (path / "device-credential.json").is_file() or (path / "link.key").is_file()
    except OSError:
        return False


def _sibling_program_data() -> Path | None:
    """Optional per-user Programs install data (when exe runs from Program Files)."""
    base = (
        os.environ.get("LOCALAPPDATA")
        or os.environ.get("APPDATA")
        or str(Path.home() / "AppData" / "Local")
    )
    cand = Path(base) / "Programs" / "HRHUB-Link" / "data"
    return cand if cand.is_dir() else None


def data_dir(root: Path | None = None) -> Path:
    """
    Prefer <install>/data when writable; otherwise %LOCALAPPDATA%\\HRHUB-Link\\data.

    Program Files o‘rnatilganda oddiy foydalanuvchi yozolmasligi mumkin —
    shunda parol fayli AppData ga tushadi (bo‘sh Program Files\\data kutiladi).
    Never pick a non-writable install data just because credential files exist there
    (Errno 13 on pairing.token / tunnel_url.txt).
    """
    root = root or find_root()
    install_data = root / "data"
    user_data = user_data_root() / "data"
    sibling = _sibling_program_data()
    others = [user_data]
    if sibling is not None:
        try:
            if sibling.resolve() != install_data.resolve() and sibling.resolve() != user_data.resolve():
                others.append(sibling)
        except OSError:
            others.append(sibling)

    chosen: Path | None = None
    # Writable location that already has recovery / link key (install first if writable).
    for cand in (install_data, *others):
        try:
            if _has_data_marker(cand) and _dir_is_writable(cand):
                chosen = cand
                break
        except OSError:
            pass

    if chosen is None:
        if _dir_is_writable(install_data):
            chosen = install_data
        else:
            user_data.mkdir(parents=True, exist_ok=True)
            chosen = user_data

    # Borrow missing secrets from other data roots into the writable chosen dir.
    # Prefer the per-user Programs install over a stale Program Files copy.
    import shutil

    borrow_from: list[Path] = []
    for cand in (sibling, *others, install_data):
        if cand is None:
            continue
        try:
            if cand.resolve() == chosen.resolve():
                continue
        except OSError:
            pass
        if cand not in borrow_from:
            borrow_from.append(cand)

    for name in (
        "link.key",
        "pairing.token",
        "device-credential.json",
        "tunnel_url.txt",
        "service.json",
    ):
        try:
            dest = chosen / name
            if dest.is_file():
                continue
            for other in borrow_from:
                src = other / name
                if src.is_file():
                    shutil.copy2(src, dest)
                    break
        except OSError:
            pass
    return chosen


def runtime_dir(root: Path | None = None) -> Path:
    root = root or find_root()
    install_rt = root / "runtime"
    user_rt = user_data_root() / "runtime"
    if _dir_is_writable(install_rt):
        return install_rt
    user_rt.mkdir(parents=True, exist_ok=True)
    return user_rt


def gw_dir(root: Path | None = None) -> Path:
    """
    Prefer <install>/gw when writable; otherwise %LOCALAPPDATA%\\HRHUB-Link\\gw.

    Program Files installs are read-only for normal users — restore/copy must
    not try to overwrite gw\\main.py there (Errno 13).
    """
    root = root or find_root()
    install_gw = root / "gw"
    user_gw = user_data_root() / "gw"
    if _dir_is_writable(install_gw):
        return install_gw
    user_gw.mkdir(parents=True, exist_ok=True)
    return user_gw


def key_file(root: Path | None = None) -> Path:
    return data_dir(root) / "link.key"


def pairing_token_file(root: Path | None = None) -> Path:
    return data_dir(root) / "pairing.token"


def config_file(root: Path | None = None) -> Path:
    return (root or find_root()) / "config.json"


def connection_file(root: Path | None = None) -> Path:
    """Signed bind blob issued by a specific web deployment."""
    return (root or find_root()) / "connection.hrhub"


def _decode_connection_hrhub(raw: str) -> dict | None:
    import base64
    import json

    text = (raw or "").strip()
    if not text:
        return None
    try:
        # base64url
        pad = "=" * (-len(text) % 4)
        data = base64.urlsafe_b64decode(text + pad)
        parsed = json.loads(data.decode("utf-8"))
        payload = parsed.get("payload") if isinstance(parsed, dict) else None
        if not isinstance(payload, dict):
            return None
        if not payload.get("apiUrl") or not payload.get("tenantCode"):
            return None
        return parsed
    except Exception:
        return None


def load_bound_connection(root: Path | None = None) -> dict | None:
    path = connection_file(root)
    if not path.is_file():
        return None
    try:
        return _decode_connection_hrhub(path.read_text(encoding="utf-8"))
    except OSError:
        return None


def load_config(root: Path | None = None) -> dict:
    import json

    path = config_file(root)
    defaults = {
        "apiUrl": "https://hr-hubapi-production.up.railway.app",
        "webUrl": "https://hr-hubweb-production.up.railway.app",
        "tenantCode": "demo",
        "recoveryEmail": "botirovanvar96@gmail.com",
    }
    data = dict(defaults)
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data.update(loaded)
        except Exception:
            pass

    # Prefer signed connection pack from the web that issued the download.
    bound = load_bound_connection(root)
    if bound and isinstance(bound.get("payload"), dict):
        p = bound["payload"]
        data["apiUrl"] = str(p.get("apiUrl") or data.get("apiUrl") or "").rstrip("/")
        data["webUrl"] = str(p.get("webUrl") or data.get("webUrl") or "").rstrip("/")
        data["tenantCode"] = str(p.get("tenantCode") or data.get("tenantCode") or "").strip()
        if p.get("tenantName"):
            data["tenantName"] = str(p.get("tenantName"))
        data["bound"] = True
        data["boundAt"] = str(p.get("issuedAt") or "")
        data["installerUrl"] = p.get("installerUrl") or data.get("installerUrl")
        data["version"] = p.get("version") or data.get("version")
    else:
        data["bound"] = bool(data.get("bound"))

    data["apiUrl"] = str(data.get("apiUrl") or defaults["apiUrl"]).rstrip("/")
    data["webUrl"] = str(data.get("webUrl") or defaults["webUrl"]).rstrip("/")
    data["tenantCode"] = str(data.get("tenantCode") or defaults["tenantCode"]).strip()
    return data


def bound_web_label(cfg: dict | None = None, root: Path | None = None) -> str:
    data = cfg if cfg is not None else load_config(root)
    web = str(data.get("webUrl") or "").rstrip("/")
    tenant = str(data.get("tenantCode") or "").strip()
    name = str(data.get("tenantName") or "").strip()
    if not web and not tenant:
        return ""
    bits = [web or "web?"]
    if tenant:
        bits.append(f"tenant={tenant}")
    if name:
        bits.append(name)
    return " · ".join(bits)

def service_config_file(root: Path | None = None) -> Path:
    return data_dir(root) / "service.json"


def service_status_file(root: Path | None = None) -> Path:
    return data_dir(root) / "service_status.json"


def tunnel_url_file(root: Path | None = None) -> Path:
    return data_dir(root) / "tunnel_url.txt"


def tunnel_cooldown_file(root: Path | None = None) -> Path:
    return data_dir(root) / "tunnel_cooldown.json"


def tunnel_cooldown_remaining(root: Path | None = None) -> int:
    """Seconds left before another quick-tunnel attempt is allowed (0 = ok)."""
    import json
    import time

    path = tunnel_cooldown_file(root)
    if not path.is_file():
        return 0
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        until = float(data.get("until") or 0)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return 0
    left = int(until - time.time())
    return left if left > 0 else 0


def set_tunnel_cooldown(seconds: int = 600, *, reason: str = "", root: Path | None = None) -> None:
    """Block quick-tunnel restores after Cloudflare 429 (default 10 minutes)."""
    import json
    import time

    sec = max(60, int(seconds))
    path = tunnel_cooldown_file(root)
    payload = {
        "until": time.time() + sec,
        "seconds": sec,
        "reason": (reason or "rate_limit")[:120],
        "setAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    try:
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except OSError:
        pass


def clear_tunnel_cooldown(root: Path | None = None) -> None:
    try:
        tunnel_cooldown_file(root).unlink(missing_ok=True)
    except OSError:
        pass


def read_tunnel_url(root: Path | None = None) -> str:
    path = tunnel_url_file(root)
    if not path.is_file():
        return ""
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def write_tunnel_url(url: str, root: Path | None = None) -> None:
    text = (url or "").strip()
    if not text:
        return
    path = tunnel_url_file(root)
    path.write_text(text + "\n", encoding="utf-8")


def resolve_tunnel_token(cfg: dict | None = None, root: Path | None = None) -> str:
    """Named Cloudflare tunnel token from env or config (never log the value)."""
    for env_name in (
        "CLOUDFLARE_TUNNEL_TOKEN",
        "NAMED_TUNNEL_TOKEN",
        "HRHUB_CLOUDFLARE_TUNNEL_TOKEN",
    ):
        val = (os.environ.get(env_name) or "").strip()
        if val:
            return val
    data = cfg if cfg is not None else load_config(root)
    for key in ("cloudflareTunnelToken", "namedTunnelToken"):
        val = str(data.get(key) or "").strip()
        if val:
            return val
    return ""


def resolve_named_tunnel_url(cfg: dict | None = None, root: Path | None = None) -> str:
    """Stable public hostname for named tunnel (dashboard hostname)."""
    data = cfg if cfg is not None else load_config(root)
    for key in ("namedTunnelUrl", "tunnelPublicUrl", "cloudflareTunnelUrl"):
        val = str(data.get(key) or "").strip()
        if val:
            return val.rstrip("/")
    return read_tunnel_url(root)


def load_service_config(root: Path | None = None) -> dict:
    import json

    path = service_config_file(root)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def write_service_config(
    *,
    api_url: str,
    tenant: str,
    tunnel_mode: str = "quick",
    root: Path | None = None,
    extra: dict | None = None,
) -> Path:
    """Persist handoff so Windows Service can keep GW + tunnel after GUI closes."""
    import json
    from datetime import datetime, timezone

    mode = (tunnel_mode or "quick").strip().lower()
    if mode not in ("quick", "named"):
        mode = "quick"
    payload: dict = {
        "enabled": True,
        "apiUrl": (api_url or "").rstrip("/"),
        "tenantCode": (tenant or "").strip() or "demo",
        "tunnelMode": mode,
        "writtenAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    if extra:
        for k, v in extra.items():
            if k in ("enabled", "apiUrl", "tenantCode", "tunnelMode", "writtenAt"):
                continue
            payload[k] = v
    path = service_config_file(root)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def read_link_key(root: Path | None = None) -> str:
    env = (os.environ.get("DEVICE_LINK_KEY") or "").strip()
    if env:
        return env
    path = key_file(root)
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8").strip()


def write_link_key(value: str, root: Path | None = None) -> None:
    text = (value or "").strip()
    if not text:
        return
    path = key_file(root)
    path.write_text(text + "\n", encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def read_pairing_token(root: Path | None = None) -> str:
    env = (os.environ.get("HRHUB_PAIRING_TOKEN") or "").strip()
    if env:
        return env
    path = pairing_token_file(root)
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8").strip()


def write_pairing_token(value: str, root: Path | None = None) -> None:
    text = (value or "").strip()
    path = pairing_token_file(root)
    if not text:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        return
    path.write_text(text + "\n", encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass
