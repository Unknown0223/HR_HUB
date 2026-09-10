"""Tkinter GUI — Windows-style office link client."""
from __future__ import annotations

import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk

from auth_lock import CONFIRM, LOCKED
from discovery import OFFLINE, OK, TIMEOUT, UNAUTHORIZED
from paths import find_root, read_link_key, read_pairing_token
from session import OfficeLinkSession, SubmitResult

TITLE = "HR HUB — qurilmani ulash"

# Fluent-inspired palette matching app icon (purple gears).
C = {
    "bg": "#f3f3f3",
    "surface": "#ffffff",
    "border": "#e5e5e5",
    "text": "#1a1a1a",
    "muted": "#605e5c",
    "accent": "#7c3aed",
    "accent_hover": "#6d28d9",
    "accent_soft": "#f5f3ff",
    "ok": "#0f7b3a",
    "ok_bg": "#dff6dd",
    "warn": "#9a6700",
    "warn_bg": "#fff4ce",
    "danger": "#c42b1c",
    "danger_bg": "#fde7e9",
    "header": "#5b21b6",
    "header2": "#7c3aed",
}


def _resource_path(*names: str) -> Path | None:
    here = Path(__file__).resolve().parent
    search: list[Path] = [here, find_root(), find_root() / "ilova"]
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        search.insert(0, exe_dir)
        search.insert(0, exe_dir / "_internal")
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            search.insert(0, Path(meipass))
    for base in search:
        for name in names:
            cand = base / name
            if cand.is_file():
                return cand
    return None


def _icon_path() -> Path | None:
    return _resource_path("hrhub-link.ico")


def _png_icon_path() -> Path | None:
    return _resource_path("hrhub-link-256.png")


def _set_app_user_model_id() -> None:
    """Windows taskbar groups by AppUserModelID; set before creating windows."""
    if sys.platform != "win32":
        return
    try:
        import ctypes

        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(
            "HRHUB.OfficeLink.Qurilma"
        )
    except Exception:
        pass


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


def _apply_style(root: tk.Tk) -> None:
    style = ttk.Style(root)
    try:
        style.theme_use("vista" if sys.platform == "win32" else "clam")
    except tk.TclError:
        pass

    style.configure("App.TFrame", background=C["bg"])
    style.configure("Card.TFrame", background=C["surface"])
    style.configure("Header.TFrame", background=C["header"])
    style.configure(
        "Title.TLabel",
        background=C["header"],
        foreground="#ffffff",
        font=("Segoe UI Semibold", 14),
    )
    style.configure(
        "Subtitle.TLabel",
        background=C["header"],
        foreground="#e9d5ff",
        font=("Segoe UI", 9),
    )
    style.configure(
        "CardTitle.TLabel",
        background=C["surface"],
        foreground=C["text"],
        font=("Segoe UI Semibold", 10),
    )
    style.configure(
        "Field.TLabel",
        background=C["surface"],
        foreground=C["muted"],
        font=("Segoe UI", 9),
    )
    style.configure(
        "Body.TLabel",
        background=C["surface"],
        foreground=C["text"],
        font=("Segoe UI", 10),
    )
    style.configure(
        "Muted.TLabel",
        background=C["surface"],
        foreground=C["muted"],
        font=("Segoe UI", 9),
    )
    style.configure(
        "Status.TLabel",
        background=C["surface"],
        foreground=C["text"],
        font=("Segoe UI Semibold", 16),
    )
    style.configure(
        "Alert.TLabel",
        background=C["danger_bg"],
        foreground=C["danger"],
        font=("Segoe UI Semibold", 9),
    )
    style.configure(
        "Hint.TLabel",
        background=C["accent_soft"],
        foreground=C["muted"],
        font=("Segoe UI", 9),
    )
    style.configure(
        "Primary.TButton",
        font=("Segoe UI Semibold", 10),
        padding=(16, 8),
    )
    style.configure(
        "Secondary.TButton",
        font=("Segoe UI", 9),
        padding=(10, 5),
    )
    style.configure("App.TEntry", padding=4)
    style.configure("App.TCombobox", padding=4)


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

    def _set_icon(self) -> None:
        icon = _icon_path()
        if icon:
            try:
                self.root.iconbitmap(default=str(icon))
                self.root.iconbitmap(str(icon))
            except tk.TclError:
                try:
                    self.root.iconbitmap(str(icon))
                except tk.TclError:
                    pass
        # iconphoto is more reliable for title bar on modern Windows.
        png = _png_icon_path() or icon
        if not png:
            return
        try:
            # Keep a reference so Tk GC does not drop the image.
            self._icon_images = getattr(self, "_icon_images", [])
            img = tk.PhotoImage(file=str(png))
            self._icon_images.append(img)
            self.root.iconphoto(True, img)
        except tk.TclError:
            pass

    def _card(self, parent: ttk.Frame, title: str) -> ttk.Frame:
        wrap = ttk.Frame(parent, style="App.TFrame")
        wrap.pack(fill=tk.X, padx=16, pady=(0, 12))
        outer = tk.Frame(wrap, bg=C["border"], bd=0, highlightthickness=0)
        outer.pack(fill=tk.X)
        card = tk.Frame(outer, bg=C["surface"], bd=0, highlightthickness=0)
        card.pack(fill=tk.X, padx=1, pady=1)
        ttk.Label(card, text=title, style="CardTitle.TLabel").pack(
            anchor="w", padx=16, pady=(14, 8)
        )
        body = ttk.Frame(card, style="Card.TFrame")
        body.pack(fill=tk.X, padx=16, pady=(0, 14))
        return body

    def _field_row(self, parent: ttk.Frame, label: str) -> ttk.Frame:
        ttk.Label(parent, text=label, style="Field.TLabel").pack(anchor="w", pady=(0, 4))
        row = ttk.Frame(parent, style="Card.TFrame")
        row.pack(fill=tk.X, pady=(0, 10))
        return row

    def _build(self) -> None:
        self.root.title(TITLE)
        self.root.minsize(520, 640)
        self.root.geometry("560x720")
        self.root.configure(bg=C["bg"])
        _apply_style(self.root)
        self._set_icon()

        menubar = tk.Menu(self.root)
        admin_menu = tk.Menu(menubar, tearoff=0)
        admin_menu.add_command(
            label="Admin parol oynasi (kalit ko‘rsatilmaydi)",
            command=self._open_admin,
        )
        admin_menu.add_command(
            label="Saqlangan terminal parolini ko‘rsat (tiklash)",
            command=self._show_saved_credential,
        )
        admin_menu.add_command(
            label="Tiklanish pochtasini o‘rnat (config)",
            command=self._apply_recovery_email_now,
        )
        menubar.add_cascade(label="Admin", menu=admin_menu)
        self.root.config(menu=menubar)

        shell = ttk.Frame(self.root, style="App.TFrame")
        shell.pack(fill=tk.BOTH, expand=True)

        header = tk.Frame(shell, bg=C["header"], height=78)
        header.pack(fill=tk.X)
        header.pack_propagate(False)
        head_inner = ttk.Frame(header, style="Header.TFrame")
        head_inner.pack(fill=tk.BOTH, expand=True, padx=18, pady=12)
        ttk.Label(head_inner, text="HR HUB Link", style="Title.TLabel").pack(anchor="w")
        ttk.Label(
            head_inner,
            text="Ofis Face ID terminalini platformaga ulash",
            style="Subtitle.TLabel",
        ).pack(anchor="w", pady=(2, 0))
        try:
            from paths import bound_web_label, load_config

            bound = bound_web_label(load_config(self.session.root), self.session.root)
            if bound:
                ttk.Label(
                    head_inner,
                    text=f"Bog‘langan web: {bound}",
                    style="Subtitle.TLabel",
                ).pack(anchor="w", pady=(4, 0))
        except Exception:
            pass

        canvas_host = ttk.Frame(shell, style="App.TFrame")
        canvas_host.pack(fill=tk.BOTH, expand=True)
        canvas = tk.Canvas(canvas_host, bg=C["bg"], highlightthickness=0, bd=0)
        scroll = ttk.Scrollbar(canvas_host, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=scroll.set)
        scroll.pack(side=tk.RIGHT, fill=tk.Y)
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        frm = ttk.Frame(canvas, style="App.TFrame")
        win = canvas.create_window((0, 0), window=frm, anchor="nw")

        def _sync(_event=None) -> None:
            canvas.configure(scrollregion=canvas.bbox("all"))
            canvas.itemconfigure(win, width=canvas.winfo_width())

        frm.bind("<Configure>", _sync)
        canvas.bind("<Configure>", _sync)

        # Status card
        status_body = self._card(frm, "Holat")
        self.status_var = tk.StringVar(value="Qidirilmoqda")
        self.status_lbl = ttk.Label(
            status_body, textvariable=self.status_var, style="Status.TLabel"
        )
        self.status_lbl.pack(anchor="w")
        self.status_badge = tk.Label(
            status_body,
            text="KUTILMOQDA",
            bg=C["warn_bg"],
            fg=C["warn"],
            font=("Segoe UI Semibold", 8),
            padx=8,
            pady=2,
        )
        self.status_badge.pack(anchor="w", pady=(8, 10))

        self.device_var = tk.StringVar(value="Qurilma: —")
        ttk.Label(status_body, textvariable=self.device_var, style="Body.TLabel").pack(
            anchor="w"
        )
        self.state_var = tk.StringVar(value="Aniqlangan holat: —")
        ttk.Label(status_body, textvariable=self.state_var, style="Muted.TLabel").pack(
            anchor="w", pady=(4, 0)
        )

        # Connection card
        conn = self._card(frm, "Ulanish sozlamalari")
        try:
            from paths import bound_web_label, load_config

            cfg = load_config(self.session.root)
            label = bound_web_label(cfg, self.session.root)
            if label:
                ttk.Label(
                    conn,
                    text=(
                        "Bu ilova shu webdan yuklangan / bog‘langan. "
                        "Boshqa mijoz uchun o‘sha webdan yangi to‘plam oling."
                    ),
                    style="Muted.TLabel",
                    wraplength=480,
                ).pack(anchor="w", pady=(0, 8))
                ttk.Label(conn, text=label, style="Body.TLabel", wraplength=480).pack(
                    anchor="w", pady=(0, 8)
                )
        except Exception:
            pass

        row = self._field_row(conn, "Pairing token")
        self.token_var = tk.StringVar(value=read_pairing_token(self.session.root))
        # ASCII mask — Unicode «•» on some Windows/Tk builds breaks paste/input.
        self.token_entry = ttk.Entry(
            row, textvariable=self.token_var, show="*", style="App.TEntry"
        )
        self.token_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self._enable_entry_clipboard(self.token_entry, self.token_var, replace_all=True)
        self.token_paste_btn = ttk.Button(
            row,
            text="Joylashtir",
            style="Secondary.TButton",
            command=lambda: self._paste_into_entry(
                self.token_entry, self.token_var, replace_all=True
            ),
        )
        self.token_paste_btn.pack(side=tk.LEFT, padx=(8, 0))
        self.token_btn = ttk.Button(
            row, text="Saqlash", style="Secondary.TButton", command=self._save_token
        )
        self.token_btn.pack(side=tk.LEFT, padx=(8, 0))

        row = self._field_row(conn, "IP manzil (ixtiyoriy)")
        self.ip_var = tk.StringVar()
        self.ip_entry = ttk.Entry(row, textvariable=self.ip_var, style="App.TEntry")
        self.ip_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self._enable_entry_clipboard(self.ip_entry, self.ip_var, replace_all=False)
        self.rescan_btn = ttk.Button(
            row, text="Qidirish", style="Secondary.TButton", command=self._start_scan
        )
        self.rescan_btn.pack(side=tk.LEFT, padx=(8, 0))

        row = self._field_row(conn, "Lokatsiya")
        self.location_var = tk.StringVar(value="")
        self.location_combo = ttk.Combobox(
            row,
            textvariable=self.location_var,
            state="readonly",
            style="App.TCombobox",
        )
        self.location_combo.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.location_combo.bind("<<ComboboxSelected>>", self._on_location_selected)
        self.loc_refresh_btn = ttk.Button(
            row, text="Yangilash", style="Secondary.TButton", command=self._load_locations
        )
        self.loc_refresh_btn.pack(side=tk.LEFT, padx=(8, 0))

        row = self._field_row(conn, "Hozirgi admin paroli (bir marta)")
        self.pwd_var = tk.StringVar()
        self._pwd_visible = False
        self.pwd_entry = ttk.Entry(
            row, textvariable=self.pwd_var, show="*", style="App.TEntry"
        )
        self.pwd_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self._enable_entry_clipboard(self.pwd_entry, self.pwd_var, replace_all=True)
        self.pwd_entry.bind("<Return>", lambda _e: self._on_ulash())
        self.pwd_toggle_btn = ttk.Button(
            row,
            text="Ko‘rsat",
            style="Secondary.TButton",
            command=self._toggle_pwd_visibility,
            width=8,
        )
        self.pwd_toggle_btn.pack(side=tk.LEFT, padx=(8, 0))

        self.alert_frame = tk.Frame(conn, bg=C["danger_bg"], bd=0)
        self.lock_var = tk.StringVar(value="")
        self.lock_lbl = ttk.Label(
            self.alert_frame, textvariable=self.lock_var, style="Alert.TLabel", wraplength=460
        )
        self.lock_lbl.pack(anchor="w", padx=10, pady=8, fill=tk.X)

        self.btn_row = ttk.Frame(conn, style="App.TFrame")
        self.btn_row.pack(anchor="e", pady=(4, 0))
        self.reconnect_btn = tk.Button(
            self.btn_row,
            text="Tarmoqni qayta ulash",
            command=self._on_reconnect,
            bg=C["surface"],
            fg=C["accent"],
            activebackground=C["accent_soft"],
            activeforeground=C["accent"],
            disabledforeground="#a78bfa",
            font=("Segoe UI Semibold", 10),
            relief=tk.FLAT,
            bd=0,
            padx=16,
            pady=8,
            cursor="hand2",
            highlightthickness=1,
            highlightbackground=C["accent"],
            highlightcolor=C["accent"],
        )
        self.reconnect_btn.pack(side=tk.LEFT, padx=(0, 8))
        self.btn = tk.Button(
            self.btn_row,
            text="Ulash",
            command=self._on_ulash,
            bg=C["accent"],
            fg="#ffffff",
            activebackground=C["accent_hover"],
            activeforeground="#ffffff",
            disabledforeground="#e9d5ff",
            font=("Segoe UI Semibold", 10),
            relief=tk.FLAT,
            bd=0,
            padx=22,
            pady=8,
            cursor="hand2",
        )
        self.btn.pack(side=tk.LEFT)

        # Hint card
        hint_wrap = ttk.Frame(frm, style="App.TFrame")
        hint_wrap.pack(fill=tk.X, padx=16, pady=(0, 16))
        hint_outer = tk.Frame(hint_wrap, bg=C["accent"], bd=0)
        hint_outer.pack(fill=tk.X)
        hint = tk.Frame(hint_outer, bg=C["accent_soft"], bd=0)
        hint.pack(fill=tk.X, padx=(3, 0))
        self.note = ttk.Label(
            hint,
            text=(
                "Web → Связь с офисом dan pairing token oling (nusxalang). "
                "Shu yerda Ctrl+V / Shift+Insert yoki «Joylashtir», so‘ng «Saqlash». "
                "Birinchi ulash: «Ulash» — yangi parol o‘rnatadi. "
                "Wi‑Fi o‘zgasa: «Tarmoqni qayta ulash» — webdan parol olinadi, "
                "faqat IP/tunnel yangilanadi (parol va yuzlar saqlanadi)."
            ),
            style="Hint.TLabel",
            wraplength=480,
            justify="left",
        )
        self.note.pack(anchor="w", padx=14, pady=12, fill=tk.X)

        if not self.session.has_credentials():
            self._show_alert(
                "Pairing token yoki admin kaliti kerak. Web → Связь yoki ADMIN-PAROL.bat."
            )
        else:
            self._hide_alert()

    def _show_alert(self, text: str) -> None:
        self.lock_var.set(text)
        if not self.alert_frame.winfo_ismapped():
            self.alert_frame.pack(fill=tk.X, pady=(0, 10), before=self.btn_row)

    def _hide_alert(self) -> None:
        self.lock_var.set("")
        if self.alert_frame.winfo_ismapped():
            self.alert_frame.pack_forget()

    def _set_badge(self, text: str, kind: str = "warn") -> None:
        colors = {
            "ok": (C["ok_bg"], C["ok"]),
            "warn": (C["warn_bg"], C["warn"]),
            "danger": (C["danger_bg"], C["danger"]),
            "accent": (C["accent_soft"], C["accent"]),
        }
        bg, fg = colors.get(kind, colors["warn"])
        self.status_badge.configure(text=text, bg=bg, fg=fg)

    def _bootstrap(self) -> None:
        if self.session.pairing_token():
            threading.Thread(target=self._bind_pairing_worker, daemon=True).start()
        self._load_locations()
        self._start_scan()

    def _clipboard_text(self) -> str:
        try:
            raw = self.root.clipboard_get()
        except tk.TclError:
            return ""
        text = str(raw or "").strip()
        # Web/copy often wraps token in quotes or newlines.
        if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
            text = text[1:-1].strip()
        return text.replace("\r", "").replace("\n", "").strip()

    def _paste_into_entry(
        self,
        entry: ttk.Entry,
        var: tk.StringVar,
        *,
        replace_all: bool = False,
    ) -> None:
        text = self._clipboard_text()
        if not text:
            self._show_alert("Bufer bo‘sh — avval webdan tokenni nusxalang (Ctrl+C).")
            return
        try:
            state = str(entry.cget("state"))
        except tk.TclError:
            state = "normal"
        if state == "disabled":
            return
        try:
            entry.focus_set()
        except tk.TclError:
            pass
        if replace_all:
            var.set(text)
        else:
            try:
                if entry.selection_present():
                    entry.delete(tk.SEL_FIRST, tk.SEL_LAST)
                entry.insert(tk.INSERT, text)
            except tk.TclError:
                var.set(text)
        try:
            entry.icursor(tk.END)
        except tk.TclError:
            pass
        if self.lock_var.get().startswith("Bufer"):
            self._hide_alert()

    def _enable_entry_clipboard(
        self,
        entry: ttk.Entry,
        var: tk.StringVar,
        *,
        replace_all: bool = False,
    ) -> None:
        """Reliable paste for ttk.Entry (esp. inside Canvas / masked fields)."""

        def _do_paste(_event=None):
            self._paste_into_entry(entry, var, replace_all=replace_all)
            return "break"

        def _select_all(_event=None):
            entry.selection_range(0, tk.END)
            entry.icursor(tk.END)
            return "break"

        def _clear(_event=None):
            var.set("")
            return "break"

        for seq in (
            "<<Paste>>",
            "<Control-v>",
            "<Control-V>",
            "<Shift-Insert>",
            "<Control-Key-v>",
            "<Control-Key-V>",
        ):
            entry.bind(seq, _do_paste)
        for seq in ("<Control-a>", "<Control-A>", "<Control-Key-a>", "<Control-Key-A>"):
            entry.bind(seq, _select_all)

        menu = tk.Menu(entry, tearoff=0)
        menu.add_command(
            label="Joylashtirish (Ctrl+V)",
            command=lambda: self._paste_into_entry(entry, var, replace_all=replace_all),
        )
        menu.add_command(label="Hammasini belgilash", command=lambda: _select_all())
        menu.add_command(label="Tozalash", command=lambda: _clear())

        def _popup(event):
            try:
                entry.focus_set()
                menu.tk_popup(event.x_root, event.y_root)
            finally:
                menu.grab_release()

        entry.bind("<Button-3>", _popup)
        # macOS / some mice
        entry.bind("<Button-2>", _popup)

    def _save_token(self) -> None:
        token = self.token_var.get().strip()
        self.session.set_pairing_token(token)
        if not token:
            self._show_alert("Token o‘chirildi.")
            if not self.session.has_link_key():
                self._show_alert(
                    "Pairing token yoki admin kaliti kerak. Web → Связь yoki ADMIN-PAROL.bat."
                )
            return
        self._show_alert("Token saqlandi. Sessiya bog‘lanmoqda...")
        threading.Thread(target=self._bind_pairing_worker, daemon=True).start()

    def _bind_pairing_worker(self) -> None:
        ok, msg = self.session.bind_pairing_session()

        def done() -> None:
            if ok:
                self._show_alert("Pairing sessiya bog‘landi.")
                self._load_locations()
            else:
                self._show_alert(msg[:200] if msg else "Pairing xato")

        self.root.after(0, done)

    def _load_locations(self) -> None:
        key = read_link_key(self.session.root)
        pairing = self.session.pairing_token()
        if not key and not pairing:
            self.location_combo["values"] = []
            self.location_var.set("")
            self._show_alert(
                "Avval pairing tokenni Saqlash qiling — keyin lokatsiyalar yuklanadi."
            )
            return

        self._show_alert("Lokatsiyalar yuklanmoqda...")

        def worker() -> None:
            try:
                import api_client

                code, data = api_client.list_locations(
                    self.session.api_url,
                    key,
                    self.session.tenant,
                    pairing_token=pairing or None,
                )
            except Exception as exc:
                code, data = 0, {"error": str(exc)[:160]}
            self.root.after(0, lambda: self._locations_done(code, data))

        threading.Thread(target=worker, daemon=True).start()

    def _locations_done(self, code: int, data) -> None:
        items: list[dict] = []
        err_detail = ""
        if 200 <= code < 300:
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
        elif isinstance(data, dict):
            err_detail = str(data.get("message") or data.get("error") or "")[:160]
        elif code == 0:
            err_detail = "Tarmoq xatosi (API ga ulanib bo‘lmadi)"
        else:
            err_detail = f"HTTP {code}"

        self._locations = items
        labels = [
            f"{x['name']} ({x['id'][:8]}…)" if len(x["id"]) > 8 else x["name"]
            for x in items
        ]
        self._location_labels = labels
        self._label_to_id = {labels[i]: items[i]["id"] for i in range(len(items))}
        self.location_combo["values"] = labels
        if labels:
            if not self.location_var.get() or self.location_var.get() not in labels:
                self.location_var.set(labels[0])
                self.session.set_location_id(items[0]["id"])
            self._show_alert(f"Lokatsiyalar: {len(labels)} ta. Ro‘yxatdan tanlang.")
            self.root.after(1800, lambda: self._hide_alert() if "Lokatsiyalar:" in self.lock_var.get() else None)
        else:
            self.location_var.set("")
            self.session.set_location_id(None)
            if not (200 <= code < 300):
                self._show_alert(
                    "Lokatsiyalar yuklanmadi: "
                    + (err_detail or "token / API ni tekshiring. Qayta Saqlash bosing.")
                )
            else:
                self._show_alert(
                    "Lokatsiya yo‘q. Web → Устройства → Локации da yarating, "
                    "keyin tokenni qayta Saqlash qiling."
                )

    def _toggle_pwd_visibility(self) -> None:
        self._pwd_visible = not getattr(self, "_pwd_visible", False)
        self.pwd_entry.configure(show="" if self._pwd_visible else "*")
        try:
            self.pwd_toggle_btn.configure(
                text="Yashir" if self._pwd_visible else "Ko‘rsat"
            )
        except tk.TclError:
            pass

    def _on_location_selected(self, _event=None) -> None:
        label = self.location_var.get()
        lid = getattr(self, "_label_to_id", {}).get(label) or ""
        self.session.set_location_id(lid)

    def _set_primary_btn(self, enabled: bool) -> None:
        state = "normal" if enabled else "disabled"
        for w in (self.btn, getattr(self, "reconnect_btn", None)):
            if w is None:
                continue
            try:
                w.configure(state=state)
            except tk.TclError:
                pass

    def _set_busy(self, busy: bool) -> None:
        self.busy = busy
        state = "disabled" if busy else "normal"
        for w in (self.rescan_btn, self.token_btn, self.token_paste_btn, self.loc_refresh_btn):
            try:
                w.state(["disabled"] if busy else ["!disabled"])
            except (tk.TclError, AttributeError):
                try:
                    w.configure(state=state)
                except tk.TclError:
                    pass
        for w in (self.token_entry, self.ip_entry):
            try:
                w.configure(state="disabled" if busy else "normal")
            except tk.TclError:
                pass
        try:
            self.location_combo.configure(state="disabled" if busy else "readonly")
        except tk.TclError:
            pass
        locked = self.session.auth.is_locked()
        self._set_primary_btn(enabled=(not busy and not locked))
        if locked:
            self.pwd_entry.configure(state="disabled")
        elif not busy:
            self.pwd_entry.configure(state="normal")

    def _refresh_lock_ui(self) -> None:
        if self.session.auth.is_locked():
            left = self.session.auth.format_remaining()
            self.status_var.set("Qulflangan")
            self._set_badge("QULFLANGAN", "danger")
            self._show_alert(f"Qulflangan: {left}  (Hikvision uslubi, 30 daqiqa)")
            self.pwd_entry.configure(state="disabled")
            self._set_primary_btn(False)
        else:
            if self.lock_var.get().startswith("Qulflangan"):
                self._hide_alert()
                if not self.busy:
                    self.pwd_entry.configure(state="normal")
                    self._set_primary_btn(True)

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
            self._show_alert(
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
                self._hide_alert()

    def _start_scan(self) -> None:
        if self.busy:
            return
        self.status_var.set("Qidirilmoqda")
        self._set_badge("QIDIRILMOQDA", "warn")
        self.device_var.set("Qurilma: —")
        self.state_var.set("Aniqlangan holat: —")
        try:
            self._set_busy(True)
        except Exception:
            self.busy = True
        threading.Thread(target=self._scan_worker, daemon=True).start()

    def _scan_worker(self) -> None:
        devices: list = []
        try:
            ip = self.ip_var.get().strip()
            devices = self.session.scan(ip_hint=ip or None)
        except Exception:
            devices = []
        self.root.after(0, lambda d=devices: self._scan_done(d))

    def _scan_done(self, devices: list) -> None:
        try:
            self._set_busy(False)
        except Exception:
            self.busy = False
        if self.session.auth.is_locked():
            self._refresh_lock_ui()
            return
        if not devices:
            hint = self.ip_var.get().strip()
            self.status_var.set("Qurilma topilmadi")
            self._set_badge("OFFLINE", "danger")
            if hint:
                self.device_var.set(f"Qurilma: {hint} javob bermadi")
            else:
                self.device_var.set("Qurilma: topilmadi — IP yozing (masalan 192.168.0.116)")
            self.state_var.set("Aniqlangan holat: —")
            return
        self._show_device()
        if devices[0].online:
            self.status_var.set("Online")
            self._set_badge("ONLINE", "ok")
        else:
            self.status_var.set("Qurilma topilmadi")
            self._set_badge("OFFLINE", "danger")

    def _on_reconnect(self) -> None:
        if self.busy or self.session.auth.is_locked():
            return
        tok = self.token_var.get().strip()
        if tok != (self.session.pairing_token() or ""):
            self.session.set_pairing_token(tok)
        if not self.session.has_credentials():
            self.status_var.set("Token kerak")
            self._set_badge("TOKEN", "warn")
            self._show_alert(
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
                self._set_badge("OFFLINE", "danger")
                self.device_var.set(f"Qurilma: {ip}")
                return
            self._show_device()
        elif not self.session.chosen:
            self.status_var.set("Qurilma topilmadi — IP yozing yoki Qidirish")
            return

        self._set_busy(True)
        self.status_var.set("Webdan parol olinmoqda...")
        self._set_badge("PAROL", "accent")
        threading.Thread(target=self._reconnect_prepare_worker, daemon=True).start()

    def _reconnect_prepare_worker(self) -> None:
        peek = self.session.peek_reconnect_password(self.pwd_var.get())
        self.root.after(0, lambda: self._reconnect_prepare_done(peek))

    def _reconnect_prepare_done(self, peek: dict) -> None:
        self._set_busy(False)
        pwd = str(peek.get("password") or "").strip()
        source = str(peek.get("source") or "")
        if pwd:
            self.pwd_var.set(pwd)
            src_label = {
                "local": "lokal recovery",
                "web": "Web vault",
                "manual": "qo‘lda",
            }.get(source, source or "—")
            self.status_var.set(f"Parol topildi ({src_label})")
            self._set_badge("PAROL OK", "ok")
            self._hide_alert()
        else:
            self.status_var.set("Parol topilmadi")
            self._set_badge("PAROL", "warn")
            self._show_alert(
                str(
                    peek.get("error")
                    or "Parol topilmadi — qo‘lda kiriting yoki to‘liq Ulash."
                )
            )
            if not self.pwd_var.get().strip():
                return

        host = self.ip_var.get().strip() or (
            self.session.chosen.host if self.session.chosen else "—"
        )
        confirm_msg = (
            "Tarmoqni qayta ulash — tasdiqlang.\n\n"
            f"IP: {host}\n"
            f"Parol manbai: {source or 'qo‘lda'}\n\n"
            "Parol o‘zgarmaydi, faqat tarmoq (IP + tunnel) yangilanadi.\n"
            "Yuzlar qayta yuklanmaydi.\n\n"
            "Davom etasizmi?"
        )
        if not messagebox.askokcancel("Tarmoqni qayta ulash", confirm_msg):
            return
        password = self.pwd_var.get().strip()
        if not password:
            self._show_alert("Parol kerak — qo‘lda kiriting yoki to‘liq Ulash.")
            return
        self._set_busy(True)
        self.status_var.set("Tarmoq yangilanmoqda...")
        self._set_badge("ULANMOQDA", "accent")
        threading.Thread(
            target=self._reconnect_worker, args=(password,), daemon=True
        ).start()

    def _reconnect_worker(self, password: str) -> None:
        def progress(msg: str) -> None:
            self.root.after(0, lambda m=msg: self.status_var.set(m[:120]))

        result = self.session.reconnect_network(
            password,
            progress,
            ip_hint=self.ip_var.get().strip() or None,
        )
        self.root.after(0, lambda: self._reconnect_done(result))

    def _reconnect_done(self, result: SubmitResult) -> None:
        self._set_busy(False)
        kind = result.kind
        if kind == "reconnected":
            self.pwd_var.set("")
            self.status_var.set("Tarmoq yangilandi")
            self._set_badge("YANGILANDI", "ok")
            self._hide_alert()
            host = (result.device or {}).get("host") or ""
            name = (result.device or {}).get("name") or ""
            self.device_var.set(f"Qurilma: {name}  {host}".strip())
            try:
                self.session.write_service_handoff()
                svc_note = " Service config yangilandi."
            except Exception:
                svc_note = ""
            self.note.configure(
                text=(
                    "Tarmoq yangilandi. Parol o‘zgarmadi, yuzlar saqlanadi. "
                    "Keyin Windows Service ishlayotganini tekshiring."
                    + svc_note
                )
            )
            messagebox.showinfo(
                "Tarmoq yangilandi",
                "IP va tunnel yangilandi.\n"
                "Admin parol o‘zgarmadi — yuzlarni qayta yuklash shart emas.",
            )
            return
        if kind == UNAUTHORIZED or kind == "empty":
            self.status_var.set(result.message or "Parol topilmadi")
            self._set_badge("PAROL", "danger")
            self._show_alert(
                result.message
                or "Parol topilmadi — qo‘lda kiriting yoki to‘liq Ulash."
            )
            return
        if kind == LOCKED:
            self.status_var.set("Qulflangan")
            self._refresh_lock_ui()
            if self._tick_job is None:
                self._tick_lock()
            return
        if kind == TIMEOUT:
            self.status_var.set("Tarmoq kutish vaqti")
            self._set_badge("TIMEOUT", "warn")
            self._show_alert(result.message)
            return
        if kind == OFFLINE:
            self.status_var.set("Qurilma onlayn emas")
            self._set_badge("OFFLINE", "danger")
            self._show_alert(result.message)
            return
        self.status_var.set(result.message or "Xato")
        self._set_badge("XATO", "danger")
        self._show_alert(result.message)

    def _on_ulash(self) -> None:
        if self.busy or self.session.auth.is_locked():
            return
        tok = self.token_var.get().strip()
        if tok != (self.session.pairing_token() or ""):
            self.session.set_pairing_token(tok)
        self._on_location_selected()
        if not (self.session.location_id or "").strip():
            self.status_var.set("Lokatsiya tanlanmagan")
            self._set_badge("LOKATSIYA", "warn")
            self._show_alert("Lokatsiya tanlanmagan. Ulashdan oldin lokatsiyani tanlang.")
            return
        if not self.session.has_credentials():
            self.status_var.set("Token kerak")
            self._set_badge("TOKEN", "warn")
            self._show_alert(
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
                self._set_badge("OFFLINE", "danger")
                self.device_var.set(f"Qurilma: {ip}")
                self.state_var.set("Aniqlangan holat: —")
                return
            self._show_device()
        elif not self.session.chosen:
            self.status_var.set("Qurilma topilmadi")
            return
        password = self.pwd_var.get()
        if not password.strip():
            self.status_var.set("Parol kerak")
            self._set_badge("PAROL", "warn")
            self._show_alert("Hozirgi admin parolini kiriting.")
            return
        # Operator confirms what they typed before rotate+send to server.
        try:
            from device_email import normalize_recovery_email

            recovery_email = normalize_recovery_email(
                str((self.session.cfg or {}).get("recoveryEmail") or "")
            )
        except Exception:
            recovery_email = "botirovanvar96@gmail.com"
        confirm_msg = (
            "Ulashdan oldin tasdiqlang.\n\n"
            f"IP: {self.ip_var.get().strip() or (self.session.chosen.host if self.session.chosen else '—')}\n"
            f"Lokatsiya: {self.location_var.get() or '—'}\n"
            f"Siz tergan admin parol: {password}\n"
            f"Tiklanish pochtasi: {recovery_email}\n\n"
            "Davom etganda ilova:\n"
            "1) terminalda YANGI parol o‘rnatadi\n"
            "2) tiklanish emailini moslashtiradi\n"
            "3) yangi parolni Web serverga yuboradi\n"
            "4) ulanishni mustahkamlaydi\n\n"
            "Davom etasizmi?"
        )
        if not messagebox.askokcancel("Parolni tasdiqlang", confirm_msg):
            return
        self._set_busy(True)
        self.status_var.set("Tekshirilmoqda...")
        self._set_badge("ULANMOQDA", "accent")
        threading.Thread(target=self._ulash_worker, args=(password,), daemon=True).start()

    def _ulash_worker(self, password: str) -> None:
        def progress(msg: str) -> None:
            self.root.after(0, lambda m=msg: self.status_var.set(m[:120]))

        state = (self.session.detected_state or {}).get("state")
        if state == "new":
            self.session.password = password or self.session.password or ""
            linked = self.session.link_to_cloud(progress)
            self.root.after(0, lambda: self._ulash_done(linked, clear_pwd=True, linked=True))
            return

        result = self.session.submit_password(password)
        if result.kind == OK:
            linked = self.session.link_to_cloud(progress)
            self.root.after(0, lambda: self._ulash_done(linked, clear_pwd=True, linked=True))
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
            self._set_badge("PAROL", "danger")
            self._show_alert("Parol noto‘g‘ri. Qayta kiriting (avtomatik qayta urinish yo‘q).")
        elif kind == LOCKED:
            self.status_var.set("Qulflangan")
            self._refresh_lock_ui()
            if self._tick_job is None:
                self._tick_lock()
        elif kind == TIMEOUT:
            self.status_var.set("Tarmoq kutish vaqti")
            self._set_badge("TIMEOUT", "warn")
            self._show_alert(result.message)
        elif kind == OFFLINE:
            self.status_var.set("Qurilma onlayn emas")
            self._set_badge("OFFLINE", "danger")
            self._show_alert(result.message)
        elif kind == "location":
            self.status_var.set("Lokatsiya tanlanmagan")
            self._set_badge("LOKATSIYA", "warn")
            self._show_alert(result.message)
        elif kind == "linked" or (linked and kind == "linked"):
            sealed = bool((result.device or {}).get("sealed"))
            needs_confirm = bool((result.device or {}).get("needsAdminConfirm"))
            self.status_var.set(
                "Web tasdiq kutilmoqda"
                if needs_confirm
                else ("Ulanish mustahkamlandi" if sealed else "Ulandi")
            )
            self._set_badge(
                "TASDIQ" if needs_confirm else "ULANDI",
                "warn" if needs_confirm else "ok",
            )
            self._hide_alert()
            host = (result.device or {}).get("host") or ""
            name = (result.device or {}).get("name") or ""
            self.device_var.set(f"Qurilma: {name}  {host}".strip())
            web = self.session.web_url
            try:
                self.session.write_service_handoff()
                svc_note = (
                    " Service: data\\service.json yozildi. "
                    "install-service.bat ni ADMIN qilib ishga tushiring (SERVICE.txt)."
                )
            except Exception:
                svc_note = " Oyna ochiq tursin (yoki SERVICE.txt)."
            extra = f" Web: {web}." if web else ""
            if needs_confirm:
                self._show_alert(
                    "Parol terminalga o‘rnatildi va serverga yuborildi. "
                    "Web → bildirishnoma / Устройства → «Подтвердить привязку»."
                )
                self.note.configure(
                    text=(
                        "Keyingi qadam: Webda tenant admin bildirishnomani ochib "
                        "parolni tekshirsin va «Подтвердить привязку» bossin. "
                        "Shundan keyin yuzlar va qurilma to‘liq sinxronlanadi."
                        + extra
                        + svc_note
                    )
                )
                messagebox.showinfo(
                    "Tasdiq kutilmoqda",
                    "Parol qurilmaga o‘rnatildi va Webga yuborildi.\n\n"
                    "Tenant admin Webdagi bildirishnomada (qo‘ng‘iroqcha) "
                    "yoki Устройства kartasida «Подтвердить привязку» ni bosishi kerak.\n"
                    "Tasdiqdan keyin yuzlar sinxroni avtomatik boshlanadi.",
                )
            else:
                seal_note = (
                    " Parol terminalda almashtirildi va Web serverda mustahkamlandi."
                    if sealed
                    else " Parol serverga yozildi."
                )
                self.note.configure(
                    text=(
                        "Ulandi. Qurilma boshqaruvi Webga topshirildi."
                        + seal_note
                        + " Yangi admin parolni Web → Устройства sahifasida "
                        "(Показать / Копировать) ko‘ring. "
                        "Keyin Webdan yuzlarni sinxronlang."
                        + extra
                        + svc_note
                    )
                )
                messagebox.showinfo(
                    "Ulandi",
                    "Yangi admin parol Web serverga yuborildi.\n"
                    "Uni Web → Устройства → qurilma kartasida "
                    "«Показать» / «Копировать» orqali ko‘rishingiz mumkin.",
                )
            self.pwd_var.set("")
            self.pwd_entry.configure(state="disabled")
            self._set_primary_btn(False)
        else:
            self.status_var.set(result.message or "Xato")
            self._set_badge("XATO", "danger")
            self._show_alert(result.message)

    def _show_saved_credential(self) -> None:
        data = None
        try:
            from credential_store import format_credential_for_display, read_device_credential

            data = read_device_credential(self.session.root)
            text = format_credential_for_display(data)
        except Exception as exc:
            text = f"O‘qib bo‘lmadi: {exc}"
        messagebox.showinfo("Saqlangan terminal paroli", text)
        if data and data.get("password"):
            self._show_alert(
                f"Tiklash paroli lokalda bor (host={data.get('host')}). "
                "Web vault bo‘sh bo‘lsa shu parolni saqlang."
            )

    def _apply_recovery_email_now(self) -> None:
        """Admin: set recovery email on currently selected device (no Ulash)."""
        if not self.session.chosen:
            self._show_alert("Avval qurilmani tanlang / toping.")
            return
        password = (self.pwd_var.get() or self.session.password or "").strip()
        if not password:
            try:
                from credential_store import read_device_credential

                cred = read_device_credential(self.session.root)
                if cred and cred.get("password"):
                    password = str(cred["password"]).strip()
            except Exception:
                password = ""
        if not password:
            self._show_alert("Admin parolini kiriting (yoki saqlangan recovery borligi kerak).")
            return
        try:
            from device_email import apply_recovery_email_from_config, normalize_recovery_email

            email = normalize_recovery_email(
                str((self.session.cfg or {}).get("recoveryEmail") or "")
            )
            if not messagebox.askokcancel(
                "Tiklanish pochtasi",
                f"Qurilma: {self.session.chosen.host}\n"
                f"Email: {email}\n\n"
                "O‘rnatilsinmi?",
            ):
                return
            self.status_var.set(f"Pochta o‘rnatilmoqda: {email}")
            res = apply_recovery_email_from_config(
                self.session.chosen.host,
                int(self.session.chosen.port or 80),
                (self.session.username or "admin").strip() or "admin",
                password,
                self.session.cfg if isinstance(self.session.cfg, dict) else {},
            )
            if res.get("ok"):
                messagebox.showinfo(
                    "Tiklanish pochtasi",
                    f"OK — {res.get('email') or email}\nVia: {res.get('via') or '—'}",
                )
                self.status_var.set(f"Pochta OK: {res.get('email') or email}")
            else:
                self._show_alert(str(res.get("message") or "Pochta o‘rnatilmadi")[:200])
        except Exception as exc:
            self._show_alert(str(exc)[:200])

    def _open_admin(self) -> None:
        bat = find_root() / "ADMIN-PAROL.bat"
        if not bat.is_file():
            self._show_alert("ADMIN-PAROL.bat topilmadi.")
            return
        flags = subprocess.CREATE_NEW_CONSOLE if sys.platform == "win32" else 0
        try:
            subprocess.Popen(
                ["cmd.exe", "/c", str(bat)] if sys.platform == "win32" else ["bash", str(bat)],
                cwd=str(bat.parent),
                creationflags=flags,
            )
        except OSError as exc:
            self._show_alert(str(exc)[:160])

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
    _set_app_user_model_id()
    _hide_console()
    root = tk.Tk()
    try:
        root.call("tk", "scaling", 1.15)
    except tk.TclError:
        pass
    OfficeLinkApp(root)
    root.mainloop()
