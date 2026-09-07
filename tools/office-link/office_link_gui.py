"""Tkinter GUI — operator pastes pairing token and device password."""
from __future__ import annotations

import subprocess
import sys
import threading
import tkinter as tk
from tkinter import ttk

from auth_lock import CONFIRM, LOCKED
from discovery import OFFLINE, OK, TIMEOUT
from paths import find_root, read_link_key, read_pairing_token
from session import OfficeLinkSession, SubmitResult

TITLE = "HR HUB — qurilmani ulash"


def _hide_console() -> None:
    if sys.platform != "win32":
        return
    try:
        import ctypes

        hwnd = ctypes.windll.kernel32.GetConsoleWindow()
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 0)
    except Exception:
        pass


class OfficeLinkApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.session = OfficeLinkSession()
        self.busy = False
        self._tick_job: str | None = None
        self._locations: list[dict] = []
        self._build()
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self.root.after(200, self._bootstrap)

    def _build(self) -> None:
        self.root.title(TITLE)
        self.root.minsize(420, 500)
        self.root.geometry("500x540")
        try:
            self.root.configure(bg="#f4f6f8")
        except tk.TclError:
            pass

        menubar = tk.Menu(self.root)
        admin_menu = tk.Menu(menubar, tearoff=0)
        admin_menu.add_command(
            label="Admin parol oynasi (kalit ko‘rsatilmaydi)",
            command=self._open_admin,
        )
        menubar.add_cascade(label="Admin", menu=admin_menu)
        self.root.config(menu=menubar)

        pad = {"padx": 16, "pady": 6}
        frm = ttk.Frame(self.root, padding=8)
        frm.pack(fill=tk.BOTH, expand=True)

        ttk.Label(frm, text="Holat").pack(anchor="w", **pad)
        self.status_var = tk.StringVar(value="Qidirilmoqda")
        self.status_lbl = ttk.Label(
            frm, textvariable=self.status_var, font=("Segoe UI", 12, "bold")
        )
        self.status_lbl.pack(anchor="w", padx=16)

        self.device_var = tk.StringVar(value="Qurilma: —")
        ttk.Label(frm, textvariable=self.device_var).pack(anchor="w", **pad)

        self.state_var = tk.StringVar(value="Aniqlangan holat: —")
        ttk.Label(frm, textvariable=self.state_var).pack(anchor="w", padx=16)

        tok_row = ttk.Frame(frm)
        tok_row.pack(fill=tk.X, padx=16, pady=(10, 2))
        ttk.Label(tok_row, text="Pairing token").pack(side=tk.LEFT)
        self.token_var = tk.StringVar(value=read_pairing_token(self.session.root))
        self.token_entry = ttk.Entry(tok_row, textvariable=self.token_var, width=28, show="•")
        self.token_entry.pack(side=tk.LEFT, padx=8)
        self.token_btn = ttk.Button(tok_row, text="Saqlash", command=self._save_token)
        self.token_btn.pack(side=tk.LEFT)

        row = ttk.Frame(frm)
        row.pack(fill=tk.X, padx=16, pady=4)
        ttk.Label(row, text="IP (ixtiyoriy)").pack(side=tk.LEFT)
        self.ip_var = tk.StringVar()
        self.ip_entry = ttk.Entry(row, textvariable=self.ip_var, width=22)
        self.ip_entry.pack(side=tk.LEFT, padx=8)
        self.rescan_btn = ttk.Button(row, text="Qidirish", command=self._start_scan)
        self.rescan_btn.pack(side=tk.LEFT)

        loc_row = ttk.Frame(frm)
        loc_row.pack(fill=tk.X, padx=16, pady=(10, 2))
        ttk.Label(loc_row, text="Lokatsiya").pack(side=tk.LEFT)
        self.location_var = tk.StringVar(value="")
        self.location_combo = ttk.Combobox(
            loc_row,
            textvariable=self.location_var,
            state="readonly",
            width=32,
        )
        self.location_combo.pack(side=tk.LEFT, padx=8)
        self.location_combo.bind("<<ComboboxSelected>>", self._on_location_selected)

        ttk.Label(frm, text="Hozirgi admin paroli (bir marta)").pack(anchor="w", padx=16, pady=(12, 2))
        self.pwd_var = tk.StringVar()
        self.pwd_entry = ttk.Entry(frm, textvariable=self.pwd_var, show="*", width=36)
        self.pwd_entry.pack(anchor="w", padx=16)
        self.pwd_entry.bind("<Return>", lambda _e: self._on_ulash())

        self.lock_var = tk.StringVar(value="")
        self.lock_lbl = ttk.Label(frm, textvariable=self.lock_var, foreground="#a40000")
        self.lock_lbl.pack(anchor="w", padx=16, pady=4)

        self.btn = ttk.Button(frm, text="Ulash", command=self._on_ulash)
        self.btn.pack(anchor="w", padx=16, pady=10)

        self.note = ttk.Label(
            frm,
            text=(
                "Web → Связь с офисом dan pairing token. "
                "«Admin bor»: hozirgi parolni bir marta yozing — tizim YANGI parol o‘ylab "
                "qurilmaga o‘rnatadi va serverga yuboradi. Keyin sozlash faqat Web dan. "
                "Yangi parol ekranda KO‘RSATILMAYDI."
            ),
            wraplength=450,
        )
        self.note.pack(anchor="w", padx=16, pady=(8, 0))

        if not self.session.has_credentials():
            self.lock_var.set(
                "Pairing token yoki admin kaliti kerak. Web → Связь yoki ADMIN-PAROL.bat."
            )

    def _bootstrap(self) -> None:
        if self.session.pairing_token():
            threading.Thread(target=self._bind_pairing_worker, daemon=True).start()
        self._load_locations()
        self._start_scan()

    def _save_token(self) -> None:
        token = self.token_var.get().strip()
        self.session.set_pairing_token(token)
        if not token:
            self.lock_var.set("Token o‘chirildi.")
            if not self.session.has_link_key():
                self.lock_var.set(
                    "Pairing token yoki admin kaliti kerak. Web → Связь yoki ADMIN-PAROL.bat."
                )
            return
        self.lock_var.set("Token saqlandi. Sessiya bog‘lanmoqda...")
        threading.Thread(target=self._bind_pairing_worker, daemon=True).start()

    def _bind_pairing_worker(self) -> None:
        ok, msg = self.session.bind_pairing_session()

        def done() -> None:
            if ok:
                self.lock_var.set("Pairing sessiya bog‘landi.")
                self._load_locations()
            else:
                self.lock_var.set(msg[:200] if msg else "Pairing xato")

        self.root.after(0, done)

    def _load_locations(self) -> None:
        key = read_link_key(self.session.root)
        pairing = self.session.pairing_token()
        if not key and not pairing:
            self.location_combo["values"] = []
            self.location_var.set("")
            return

        def worker() -> None:
            try:
                import api_client

                code, data = api_client.list_locations(
                    self.session.api_url,
                    key,
                    self.session.tenant,
                    pairing_token=pairing or None,
                )
            except Exception:
                code, data = 0, None
            self.root.after(0, lambda: self._locations_done(code, data))

        threading.Thread(target=worker, daemon=True).start()

    def _locations_done(self, code: int, data) -> None:
        items: list[dict] = []
        if code == 200:
            raw = data
            if isinstance(data, dict):
                raw = data.get("locations") or data.get("items") or data.get("data") or []
            if isinstance(raw, list):
                for row in raw:
                    if not isinstance(row, dict):
                        continue
                    lid = str(row.get("id") or "").strip()
                    if not lid:
                        continue
                    name = str(row.get("name") or row.get("title") or lid).strip()
                    items.append({"id": lid, "name": name})
        self._locations = items
        labels = [f"{x['name']} ({x['id'][:8]}…)" if len(x["id"]) > 8 else x["name"] for x in items]
        self._location_labels = labels
        self._label_to_id = {labels[i]: items[i]["id"] for i in range(len(items))}
        self.location_combo["values"] = labels
        if labels and not self.location_var.get():
            self.location_var.set(labels[0])
            self.session.set_location_id(items[0]["id"])
        elif not labels:
            self.location_var.set("")
            self.session.set_location_id(None)
            if self.session.has_credentials() and not self.lock_var.get():
                self.lock_var.set("Lokatsiyalar yuklanmadi. Token / API ni tekshiring.")

    def _on_location_selected(self, _event=None) -> None:
        label = self.location_var.get()
        lid = getattr(self, "_label_to_id", {}).get(label) or ""
        self.session.set_location_id(lid)

    def _set_busy(self, busy: bool) -> None:
        self.busy = busy
        state = "disabled" if busy else "normal"
        try:
            self.btn.state(["disabled"] if busy else ["!disabled"])
            self.rescan_btn.state(["disabled"] if busy else ["!disabled"])
            self.location_combo.configure(state="disabled" if busy else "readonly")
            self.token_btn.state(["disabled"] if busy else ["!disabled"])
        except tk.TclError:
            self.btn.configure(state=state)
            self.rescan_btn.configure(state=state)
        if self.session.auth.is_locked():
            self.pwd_entry.configure(state="disabled")
            self.btn.state(["disabled"])
        elif not busy:
            self.pwd_entry.configure(state="normal")

    def _refresh_lock_ui(self) -> None:
        if self.session.auth.is_locked():
            left = self.session.auth.format_remaining()
            self.status_var.set("Qulflangan")
            self.lock_var.set(f"Qulflangan: {left}  (Hikvision uslubi, 30 daqiqa)")
            self.pwd_entry.configure(state="disabled")
            try:
                self.btn.state(["disabled"])
            except tk.TclError:
                self.btn.configure(state="disabled")
        else:
            if self.lock_var.get().startswith("Qulflangan"):
                self.lock_var.set("")
                if not self.busy:
                    self.pwd_entry.configure(state="normal")
                    try:
                        self.btn.state(["!disabled"])
                    except tk.TclError:
                        self.btn.configure(state="normal")

    def _tick_lock(self) -> None:
        self._refresh_lock_ui()
        self._tick_job = self.root.after(1000, self._tick_lock)

    def _show_device(self) -> None:
        d = self.session.chosen
        if not d:
            self.device_var.set("Qurilma: topilmadi")
            self.state_var.set("Aniqlangan holat: —")
            return
        name = d.hint_name or "Hikvision"
        self.device_var.set(f"Qurilma: {name}  {d.host}")
        if not self.ip_var.get().strip():
            self.ip_var.set(d.host)
        label = self.session.detected_state_label()
        self.state_var.set(f"Aniqlangan holat: {label}")
        if (self.session.detected_state or {}).get("state") == "new":
            self.lock_var.set(
                "Yangi qurilma: Ulash bosilganda platforma o‘zi parol o‘ylab "
                "aktivatsiya qilishga urinadi. Muvaffaqiyatsiz bo‘lsa — avval terminalda "
                "admin o‘rnating, keyin «Admin bor» bilan ulang."
            )
            self.pwd_var.set("")
            self.pwd_entry.configure(state="disabled")
        else:
            if str(self.pwd_entry.cget("state")) == "disabled" and not self.session.auth.is_locked():
                self.pwd_entry.configure(state="normal")
            if self.lock_var.get().startswith("Yangi qurilma:"):
                self.lock_var.set("")

    def _start_scan(self) -> None:
        if self.busy:
            return
        self.status_var.set("Qidirilmoqda")
        self.device_var.set("Qurilma: —")
        self.state_var.set("Aniqlangan holat: —")
        self._set_busy(True)
        threading.Thread(target=self._scan_worker, daemon=True).start()

    def _scan_worker(self) -> None:
        try:
            devices = self.session.scan()
        except Exception:
            devices = []
        self.root.after(0, lambda: self._scan_done(devices))

    def _scan_done(self, devices: list) -> None:
        self._set_busy(False)
        if self.session.auth.is_locked():
            self._refresh_lock_ui()
            return
        if not devices:
            self.status_var.set("Qurilma topilmadi")
            self.device_var.set("Qurilma: topilmadi — IP yozing")
            self.state_var.set("Aniqlangan holat: —")
            return
        self._show_device()
        if devices[0].online:
            self.status_var.set("Online")
        else:
            self.status_var.set("Qurilma topilmadi")

    def _on_ulash(self) -> None:
        if self.busy or self.session.auth.is_locked():
            return
        # Persist token from UI before link.
        tok = self.token_var.get().strip()
        if tok != (self.session.pairing_token() or ""):
            self.session.set_pairing_token(tok)
        self._on_location_selected()
        if not (self.session.location_id or "").strip():
            self.status_var.set("Lokatsiya tanlanmagan")
            self.lock_var.set("Lokatsiya tanlanmagan. Ulashdan oldin lokatsiyani tanlang.")
            return
        if not self.session.has_credentials():
            self.status_var.set("Token kerak")
            self.lock_var.set(
                "Pairing token yoki admin kaliti kerak. Web → Связь yoki ADMIN-PAROL.bat."
            )
            return
        ip = self.ip_var.get().strip()
        if ip:
            chosen = self.session.choose_ip(ip)
            if chosen is None:
                self.status_var.set("IP manzil noto‘g‘ri.")
                return
            if not chosen.online:
                self.status_var.set("Qurilma onlayn emas")
                self.device_var.set(f"Qurilma: {ip}")
                self.state_var.set("Aniqlangan holat: —")
                return
            self._show_device()
        elif not self.session.chosen:
            self.status_var.set("Qurilma topilmadi")
            return
        password = self.pwd_var.get()
        self._set_busy(True)
        self.status_var.set("Tekshirilmoqda...")
        threading.Thread(target=self._ulash_worker, args=(password,), daemon=True).start()

    def _ulash_worker(self, password: str) -> None:
        result = self.session.submit_password(password)
        if result.kind == OK:
            def progress(msg: str) -> None:
                self.root.after(0, lambda m=msg: self.status_var.set(m))

            linked = self.session.link_to_cloud(progress)
            self.root.after(0, lambda: self._ulash_done(linked, clear_pwd=False, linked=True))
            return
        self.root.after(0, lambda: self._ulash_done(result, clear_pwd=result.kind in (CONFIRM, LOCKED)))

    def _ulash_done(self, result: SubmitResult, clear_pwd: bool, linked: bool = False) -> None:
        self._set_busy(False)
        if clear_pwd:
            self.pwd_var.set("")
            self.pwd_entry.focus_set()
        kind = result.kind
        if kind == CONFIRM:
            self.status_var.set("Parol noto‘g‘ri")
            self.lock_var.set("Parol noto‘g‘ri. Qayta kiriting (avtomatik qayta urinish yo‘q).")
        elif kind == LOCKED:
            self.status_var.set("Qulflangan")
            self._refresh_lock_ui()
            if self._tick_job is None:
                self._tick_lock()
        elif kind == TIMEOUT:
            self.status_var.set("Tarmoq kutish vaqti")
            self.lock_var.set(result.message)
        elif kind == OFFLINE:
            self.status_var.set("Qurilma onlayn emas")
            self.lock_var.set(result.message)
        elif kind == "location":
            self.status_var.set("Lokatsiya tanlanmagan")
            self.lock_var.set(result.message)
        elif kind == "linked" or (linked and kind == "linked"):
            self.status_var.set("Ulandi")
            self.lock_var.set("")
            host = (result.device or {}).get("host") or ""
            name = (result.device or {}).get("name") or ""
            self.device_var.set(f"Qurilma: {name}  {host}".strip())
            web = self.session.web_url
            try:
                self.session.write_service_handoff()
                svc_note = (
                    " Service: data\\service.json yozildi. "
                    "install-service.bat ni ADMIN qilib ishga tushiring (SERVICE.txt). "
                    "Keyin oynani yopishingiz mumkin."
                )
            except Exception:
                svc_note = " Oyna ochiq tursin (yoki SERVICE.txt)."
            extra = f" Web: {web}." if web else ""
            self.note.configure(
                text=(
                    "Ulandi. Qurilma boshqaruvi Webga topshirildi. "
                    "Yangi admin parol operatorga KO‘RSATILMAYDI — faqat tenant admin "
                    "(Устройства) ko‘radi. Guvohlar qayta sozlamasin."
                    + extra
                    + svc_note
                )
            )
            self.pwd_var.set("")
            self.pwd_entry.configure(state="disabled")
            try:
                self.btn.state(["disabled"])
            except tk.TclError:
                self.btn.configure(state="disabled")
        else:
            self.status_var.set(result.message or "Xato")
            self.lock_var.set(result.message)

    def _open_admin(self) -> None:
        bat = find_root() / "ADMIN-PAROL.bat"
        if not bat.is_file():
            self.lock_var.set("ADMIN-PAROL.bat topilmadi.")
            return
        flags = subprocess.CREATE_NEW_CONSOLE if sys.platform == "win32" else 0
        try:
            subprocess.Popen(
                ["cmd.exe", "/c", str(bat)] if sys.platform == "win32" else ["bash", str(bat)],
                cwd=str(bat.parent),
                creationflags=flags,
            )
        except OSError as exc:
            self.lock_var.set(str(exc)[:160])

    def _on_close(self) -> None:
        try:
            self.session.stop()
        except Exception:
            pass
        if self._tick_job is not None:
            try:
                self.root.after_cancel(self._tick_job)
            except Exception:
                pass
        self.root.destroy()


def run_app() -> None:
    _hide_console()
    root = tk.Tk()
    try:
        root.call("tk", "scaling", 1.2)
    except tk.TclError:
        pass
    OfficeLinkApp(root)
    root.mainloop()
