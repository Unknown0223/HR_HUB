"""LAN discovery and Hikvision ISAPI probes.

Online check never sends a digest password. Password verify is one
authenticated request per call; the caller owns retry/lock policy.
"""
from __future__ import annotations

import hashlib
import http.client
import os
import re
import socket
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from ipaddress import ip_address
from typing import Any
from urllib.parse import urlsplit

UNAUTHORIZED = "unauthorized"
OK = "ok"
TIMEOUT = "timeout"
OFFLINE = "offline"
ERROR = "error"

def local_prefixes() -> list[str]:
    prefixes: list[str] = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip.startswith(("127.", "169.254.")):
                continue
            prefixes.append(".".join(ip.split(".")[:3]))
    except OSError:
        pass
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        if not ip.startswith(("127.", "169.254.")):
            prefixes.append(".".join(ip.split(".")[:3]))
    except OSError:
        pass
    finally:
        s.close()
    return list(dict.fromkeys(prefixes))


def port_open(host: str, port: int, timeout: float = 0.25) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def scan_open_ports(prefixes: list[str], port: int = 80, timeout: float = 0.25) -> list[tuple[str, int]]:
    found: list[tuple[str, int]] = []
    hosts: list[tuple[str, int]] = []
    for p in prefixes:
        for i in range(1, 255):
            hosts.append((f"{p}.{i}", port))
    with ThreadPoolExecutor(max_workers=64) as pool:
        futs = {pool.submit(port_open, h, pt, timeout): (h, pt) for h, pt in hosts}
        for fut in as_completed(futs):
            h, pt = futs[fut]
            try:
                if fut.result():
                    found.append((h, pt))
            except Exception:
                pass
    return found


def xml_text(root: ET.Element, names: tuple[str, ...]) -> str:
    for el in root.iter():
        tag = el.tag.split("}")[-1] if el.tag else ""
        if tag in names and el.text and el.text.strip():
            return el.text.strip()
    return ""


def parse_www_authenticate(header: str) -> dict[str, str]:
    out: dict[str, str] = {}
    if not header:
        return out
    body = header.strip()
    if body.lower().startswith("digest"):
        body = body[6:].strip()
    for m in re.finditer(r'([a-zA-Z]+)="([^"]*)"', body):
        out[m.group(1).lower()] = m.group(2)
    for m in re.finditer(r"([a-zA-Z]+)=([^,\s\"]+)", body):
        key = m.group(1).lower()
        if key not in out:
            out[key] = m.group(2).strip()
    return out


def _md5_hex(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def build_digest_header(
    challenge: dict[str, str],
    username: str,
    password: str,
    method: str,
    uri: str,
    nc: str = "00000001",
    cnonce: str | None = None,
) -> str:
    realm = challenge.get("realm", "")
    nonce = challenge.get("nonce", "")
    qop = (challenge.get("qop") or "").split(",")[0].strip()
    opaque = challenge.get("opaque", "")
    algorithm = challenge.get("algorithm") or "MD5"
    cnonce = cnonce or os.urandom(8).hex()
    ha1 = _md5_hex(f"{username}:{realm}:{password}")
    ha2 = _md5_hex(f"{method}:{uri}")
    if qop:
        response = _md5_hex(f"{ha1}:{nonce}:{nc}:{cnonce}:{qop}:{ha2}")
    else:
        response = _md5_hex(f"{ha1}:{nonce}:{ha2}")
    parts = [
        f'username="{username}"',
        f'realm="{realm}"',
        f'nonce="{nonce}"',
        f'uri="{uri}"',
        f'response="{response}"',
        f'algorithm="{algorithm}"',
    ]
    if qop:
        parts.extend([f'qop={qop}', f'nc={nc}', f'cnonce="{cnonce}"'])
    if opaque:
        parts.append(f'opaque="{opaque}"')
    return "Digest " + ", ".join(parts)


def _http_get(
    host: str,
    port: int,
    path: str,
    headers: dict[str, str] | None = None,
    timeout: float = 4.0,
) -> tuple[int, dict[str, str], bytes]:
    conn = http.client.HTTPConnection(host, port, timeout=timeout)
    try:
        conn.request("GET", path, headers=headers or {"Accept": "*/*"})
        resp = conn.getresponse()
        body = resp.read(256_000)
        hdrs = {k.lower(): v for k, v in resp.getheaders()}
        return resp.status, hdrs, body
    finally:
        conn.close()


def classify_probe(status: int, headers: dict[str, str], body: bytes) -> dict[str, Any]:
    text = ""
    try:
        text = body.decode("utf-8", errors="replace") if body else ""
    except Exception:
        text = ""
    www = headers.get("www-authenticate") or ""
    server = headers.get("server") or ""
    challenge = parse_www_authenticate(www)
    realm = challenge.get("realm") or ""
    blob = f"{www} {server} {text[:800]}".lower()
    hik = any(
        token in blob
        for token in (
            "digest",
            "ip camera",
            "hikvision",
            "app-webs",
            "dnvrs",
            "isapi",
            "webservice",
        )
    )
    if realm and "camera" in realm.lower():
        hik = True
    if status == 401 and "digest" in www.lower():
        hik = True
    hint = realm.strip()
    if hint.lower().startswith("ip camera") and "(" in hint and hint.endswith(")"):
        inner = hint[hint.find("(") + 1 : -1].strip()
        if inner:
            hint = inner
    return {
        "http": True,
        "status": status,
        "likely_hikvision": hik,
        "hint_name": hint,
        "digest": "digest" in www.lower(),
        "challenge": challenge,
        "server": server,
    }


@dataclass
class OnlineInfo:
    host: str
    port: int
    online: bool
    likely_hikvision: bool = False
    hint_name: str = ""
    detail: str = ""
    kind: str = OFFLINE


def probe_online(host: str, port: int = 80, timeout: float = 2.0) -> OnlineInfo:
    """TCP + unauthenticated HTTP. Never sends a password."""
    if not port_open(host, port, timeout=min(timeout, 1.0)):
        return OnlineInfo(host=host, port=port, online=False, kind=OFFLINE, detail="port")
    try:
        status, headers, body = _http_get(
            host, port, "/ISAPI/System/deviceInfo", timeout=timeout
        )
    except socket.timeout:
        return OnlineInfo(host=host, port=port, online=True, kind=TIMEOUT, detail="timeout")
    except OSError as exc:
        msg = str(exc).lower()
        if "timed out" in msg or "timeout" in msg:
            return OnlineInfo(host=host, port=port, online=True, kind=TIMEOUT, detail="timeout")
        return OnlineInfo(host=host, port=port, online=False, kind=ERROR, detail=str(exc)[:120])
    info = classify_probe(status, headers, body)
    name = str(info.get("hint_name") or "")
    hik = bool(info.get("likely_hikvision"))
    if not hik and status in (200, 401, 403):
        try:
            st2, hd2, bd2 = _http_get(host, port, "/", timeout=timeout)
            info2 = classify_probe(st2, hd2, bd2)
            hik = hik or bool(info2.get("likely_hikvision"))
            name = name or str(info2.get("hint_name") or "")
        except (socket.timeout, OSError):
            pass
    return OnlineInfo(
        host=host,
        port=port,
        online=True,
        likely_hikvision=hik,
        hint_name=name,
        kind=OK if hik else "other",
        detail=f"HTTP {status}",
    )


def parse_device_payload(body: bytes, content_type: str = "") -> dict[str, str]:
    serial = name = model = ""
    text = body.decode("utf-8", errors="replace") if body else ""
    if "json" in (content_type or "").lower() or text.lstrip().startswith("{"):
        try:
            import json

            data = json.loads(text)
            if isinstance(data, dict):
                info = data.get("DeviceInfo") if isinstance(data.get("DeviceInfo"), dict) else data
                if isinstance(info, dict):
                    serial = str(info.get("serialNumber") or info.get("deviceID") or "")
                    name = str(info.get("deviceName") or "")
                    model = str(info.get("model") or "")
        except Exception:
            pass
    if not (serial or name or model) and text.strip().startswith("<"):
        try:
            root = ET.fromstring(text)
            serial = xml_text(root, ("serialNumber", "deviceID"))
            name = xml_text(root, ("deviceName",))
            model = xml_text(root, ("model",))
        except Exception:
            pass
    return {"serialNumber": serial, "name": name, "model": model}


@dataclass
class VerifyResult:
    kind: str
    host: str = ""
    port: int = 80
    serialNumber: str = ""
    name: str = ""
    model: str = ""
    detail: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    def as_device(self) -> dict[str, Any]:
        return {
            "host": self.host,
            "port": self.port,
            "serialNumber": self.serialNumber,
            "name": self.name or self.host,
            "model": self.model or "Hikvision",
        }


def verify_password(
    host: str,
    port: int,
    username: str,
    password: str,
    timeout: float = 6.0,
) -> VerifyResult:
    """One digest attempt. Does not retry. Timeout is not UNAUTHORIZED."""
    path = "/ISAPI/System/deviceInfo"
    try:
        status, headers, body = _http_get(host, port, path, timeout=timeout)
    except socket.timeout:
        return VerifyResult(kind=TIMEOUT, host=host, port=port, detail="timeout")
    except OSError as exc:
        msg = str(exc).lower()
        if "timed out" in msg or "timeout" in msg:
            return VerifyResult(kind=TIMEOUT, host=host, port=port, detail="timeout")
        return VerifyResult(kind=OFFLINE, host=host, port=port, detail=str(exc)[:160])

    www = headers.get("www-authenticate") or ""
    if status == 401 and "digest" not in www.lower():
        return VerifyResult(kind=ERROR, host=host, port=port, detail="401")
    if status == 401:
        challenge = parse_www_authenticate(www)
        header = build_digest_header(challenge, username, password, "GET", path)
        try:
            status2, headers2, body2 = _http_get(
                host,
                port,
                path,
                headers={"Authorization": header, "Accept": "*/*"},
                timeout=timeout,
            )
        except socket.timeout:
            return VerifyResult(kind=TIMEOUT, host=host, port=port, detail="timeout")
        except OSError as exc:
            msg = str(exc).lower()
            if "timed out" in msg or "timeout" in msg:
                return VerifyResult(kind=TIMEOUT, host=host, port=port, detail="timeout")
            return VerifyResult(kind=ERROR, host=host, port=port, detail=str(exc)[:160])
        if status2 == 401:
            return VerifyResult(kind=UNAUTHORIZED, host=host, port=port, detail="401")
        if status2 >= 400:
            try:
                status3, headers3, body3 = _http_get(
                    host,
                    port,
                    path + "?format=json",
                    headers={"Authorization": header, "Accept": "application/json"},
                    timeout=timeout,
                )
            except (socket.timeout, OSError) as exc:
                msg = str(exc).lower()
                if "timed out" in msg or "timeout" in msg:
                    return VerifyResult(kind=TIMEOUT, host=host, port=port, detail="timeout")
                return VerifyResult(kind=ERROR, host=host, port=port, detail=str(exc)[:160])
            if status3 == 401:
                return VerifyResult(kind=UNAUTHORIZED, host=host, port=port, detail="401")
            if status3 >= 400:
                return VerifyResult(
                    kind=ERROR, host=host, port=port, detail=f"HTTP {status3}"
                )
            parsed = parse_device_payload(body3, headers3.get("content-type") or "")
            return VerifyResult(
                kind=OK,
                host=host,
                port=port,
                serialNumber=parsed.get("serialNumber") or "",
                name=parsed.get("name") or host,
                model=parsed.get("model") or "Hikvision",
            )
        parsed = parse_device_payload(body2, headers2.get("content-type") or "")
        return VerifyResult(
            kind=OK,
            host=host,
            port=port,
            serialNumber=parsed.get("serialNumber") or "",
            name=parsed.get("name") or host,
            model=parsed.get("model") or "Hikvision",
        )

    if status >= 400:
        return VerifyResult(kind=ERROR, host=host, port=port, detail=f"HTTP {status}")
    parsed = parse_device_payload(body, headers.get("content-type") or "")
    return VerifyResult(
        kind=OK,
        host=host,
        port=port,
        serialNumber=parsed.get("serialNumber") or "",
        name=parsed.get("name") or host,
        model=parsed.get("model") or "Hikvision",
    )


def find_devices(prefixes: list[str] | None = None) -> list[OnlineInfo]:
    prefs = prefixes if prefixes is not None else local_prefixes()
    opens = scan_open_ports(prefs)
    found: list[OnlineInfo] = []
    for host, port in opens:
        info = probe_online(host, port)
        if info.online and info.likely_hikvision:
            found.append(info)
    found.sort(key=lambda d: (d.host, d.port))
    return found


def valid_ip(value: str) -> bool:
    try:
        ip_address((value or "").strip())
        return True
    except ValueError:
        return False


def split_host(api_url: str) -> tuple[str, int, str, bool]:
    raw = (api_url or "").strip()
    if "://" not in raw:
        raw = "https://" + raw
    parts = urlsplit(raw)
    host = parts.hostname or ""
    tls = parts.scheme != "http"
    port = parts.port or (443 if tls else 80)
    base_path = parts.path.rstrip("/")
    return host, port, base_path, tls
