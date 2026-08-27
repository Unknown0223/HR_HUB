"""Install portable Python / cloudflared, copy device-gw, start/stop services.

GUI never shows a console. Child processes use CREATE_NO_WINDOW on Windows.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Callable

from paths import find_root, gw_dir, runtime_dir

CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
PYTHON_EMBED_URL = "https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip"
GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py"
CLOUDFLARED_URL = (
    "https://github.com/cloudflare/cloudflared/releases/latest/download/"
    "cloudflared-windows-amd64.exe"
)
UA = {"User-Agent": "HRHUB-OfficeLink/1.0"}
GW_PORT = 8800

StatusFn = Callable[[str], None]


def _status(cb: StatusFn | None, msg: str) -> None:
    if cb:
        cb(msg)


def _download(url: str, dest: Path, cb: StatusFn | None = None) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as resp, dest.open("wb") as f:
        shutil.copyfileobj(resp, f)


def _run_hidden(
    args: list[str],
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
    timeout: int | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=str(cwd) if cwd else None,
        env=env,
        timeout=timeout,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )


def _popen_hidden(
    args: list[str],
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
) -> subprocess.Popen[str]:
    return subprocess.Popen(
        args,
        cwd=str(cwd) if cwd else None,
        env=env,
        stdout=stdout,
        stderr=stderr,
        stdin=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )


def portable_python(root: Path | None = None) -> Path:
    return runtime_dir(root) / "python" / "python.exe"


def cloudflared_exe(root: Path | None = None) -> Path:
    return runtime_dir(root) / "cloudflared.exe"


def copy_gw_sources(root: Path | None = None, cb: StatusFn | None = None) -> Path:
    root = root or find_root()
    dest = gw_dir(root)
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "adapters").mkdir(parents=True, exist_ok=True)
    src = None
    for cand in (
        root.parent.parent / "apps" / "device-gw",
        root.parent / "apps" / "device-gw",
        Path(r"D:\hr-hub\apps\device-gw"),
    ):
        if (cand / "main.py").is_file():
            src = cand
            break
    if src:
        _status(cb, "Gateway kodlari nusxalanmoqda...")
        shutil.copy2(src / "main.py", dest / "main.py")
        if (src / "nats_client.py").is_file():
            shutil.copy2(src / "nats_client.py", dest / "nats_client.py")
        if (src / "requirements.txt").is_file():
            shutil.copy2(src / "requirements.txt", dest / "requirements.txt")
        adapters = src / "adapters"
        if adapters.is_dir():
            for py in adapters.glob("*.py"):
                shutil.copy2(py, dest / "adapters" / py.name)
    if not (dest / "main.py").is_file():
        raise FileNotFoundError(
            "Gateway kodlari yo‘q. Avval ADMIN-PAROL.bat ni HR HUB kompyuterida ishga tushiring."
        )
    return dest


def install_portable_python(root: Path | None = None, cb: StatusFn | None = None) -> Path:
    root = root or find_root()
    py = portable_python(root)
    if py.is_file():
        return py
    _status(cb, "Python yuklanmoqda...")
    rt = runtime_dir(root)
    zpath = rt / "python-embed.zip"
    _download(PYTHON_EMBED_URL, zpath, cb)
    py_dir = rt / "python"
    py_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zpath, "r") as zf:
        zf.extractall(py_dir)
    zpath.unlink(missing_ok=True)
    pth = next(py_dir.glob("python*._pth"), None)
    if pth:
        pth.write_text(
            "python312.zip\n.\nLib\\site-packages\nimport site\n",
            encoding="ascii",
        )
    get_pip = rt / "get-pip.py"
    _status(cb, "pip o‘rnatilmoqda...")
    _download(GET_PIP_URL, get_pip, cb)
    r = _run_hidden([str(py), str(get_pip), "--no-warn-script-location"], cwd=py_dir)
    get_pip.unlink(missing_ok=True)
    if r.returncode != 0:
        raise RuntimeError("pip o‘rnatilmadi (internet kerak).")
    return py


def install_cloudflared(root: Path | None = None, cb: StatusFn | None = None) -> Path:
    root = root or find_root()
    exe = cloudflared_exe(root)
    if exe.is_file():
        return exe
    nearby = root.parent.parent / "tools" / "cloudflared.exe"
    if nearby.is_file():
        shutil.copy2(nearby, exe)
        return exe
    _status(cb, "Tunnel dasturi yuklanmoqda...")
    _download(CLOUDFLARED_URL, exe, cb)
    return exe


def install_gw_deps(root: Path | None = None, cb: StatusFn | None = None) -> None:
    root = root or find_root()
    py = portable_python(root)
    req = gw_dir(root) / "requirements.txt"
    if not req.is_file():
        raise FileNotFoundError("Gateway requirements.txt yo‘q.")
    _status(cb, "Kerakli kutubxonalar o‘rnatilmoqda...")
    r = _run_hidden(
        [str(py), "-m", "pip", "install", "--disable-pip-version-check", "-q", "-r", str(req)],
        cwd=gw_dir(root),
        timeout=300,
    )
    if r.returncode != 0:
        raise RuntimeError("Kutubxona o‘rnatilmadi (internet kerak).")


def ensure_runtime(root: Path | None = None, cb: StatusFn | None = None) -> None:
    copy_gw_sources(root, cb)
    install_portable_python(root, cb)
    install_cloudflared(root, cb)
    install_gw_deps(root, cb)


def _kill_pid(pid: int) -> None:
    if pid <= 0:
        return
    try:
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                capture_output=True,
                creationflags=CREATE_NO_WINDOW,
            )
        else:
            os.kill(pid, 15)
    except OSError:
        pass


def _read_pid(path: Path) -> int:
    try:
        return int(path.read_text(encoding="ascii").strip() or "0")
    except (OSError, ValueError):
        return 0


def _write_pid(path: Path, pid: int) -> None:
    path.write_text(str(pid), encoding="ascii")


class ServiceBundle:
    def __init__(self) -> None:
        self.gw: subprocess.Popen[str] | None = None
        self.tunnel: subprocess.Popen[str] | None = None
        self.tunnel_url: str = ""
        self.root: Path | None = None

    def stop(self) -> None:
        for proc in (self.tunnel, self.gw):
            if proc and proc.poll() is None:
                _kill_pid(proc.pid)
        self.tunnel = None
        self.gw = None
        self.tunnel_url = ""
        if self.root:
            rt = runtime_dir(self.root)
            for name in ("gw.pid", "tunnel.pid"):
                pid = _read_pid(rt / name)
                if pid:
                    _kill_pid(pid)
                try:
                    (rt / name).unlink(missing_ok=True)
                except OSError:
                    pass


def start_gateway(
    api_url: str,
    punch_key: str,
    root: Path | None = None,
    cb: StatusFn | None = None,
) -> subprocess.Popen[str]:
    root = root or find_root()
    py = portable_python(root)
    gwd = gw_dir(root)
    rt = runtime_dir(root)
    old = _read_pid(rt / "gw.pid")
    if old:
        _kill_pid(old)
    env = os.environ.copy()
    env.update(
        {
            "DEVICE_GW_PORT": str(GW_PORT),
            "DEVICE_GW_HOST": "127.0.0.1",
            "DEVICE_GW_API_URL": api_url,
            "DEVICE_GW_PUNCH_KEY": punch_key,
            "DEVICE_GW_NATS_URL": "nats://127.0.0.1:1",
            "DEFAULT_ADAPTER": "hikvision_isapi",
        }
    )
    _status(cb, "Gateway yoqilmoqda...")
    proc = _popen_hidden(
        [str(py), "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(GW_PORT)],
        cwd=gwd,
        env=env,
    )
    _write_pid(rt / "gw.pid", proc.pid)
    import http.client

    for _ in range(40):
        if proc.poll() is not None:
            raise RuntimeError("Gateway ochilmadi.")
        try:
            conn = http.client.HTTPConnection("127.0.0.1", GW_PORT, timeout=2)
            conn.request("GET", "/health")
            resp = conn.getresponse()
            resp.read()
            conn.close()
            if resp.status == 200:
                return proc
        except OSError:
            pass
        time.sleep(0.4)
    raise RuntimeError("Gateway ochilmadi.")


def start_tunnel(
    root: Path | None = None,
    cb: StatusFn | None = None,
) -> tuple[subprocess.Popen[str], str]:
    root = root or find_root()
    exe = cloudflared_exe(root)
    rt = runtime_dir(root)
    old = _read_pid(rt / "tunnel.pid")
    if old:
        _kill_pid(old)
    _status(cb, "Internet tunnel ochilmoqda...")
    proc = _popen_hidden(
        [str(exe), "tunnel", "--url", f"http://127.0.0.1:{GW_PORT}"],
        cwd=rt,
    )
    _write_pid(rt / "tunnel.pid", proc.pid)
    buf: list[str] = []
    pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
    deadline = time.time() + 70
    while time.time() < deadline:
        if proc.poll() is not None:
            extra = ""
            try:
                extra = (proc.stdout.read() or "") if proc.stdout else ""
            except Exception:
                pass
            raise RuntimeError("Tunnel ochilmadi.")
        line = ""
        try:
            if proc.stdout:
                line = proc.stdout.readline() or ""
        except Exception:
            line = ""
        if line:
            buf.append(line)
            m = pattern.search(line)
            if m:
                return proc, m.group(0)
        else:
            time.sleep(0.2)
        joined = "".join(buf[-40:])
        m = pattern.search(joined)
        if m:
            return proc, m.group(0)
    raise RuntimeError("Tunnel URL topilmadi.")
