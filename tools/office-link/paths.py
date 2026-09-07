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


def data_dir(root: Path | None = None) -> Path:
    d = (root or find_root()) / "data"
    d.mkdir(parents=True, exist_ok=True)
    return d


def runtime_dir(root: Path | None = None) -> Path:
    d = (root or find_root()) / "runtime"
    d.mkdir(parents=True, exist_ok=True)
    return d


def gw_dir(root: Path | None = None) -> Path:
    return (root or find_root()) / "gw"


def key_file(root: Path | None = None) -> Path:
    return data_dir(root) / "link.key"


def pairing_token_file(root: Path | None = None) -> Path:
    return data_dir(root) / "pairing.token"


def config_file(root: Path | None = None) -> Path:
    return (root or find_root()) / "config.json"


def load_config(root: Path | None = None) -> dict:
    import json

    path = config_file(root)
    if not path.is_file():
        return {
            "apiUrl": "https://hr-hubapi-production.up.railway.app",
            "webUrl": "https://hr-hubweb-production.up.railway.app",
            "tenantCode": "demo",
        }
    return json.loads(path.read_text(encoding="utf-8"))


def service_config_file(root: Path | None = None) -> Path:
    return data_dir(root) / "service.json"


def service_status_file(root: Path | None = None) -> Path:
    return data_dir(root) / "service_status.json"


def tunnel_url_file(root: Path | None = None) -> Path:
    return data_dir(root) / "tunnel_url.txt"


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
