"""
HR HUB Link — self-contained Windows package → release/HRHUB-Link (+ portable ZIP).

The package ships its own Python (python.org embeddable build, PSF-signed so
Smart App Control allows it) with every library preinstalled. After unpacking /
installing nothing else is needed: no system Python, no pip, no downloads.

Build-time requirements: Windows, system Python 3.10+, internet.

    python build_bundle.py            # release/HRHUB-Link + release/HRHUB-Link-portable.zip
    python build_bundle.py --no-zip
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
GW_SRC = REPO / "apps" / "device-gw"
CACHE = HERE / "build" / "cache"
REL = HERE / "release" / "HRHUB-Link"
ZIP_OUT = HERE / "release" / "HRHUB-Link-portable.zip"

PY_VERSION = "3.12.10"
PY_EMBED_URL = f"https://www.python.org/ftp/python/{PY_VERSION}/python-{PY_VERSION}-embed-amd64.zip"
GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py"
CLOUDFLARED_URL = (
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
)

# Desktop window (WebView2) on top of the gateway requirements.
EXTRA_PACKAGES = ["pywebview==6.2.1"]
# Dependencies published only as source distributions (all pure Python).
SDIST_ONLY = ["proxy_tools"]

# Imports that must work inside the bundled runtime.
SMOKE_IMPORTS = (
    "webview, clr, fastapi, uvicorn, httpx, pydantic, pydantic_settings, "
    "nats, multipart, PIL.Image, starlette"
)

BUILD_ONLY = {"build_bundle.py", "pack_zip.py", "setup_wizard.py"}
PACKAGE_FILES = [
    "config.json",
    "hrhub-link.ico",
    "hrhub-link-256.png",
    "LICENSE.txt",
    "QOLLAMA.txt",
    "SERVICE.txt",
    "install-service.bat",
    "uninstall-service.bat",
    "ADMIN-PAROL.bat",
    "REPAIR-INSTALL.bat",
    "START-GW.bat",
    "link.ps1",
]


def log(msg: str) -> None:
    print(msg, flush=True)


def download(url: str, dest: Path) -> Path:
    if dest.is_file() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    log(f"  yuklanmoqda: {url}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url, timeout=120) as resp, tmp.open("wb") as fh:
        shutil.copyfileobj(resp, fh)
    tmp.replace(dest)
    return dest


def run(cmd: list[str], **kw) -> None:
    subprocess.run(cmd, check=True, **kw)


def build_python(target: Path) -> Path:
    log("[1/5] Python runtime (embeddable, PSF imzoli)...")
    embed = download(PY_EMBED_URL, CACHE / f"python-{PY_VERSION}-embed-amd64.zip")
    target.mkdir(parents=True)
    with zipfile.ZipFile(embed) as zf:
        zf.extractall(target)
    tag = "".join(PY_VERSION.split(".")[:2])
    (target / f"python{tag}._pth").write_text(
        f"python{tag}.zip\n.\nLib\\site-packages\nimport site\n", encoding="ascii"
    )
    (target / "Lib" / "site-packages").mkdir(parents=True, exist_ok=True)

    py = target / "python.exe"
    get_pip = download(GET_PIP_URL, CACHE / "get-pip.py")
    run([str(py), str(get_pip), "--no-warn-script-location", "-q"])

    log("[2/5] Kutubxonalar ilova ichiga o'rnatilmoqda...")
    # Embeddable Python cannot run isolated sdist builds; pre-build pure-python
    # sdists with the host interpreter and install wheels only.
    wheels = CACHE / "wheels"
    run(
        [
            sys.executable, "-m", "pip", "wheel", "--no-deps", "-q",
            "--disable-pip-version-check", "-w", str(wheels), *SDIST_ONLY,
        ]
    )
    run(
        [
            str(py), "-m", "pip", "install", "--no-warn-script-location",
            "--disable-pip-version-check", "--no-cache-dir", "-q",
            "--only-binary=:all:", "--find-links", str(wheels),
            "-r", str(GW_SRC / "requirements.txt"), *EXTRA_PACKAGES,
        ]
    )
    run([str(py), "-c", f"import {SMOKE_IMPORTS}; print('  import ok')"])

    # pip/setuptools are build tools only — the installed app never installs anything.
    subprocess.run([str(py), "-m", "pip", "uninstall", "-y", "-q", "setuptools", "wheel"], check=False)
    run([str(py), "-m", "pip", "uninstall", "-y", "-q", "pip"])
    shutil.rmtree(target / "Scripts", ignore_errors=True)
    site = target / "Lib" / "site-packages"
    for tests in list(site.rglob("tests")):
        if tests.is_dir() and tests.parent.name in {"PIL", "pydantic", "anyio", "nats"}:
            shutil.rmtree(tests, ignore_errors=True)
    return py


def copy_app(rel: Path) -> None:
    log("[3/5] Ilova fayllari...")
    for src in sorted(HERE.glob("*.py")):
        if src.name in BUILD_ONLY or src.name.startswith("test_"):
            continue
        shutil.copy2(src, rel / src.name)
    for name in PACKAGE_FILES:
        src = HERE / name
        if src.is_file():
            shutil.copy2(src, rel / name)
    ui = HERE / "ui"
    if not (ui / "index.html").is_file():
        raise SystemExit("ui/index.html yo'q — avval: cd ui-src && npm run build")
    shutil.copytree(ui, rel / "ui")

    gw = rel / "gw"
    (gw / "adapters").mkdir(parents=True)
    for name in ("main.py", "nats_client.py", "requirements.txt"):
        if (GW_SRC / name).is_file():
            shutil.copy2(GW_SRC / name, gw / name)
    for src in (GW_SRC / "adapters").glob("*.py"):
        shutil.copy2(src, gw / "adapters" / src.name)
    if not (gw / "main.py").is_file():
        raise SystemExit(f"device-gw topilmadi: {GW_SRC}")

    cf = rel / "runtime" / "cloudflared.exe"
    for cand in (HERE / "runtime" / "cloudflared.exe", CACHE / "cloudflared.exe"):
        if cand.is_file():
            shutil.copy2(cand, cf)
            break
    else:
        shutil.copy2(download(CLOUDFLARED_URL, CACHE / "cloudflared.exe"), cf)


def write_launchers(rel: Path) -> None:
    crlf = "\r\n"
    (rel / "BOSHLASH.bat").write_text(
        crlf.join(
            [
                "@echo off",
                "REM HR HUB Link — ilovani ochish (ichki Python, tashqi dastur kerak emas).",
                'cd /d "%~dp0"',
                'if exist "%~dp0runtime\\python\\pythonw.exe" (',
                '  start "" /D "%~dp0" "%~dp0runtime\\python\\pythonw.exe" "%~dp0office_link_app.py"',
                "  exit /b 0",
                ")",
                "echo [XATO] runtime\\python topilmadi — paketni qayta oching yoki qayta o'rnating.",
                "pause",
                "exit /b 1",
                "",
            ]
        ),
        encoding="utf-8",
    )
    cmds = rel / "buyruqlar"
    cmds.mkdir()
    py = '"%~dp0..\\runtime\\python\\python.exe"'
    helpers = {
        "bulk-provision.bat": [
            'if "%~1"=="" (',
            "  echo Foydalanish: buyruqlar\\bulk-provision.bat --hosts IP1,IP2 --location ID --password PAROL",
            "  pause",
            "  exit /b 1",
            ")",
            f'{py} "%~dp0..\\bulk_provision.py" %*',
            "pause",
        ],
        "service-status.bat": [
            "sc query HRHUB-OfficeLink 2>nul",
            'if exist "%CD%\\data\\service_status.json" type "%CD%\\data\\service_status.json"',
            'if exist "%CD%\\data\\tunnel_url.txt" type "%CD%\\data\\tunnel_url.txt"',
            "pause",
        ],
        "service-ornatish.bat": ['call "%~dp0..\\install-service.bat"'],
        "service-ochirish.bat": ['call "%~dp0..\\uninstall-service.bat"'],
        "admin-parol.bat": ['call "%~dp0..\\ADMIN-PAROL.bat"'],
        "tunnel-url.bat": [
            'if exist "%CD%\\data\\tunnel_url.txt" (type "%CD%\\data\\tunnel_url.txt") else echo Tunnel URL yo\'q.',
            "pause",
        ],
    }
    for name, body in helpers.items():
        (cmds / name).write_text(
            crlf.join(["@echo off", 'cd /d "%~dp0.."', *body, ""]), encoding="utf-8"
        )
    (rel / "OQISH.txt").write_text(
        crlf.join(
            [
                "HR HUB Link — OFIS PAKETI",
                "========================",
                "",
                "1) BOSHLASH.bat — ilovani ochish",
                "2) Web dan pairing token → Ulash",
                "3) install-service.bat (ADMIN) — kompyuter yonganda avtomatik ishlash",
                "",
                "Hammasi paket ichida: runtime\\python (Python + kutubxonalar),",
                "runtime\\cloudflared.exe, gw\\ (device-gw). Python yoki boshqa dastur",
                "o'rnatish shart emas.",
                "Batafsil: QOLLAMA.txt",
                "",
            ]
        ),
        encoding="utf-8",
    )


def precompile(rel: Path, py: Path) -> None:
    log("[4/5] .pyc oldindan kompilyatsiya (Program Files faqat o'qish uchun)...")
    # Compile with the bundled interpreter so the cache tag (cpython-312) matches.
    run(
        [
            str(py), "-c",
            "import compileall,sys; "
            "ok=compileall.compile_dir(sys.argv[1], quiet=1, workers=0); "
            "ok&=compileall.compile_dir(sys.argv[2], quiet=1, workers=0, maxlevels=0); "
            "ok&=compileall.compile_dir(sys.argv[3], quiet=1, workers=0); "
            "sys.exit(0 if ok else 1)",
            str(rel / "runtime" / "python" / "Lib" / "site-packages"),
            str(rel),
            str(rel / "gw"),
        ]
    )


def make_zip(rel: Path, out: Path) -> None:
    log("[5/5] ZIP...")
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in sorted(rel.rglob("*")):
            if path.is_file():
                zf.write(path, path.relative_to(rel).as_posix())


def dir_mb(path: Path) -> float:
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file()) / 1024 / 1024


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-zip", action="store_true")
    args = ap.parse_args()
    if sys.platform != "win32":
        raise SystemExit("Faqat Windows'da yig'iladi.")

    if REL.exists():
        shutil.rmtree(REL)
    REL.mkdir(parents=True)
    py = build_python(REL / "runtime" / "python")
    copy_app(REL)
    write_launchers(REL)
    precompile(REL, py)
    log(f"[OK] {REL}  ({dir_mb(REL):.1f} MB)")
    if not args.no_zip:
        make_zip(REL, ZIP_OUT)
        log(f"[OK] {ZIP_OUT}  ({ZIP_OUT.stat().st_size / 1024 / 1024:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
