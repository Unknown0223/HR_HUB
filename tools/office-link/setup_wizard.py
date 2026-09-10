"""
HR HUB Link — Windows o‘rnatish ustasi (bitta Setup.exe).

EULA → papka tanlash → fayllarni nusxalash → yorliqlar → ishga tushirish.
Yonidagi config.json / connection.hrhub (download-bound) ni {app} ga ko‘chiradi.
"""
from __future__ import annotations

import os
import shutil
import sys
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

APP_NAME = "HR HUB Link"
DEFAULT_DIR = Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "HRHUB-Link"


def _bundle_root() -> Path:
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            cand = Path(meipass) / "payload"
            if cand.is_dir():
                return cand
        return Path(sys.executable).resolve().parent
    # Dev: prefer release layout
    here = Path(__file__).resolve().parent
    rel = here / "release" / "HRHUB-Link"
    if rel.is_dir():
        return rel
    dist = here / "dist" / "HRHUB-Qurilma"
    return dist if dist.is_dir() else here


def _setup_dir() -> Path:
    """Folder where the user downloaded/ran Setup.exe (sidecars live here)."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _read_license() -> str:
    for base in (_bundle_root().parent, _bundle_root(), _setup_dir(), Path(__file__).resolve().parent):
        for name in ("LICENSE.txt", "EULA.txt"):
            p = base / name
            if p.is_file():
                try:
                    return p.read_text(encoding="utf-8")
                except OSError:
                    pass
    return (
        "HR HUB Link — foydalanish shartlari.\n\n"
        "Davom etish orqali siz shartlarga rozilik bildirasiz.\n"
    )


class SetupWizard(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title(f"{APP_NAME} — o‘rnatish")
        self.geometry("640x520")
        self.minsize(560, 440)
        self.resizable(True, True)
        self.target = tk.StringVar(value=str(DEFAULT_DIR))
        self.agree = tk.BooleanVar(value=False)
        self.desktop = tk.BooleanVar(value=True)
        self.launch = tk.BooleanVar(value=True)
        self._build()

    def _build(self) -> None:
        pad = {"padx": 16, "pady": 8}
        head = ttk.Label(
            self,
            text=f"{APP_NAME} o‘rnatuvchi",
            font=("Segoe UI Semibold", 14),
        )
        head.pack(anchor="w", **pad)
        ttk.Label(
            self,
            text="Bitta Setup orqali ofis ilovasini o‘rnating. Zip ichidagi ko‘p papkalar kerak emas.",
            wraplength=580,
        ).pack(anchor="w", padx=16)

        ttk.Label(self, text="Foydalanish shartlari (EULA)", font=("Segoe UI Semibold", 10)).pack(
            anchor="w", padx=16, pady=(12, 4)
        )
        frame = ttk.Frame(self)
        frame.pack(fill=tk.BOTH, expand=True, padx=16)
        scroll = ttk.Scrollbar(frame)
        scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.lic = tk.Text(frame, height=12, wrap=tk.WORD, yscrollcommand=scroll.set)
        self.lic.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scroll.config(command=self.lic.yview)
        self.lic.insert("1.0", _read_license())
        self.lic.configure(state=tk.DISABLED)

        ttk.Checkbutton(
            self,
            text="Men shartlarni o‘qidim va roziman",
            variable=self.agree,
            command=self._sync,
        ).pack(anchor="w", padx=16, pady=(8, 4))

        row = ttk.Frame(self)
        row.pack(fill=tk.X, padx=16, pady=4)
        ttk.Label(row, text="O‘rnatish papkasi:").pack(side=tk.LEFT)
        ttk.Entry(row, textvariable=self.target).pack(
            side=tk.LEFT, fill=tk.X, expand=True, padx=8
        )
        ttk.Button(row, text="Tanlash…", command=self._browse).pack(side=tk.LEFT)

        ttk.Checkbutton(
            self, text="Ish stoliga yorliq", variable=self.desktop
        ).pack(anchor="w", padx=16)
        ttk.Checkbutton(
            self, text="O‘rnatishdan keyin ochish", variable=self.launch
        ).pack(anchor="w", padx=16)

        self.status = tk.StringVar(value="")
        ttk.Label(self, textvariable=self.status, foreground="#605e5c").pack(
            anchor="w", padx=16, pady=(4, 0)
        )

        btns = ttk.Frame(self)
        btns.pack(fill=tk.X, padx=16, pady=12)
        ttk.Button(btns, text="Bekor qilish", command=self.destroy).pack(side=tk.RIGHT)
        self.ok_btn = ttk.Button(btns, text="O‘rnatish", command=self._install)
        self.ok_btn.pack(side=tk.RIGHT, padx=(0, 8))
        self._sync()

    def _sync(self) -> None:
        state = "normal" if self.agree.get() else "disabled"
        self.ok_btn.configure(state=state)

    def _browse(self) -> None:
        d = filedialog.askdirectory(initialdir=self.target.get() or str(DEFAULT_DIR))
        if d:
            self.target.set(d)

    def _install(self) -> None:
        if not self.agree.get():
            messagebox.showwarning(APP_NAME, "Avval shartlarga rozilik bering.")
            return
        src = _bundle_root()
        if not src.is_dir():
            messagebox.showerror(APP_NAME, f"Paket topilmadi:\n{src}")
            return
        dest = Path(self.target.get().strip() or str(DEFAULT_DIR))
        try:
            self.status.set("Nusxalanmoqda…")
            self.update_idletasks()
            dest.mkdir(parents=True, exist_ok=True)
            # Copy payload tree
            for item in src.iterdir():
                target = dest / item.name
                if item.is_dir():
                    if target.exists():
                        shutil.rmtree(target)
                    shutil.copytree(item, target)
                else:
                    shutil.copy2(item, target)

            # Tenant bind sidecars next to Setup.exe (from web download)
            setup_dir = _setup_dir()
            for name in ("config.json", "connection.hrhub", "OQISH.txt"):
                side = setup_dir / name
                if side.is_file():
                    shutil.copy2(side, dest / name)
                    ilova = dest / "ilova"
                    if ilova.is_dir() and name != "OQISH.txt":
                        shutil.copy2(side, ilova / name)

            # Ensure BOSHLASH if missing (dist-only payload)
            exe = dest / "ilova" / "HRHUB-Qurilma.exe"
            if not exe.is_file():
                exe = dest / "HRHUB-Qurilma.exe"
            if not (dest / "BOSHLASH.bat").is_file() and exe.is_file():
                (dest / "BOSHLASH.bat").write_text(
                    "@echo off\n"
                    f'cd /d "%~dp0"\n'
                    f'start "" /D "%~dp0{exe.parent.relative_to(dest)}" '
                    f'"%~dp0{exe.relative_to(dest)}"\n',
                    encoding="utf-8",
                )

            self._shortcuts(dest, exe if exe.is_file() else dest / "BOSHLASH.bat")
            self.status.set("Tayyor.")
            messagebox.showinfo(APP_NAME, f"O‘rnatildi:\n{dest}")
            if self.launch.get() and exe.is_file():
                os.startfile(str(exe))  # noqa: S606
            self.destroy()
        except Exception as e:
            messagebox.showerror(APP_NAME, f"O‘rnatish xatosi:\n{e}")
            self.status.set("Xato")

    def _shortcuts(self, dest: Path, target: Path) -> None:
        try:
            import winreg
            from subprocess import run

            # VBScript shortcut — no pywin32 required
            def write_lnk(path: Path, workdir: Path) -> None:
                vbs = dest / "_mkshortcut.vbs"
                vbs.write_text(
                    "Set s=CreateObject(\"WScript.Shell\")\n"
                    f'Set l=s.CreateShortcut("{path}")\n'
                    f'l.TargetPath="{target}"\n'
                    f'l.WorkingDirectory="{workdir}"\n'
                    f'l.Description="{APP_NAME}"\n'
                    "l.Save\n",
                    encoding="utf-8",
                )
                run(["cscript", "//nologo", str(vbs)], check=False, capture_output=True)
                try:
                    vbs.unlink()
                except OSError:
                    pass

            programs = Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / (
                r"Microsoft\Windows\Start Menu\Programs"
            )
            programs.mkdir(parents=True, exist_ok=True)
            write_lnk(programs / f"{APP_NAME}.lnk", target.parent)
            if self.desktop.get():
                desktop = Path.home() / "Desktop"
                if desktop.is_dir():
                    write_lnk(desktop / f"{APP_NAME}.lnk", target.parent)
        except Exception:
            pass


def main() -> None:
    app = SetupWizard()
    app.mainloop()


if __name__ == "__main__":
    main()
