# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller onedir, no console: HRHUB-Qurilma.exe"""

from pathlib import Path

spec_dir = Path(SPECPATH)

a = Analysis(
    [str(spec_dir / "office_link_app.py")],
    pathex=[str(spec_dir)],
    binaries=[],
    datas=[(str(spec_dir / "config.json"), ".")],
    hiddenimports=["tkinter", "tkinter.ttk"],
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
