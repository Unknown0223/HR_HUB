"""
HR HUB Link — Windows o‘rnatish ustasi (bitta Setup.exe).

EULA → papka → nusxalash → Start Menu / Desktop → Apps & Features (Uninstall).
"""
from __future__ import annotations

import os
import shutil
import sys
import winreg
from pathlib import Path
from tkinter import filedialog, messagebox
import tkinter as tk
from tkinter import ttk

APP_NAME = "HR HUB Link"
APP_PUBLISHER = "HR HUB"
APP_VERSION = "1.2.0"
APP_GUID = "{8F3C2A1B-9D4E-4B6A-A7C1-HRHUB-LINK-01}"
DEFAULT_DIR = Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "HRHUB-Link"


def _bundle_root() -> Path:
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            cand = Path(meipass) / "payload"
            if cand.is_dir():
                return cand
        return Path(sys.executable).resolve().parent
    here = Path(__file__).resolve().parent
    rel = here / "release" / "HRHUB-Link"
    if rel.is_dir():
        return rel
    dist = here / "dist" / "HRHUB-Qurilma"
    return dist if dist.is_dir() else here


def _setup_dir() -> Path:
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


def _find_exe(dest: Path) -> Path | None:
    for cand in (dest / "ilova" / "HRHUB-Qurilma.exe", dest / "HRHUB-Qurilma.exe"):
        if cand.is_file():
            return cand
    return None


def _write_uninstall_script(dest: Path, exe: Path) -> Path:
    script = dest / "Uninstall-HRHUB-Link.bat"
    # Delayed delete so the bat can exit before its own folder is removed.
    script.write_text(
        "\r\n".join(
            [
                "@echo off",
                "setlocal",
                f'title {APP_NAME} — o‘chirish',
                "echo HR HUB Link o‘chirilmoqda...",
                f'if exist "{dest}\\uninstall-service.bat" call "{dest}\\uninstall-service.bat"',
                r'schtasks /Delete /TN "HRHUB-OfficeLink-Tunnel" /F >nul 2>&1',
                rf'del /F /Q "%ProgramData%\Microsoft\Windows\Start Menu\Programs\{APP_NAME}.lnk" >nul 2>&1',
                rf'del /F /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\{APP_NAME}.lnk" >nul 2>&1',
                rf'del /F /Q "%USERPROFILE%\Desktop\{APP_NAME}.lnk" >nul 2>&1',
                rf'del /F /Q "%PUBLIC%\Desktop\{APP_NAME}.lnk" >nul 2>&1',
                "reg delete "
                f'"HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{APP_GUID}" /f >nul 2>&1',
                "reg delete "
                f'"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{APP_GUID}" /f >nul 2>&1',
                f'start "" cmd /c "timeout /t 2 /nobreak >nul & rmdir /S /Q "{dest}""',
                "echo Tayyor.",
                "endlocal",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return script


def _register_apps_list(dest: Path, exe: Path, uninstall: Path) -> None:
    icon = dest / "ilova" / "hrhub-link.ico"
    if not icon.is_file():
        icon = dest / "hrhub-link.ico"
    display_icon = f"{exe},0" if not icon.is_file() else str(icon)
    estimated = 0
    try:
        for p in dest.rglob("*"):
            if p.is_file():
                estimated += p.stat().st_size
    except OSError:
        estimated = 40 * 1024 * 1024

    values = {
        "DisplayName": APP_NAME,
        "DisplayVersion": APP_VERSION,
        "Publisher": APP_PUBLISHER,
        "InstallLocation": str(dest),
        "DisplayIcon": display_icon,
        "UninstallString": f'cmd.exe /c ""{uninstall}""',
        "QuietUninstallString": f'cmd.exe /c ""{uninstall}""',
        "NoModify": 1,
        "NoRepair": 1,
        "EstimatedSize": max(1, estimated // 1024),
        "URLInfoAbout": "https://hr-hubweb-production.up.railway.app",
    }

    for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
        try:
            key_path = rf"Software\Microsoft\Windows\CurrentVersion\Uninstall\{APP_GUID}"
            with winreg.CreateKeyEx(hive, key_path) as key:
                for name, value in values.items():
                    if isinstance(value, int):
                        winreg.SetValueEx(key, name, 0, winreg.REG_DWORD, value)
                    else:
                        winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)
            return
        except OSError:
            continue


def _shortcuts(dest: Path, target: Path, desktop: bool) -> None:
    def write_lnk(path: Path, workdir: Path) -> None:
        icon = dest / "ilova" / "hrhub-link.ico"
        if not icon.is_file():
            icon = dest / "hrhub-link.ico"
        icon_line = f'l.IconLocation="{icon}"\n' if icon.is_file() else ""
        vbs = dest / "_mkshortcut.vbs"
        vbs.write_text(
            "Set s=CreateObject(\"WScript.Shell\")\n"
            f'Set l=s.CreateShortcut("{path}")\n'
            f'l.TargetPath="{target}"\n'
            f'l.WorkingDirectory="{workdir}"\n'
            f'l.Description="{APP_NAME}"\n'
            f"{icon_line}"
            "l.Save\n",
            encoding="utf-8",
        )
        import subprocess

        subprocess.run(["cscript", "//nologo", str(vbs)], check=False, capture_output=True)
        try:
            vbs.unlink()
        except OSError:
            pass

    programs = Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / (
        r"Microsoft\Windows\Start Menu\Programs"
    )
    programs.mkdir(parents=True, exist_ok=True)
    write_lnk(programs / f"{APP_NAME}.lnk", target.parent)
    user_programs = (
        Path(os.environ["APPDATA"]) / r"Microsoft\Windows\Start Menu\Programs"
    )
    try:
        user_programs.mkdir(parents=True, exist_ok=True)
        write_lnk(user_programs / f"{APP_NAME}.lnk", target.parent)
    except OSError:
        pass
    if desktop:
        for desk in (Path.home() / "Desktop", Path(os.environ.get("PUBLIC", r"C:\Users\Public")) / "Desktop"):
            if desk.is_dir():
                write_lnk(desk / f"{APP_NAME}.lnk", target.parent)


class SetupWizard(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title(f"{APP_NAME} Setup")
        self.geometry("680x560")
        self.minsize(600, 480)
        self.configure(bg="#0B1220")
        self.target = tk.StringVar(value=str(DEFAULT_DIR))
        self.agree = tk.BooleanVar(value=False)
        self.desktop = tk.BooleanVar(value=True)
        self.launch = tk.BooleanVar(value=True)
        self._build()

    def _build(self) -> None:
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        pad = {"padx": 20, "pady": 8}
        head = tk.Frame(self, bg="#0B1220")
        head.pack(fill=tk.X, **pad)
        tk.Label(
            head,
            text=APP_NAME,
            bg="#0B1220",
            fg="#F8FAFC",
            font=("Segoe UI Semibold", 18),
        ).pack(anchor="w")
        tk.Label(
            head,
            text="Windows ilovasini o‘rnatish — Start Menu va Ilovalar ro‘yxatiga qo‘shiladi",
            bg="#0B1220",
            fg="#94A3B8",
            font=("Segoe UI", 10),
        ).pack(anchor="w", pady=(4, 0))

        card = tk.Frame(self, bg="#F8FAFC")
        card.pack(fill=tk.BOTH, expand=True, padx=20, pady=(8, 16))

        tk.Label(card, text="Foydalanish shartlari", bg="#F8FAFC", font=("Segoe UI Semibold", 10)).pack(
            anchor="w", padx=16, pady=(14, 4)
        )
        frame = tk.Frame(card, bg="#F8FAFC")
        frame.pack(fill=tk.BOTH, expand=True, padx=16)
        scroll = ttk.Scrollbar(frame)
        scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.lic = tk.Text(frame, height=12, wrap=tk.WORD, yscrollcommand=scroll.set, font=("Segoe UI", 9))
        self.lic.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scroll.config(command=self.lic.yview)
        self.lic.insert("1.0", _read_license())
        self.lic.configure(state=tk.DISABLED)

        ttk.Checkbutton(
            card, text="Men shartlarni o‘qidim va roziman", variable=self.agree, command=self._sync
        ).pack(anchor="w", padx=16, pady=(8, 4))

        row = tk.Frame(card, bg="#F8FAFC")
        row.pack(fill=tk.X, padx=16, pady=4)
        tk.Label(row, text="Papka:", bg="#F8FAFC").pack(side=tk.LEFT)
        ttk.Entry(row, textvariable=self.target).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=8)
        ttk.Button(row, text="Tanlash…", command=self._browse).pack(side=tk.LEFT)

        ttk.Checkbutton(card, text="Ish stoliga yorliq", variable=self.desktop).pack(anchor="w", padx=16)
        ttk.Checkbutton(card, text="O‘rnatishdan keyin ochish", variable=self.launch).pack(
            anchor="w", padx=16
        )

        self.status = tk.StringVar(value="")
        tk.Label(card, textvariable=self.status, bg="#F8FAFC", fg="#64748B").pack(
            anchor="w", padx=16, pady=(4, 0)
        )

        btns = tk.Frame(card, bg="#F8FAFC")
        btns.pack(fill=tk.X, padx=16, pady=14)
        ttk.Button(btns, text="Bekor qilish", command=self.destroy).pack(side=tk.RIGHT)
        self.ok_btn = ttk.Button(btns, text="O‘rnatish", command=self._install)
        self.ok_btn.pack(side=tk.RIGHT, padx=(0, 8))
        self._sync()

    def _sync(self) -> None:
        self.ok_btn.configure(state="normal" if self.agree.get() else "disabled")

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
            for item in src.iterdir():
                target = dest / item.name
                if item.is_dir():
                    if target.exists():
                        shutil.rmtree(target)
                    shutil.copytree(item, target)
                else:
                    shutil.copy2(item, target)

            setup_dir = _setup_dir()
            for name in ("config.json", "connection.hrhub", "OQISH.txt"):
                side = setup_dir / name
                if side.is_file():
                    shutil.copy2(side, dest / name)
                    ilova = dest / "ilova"
                    if ilova.is_dir() and name != "OQISH.txt":
                        shutil.copy2(side, ilova / name)

            exe = _find_exe(dest)
            if not (dest / "BOSHLASH.bat").is_file() and exe is not None:
                (dest / "BOSHLASH.bat").write_text(
                    "@echo off\r\n"
                    f'cd /d "%~dp0"\r\n'
                    f'start "" /D "%~dp0{exe.parent.relative_to(dest)}" '
                    f'"%~dp0{exe.relative_to(dest)}"\r\n',
                    encoding="utf-8",
                )

            if exe is None:
                raise FileNotFoundError("HRHUB-Qurilma.exe topilmadi")

            uninstall = _write_uninstall_script(dest, exe)
            _register_apps_list(dest, exe, uninstall)
            _shortcuts(dest, exe, self.desktop.get())
            self.status.set("Tayyor.")
            messagebox.showinfo(
                APP_NAME,
                f"O‘rnatildi:\n{dest}\n\n"
                "Ilova Start Menu va Windows «Ilovalar» ro‘yxatida ko‘rinadi.",
            )
            if self.launch.get():
                os.startfile(str(exe))  # noqa: S606
            self.destroy()
        except Exception as e:
            messagebox.showerror(APP_NAME, f"O‘rnatish xatosi:\n{e}")
            self.status.set("Xato")


def main() -> None:
    if sys.platform == "win32":
        try:
            import ctypes

            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(
                "HRHUB.OfficeLink.Setup"
            )
        except Exception:
            pass
    app = SetupWizard()
    app.mainloop()


if __name__ == "__main__":
    main()
