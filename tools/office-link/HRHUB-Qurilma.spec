# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller onedir, no console: HRHUB-Qurilma.exe (WebView2 desktop UI)."""

from pathlib import Path

spec_dir = Path(SPECPATH)
ui_dir = spec_dir / "ui"
gw_dir = (spec_dir / ".." / ".." / "apps" / "device-gw").resolve()
if not (gw_dir / "main.py").is_file():
    gw_dir = (spec_dir / "gw").resolve()

datas = [
    (str(spec_dir / "config.json"), "."),
    (str(spec_dir / "hrhub-link.ico"), "."),
    (str(spec_dir / "hrhub-link-256.png"), "."),
    (str(ui_dir), "ui"),
]
# Bundle device-gw so office PCs do not need the monorepo checkout.
if (gw_dir / "main.py").is_file():
    datas.append((str(gw_dir / "main.py"), "gw"))
    if (gw_dir / "nats_client.py").is_file():
        datas.append((str(gw_dir / "nats_client.py"), "gw"))
    if (gw_dir / "requirements.txt").is_file():
        datas.append((str(gw_dir / "requirements.txt"), "gw"))
    adapters = gw_dir / "adapters"
    if adapters.is_dir():
        datas.append((str(adapters), "gw/adapters"))

cf_candidates = [
    spec_dir / "runtime" / "cloudflared.exe",
    (spec_dir / ".." / "cloudflared.exe").resolve(),
]
for cf in cf_candidates:
    if cf.is_file():
        datas.append((str(cf), "."))
        break

a = Analysis(
    [str(spec_dir / "office_link_app.py")],
    pathex=[str(spec_dir)],
    binaries=[],
    datas=datas,
    hiddenimports=[
        "webview",
        "webview.platforms.edgechromium",
        "desktop_app",
        "tkinter",
        "tkinter.ttk",
        "office_link_gui",
        "session",
        "auth_lock",
        "discovery",
        "paths",
        "provision",
        "passwords",
        "api_client",
        "runtime_setup",
        "tunnel_watch",
        "credential_store",
        "device_email",
        "device_security",
        "device_push",
        "isapi_http",
        "face_agent",
        "service_worker",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "unittest"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="HRHUB-Qurilma",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    icon=str(spec_dir / "hrhub-link.ico"),
    version=str(spec_dir / "file_version_info.txt"),
    uac_admin=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    name="HRHUB-Qurilma",
)
