# -*- mode: python ; coding: utf-8 -*-
# Bitta HRHUB-Link-Setup.exe — EULA ustasi + ichida to‘liq HRHUB-Link payload.
from pathlib import Path

block_cipher = None
root = Path(SPECPATH).resolve()
payload = root / "release" / "HRHUB-Link"
if not payload.is_dir():
    raise SystemExit(f"Avval pack-release.bat: missing {payload}")

datas = [
    (str(payload), "payload"),
    (str(root / "LICENSE.txt"), "."),
]

a = Analysis(
    [str(root / "setup_wizard.py")],
    pathex=[str(root)],
    binaries=[],
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="HRHUB-Link-Setup",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(root / "hrhub-link.ico") if (root / "hrhub-link.ico").is_file() else None,
    uac_admin=True,
)
