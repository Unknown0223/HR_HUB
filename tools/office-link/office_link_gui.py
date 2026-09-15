"""Tkinter GUI — Windows-style office link client (Russian UI)."""
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
from session import RECONNECT_STEPS, OfficeLinkSession, SubmitResult

TITLE = "HR HUB — подключение терминала"

_RECONNECT_STEP_LABELS = {
    "web": "Веб",
    "scan": "Сканер",
    "match": "Сопоставление",
    "auth": "Пароль",
    "link": "Связь",
}

_STATE_LABELS_RU = {
    "new": "Новое",
    "configured": "Есть администратор",
    "unknown": "Неизвестно",
}

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
    style.configure("Strip.TFrame", background=C["surface"])
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
    style.configure("App.TNotebook", background=C["bg"], borderwidth=0)
    style.configure(
        "App.TNotebook.Tab",
        font=("Segoe UI Semibold", 9),
        padding=(14, 8),
    )


class OfficeLinkApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.session = OfficeLinkSession()
        self.busy = False
        self._tick_job: str | None = None
        self._confirm_poll_job: str | None = None
        self._tunnel_poll_job: str | None = None
        self._tunnel_busy = False
        self._confirm_notified = False
        self._locations: list[dict] = []
        self._keep_tunnel_on_close = True
        self._last_link_device: dict = {}
        self._last_tunnel_url = ""
        self._build()
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self.root.after(200, self._bootstrap)
        self.root.after(1500, self._poll_tunnel_once)

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

    def _info_row(self, parent: ttk.Frame, label: str, var: tk.StringVar) -> None:
        row = ttk.Frame(parent, style="Card.TFrame")
        row.pack(fill=tk.X, pady=(0, 6))
        ttk.Label(row, text=label, style="Field.TLabel", width=16).pack(side=tk.LEFT)
        ttk.Label(row, textvariable=var, style="Body.TLabel", wraplength=360).pack(
            side=tk.LEFT, fill=tk.X, expand=True
        )

    def _scrollable(self, parent: ttk.Frame) -> ttk.Frame:
        host = ttk.Frame(parent, style="App.TFrame")
        host.pack(fill=tk.BOTH, expand=True)
        canvas = tk.Canvas(host, bg=C["bg"], highlightthickness=0, bd=0)
        scroll = ttk.Scrollbar(host, orient="vertical", command=canvas.yview)
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
        return frm

    def _build(self) -> None:
        self.root.title(TITLE)
        self.root.minsize(560, 680)
        self.root.geometry("600x760")
        self.root.configure(bg=C["bg"])
        _apply_style(self.root)
        self._set_icon()

        menubar = tk.Menu(self.root)
        admin_menu = tk.Menu(menubar, tearoff=0)
        admin_menu.add_command(
            label="Окно пароля администратора (ключ не показывается)",
            command=self._open_admin,
        )
        admin_menu.add_command(
            label="Показать сохранённый пароль терминала (восстановление)",
            command=self._show_saved_credential,
        )
        admin_menu.add_command(
            label="Установить почту восстановления (config)",
            command=self._apply_recovery_email_now,
        )
        menubar.add_cascade(label="Админ", menu=admin_menu)
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
            text="Привязка офисного Face ID к платформе",
            style="Subtitle.TLabel",
        ).pack(anchor="w", pady=(2, 0))
        try:
            from paths import bound_web_label, load_config

            bound = bound_web_label(load_config(self.session.root), self.session.root)
            if bound:
                ttk.Label(
                    head_inner,
                    text=f"Привязанный web: {bound}",
                    style="Subtitle.TLabel",
                ).pack(anchor="w", pady=(4, 0))
        except Exception:
            pass

        # Always-visible status strip: title + badge/dot + banner
        strip_outer = tk.Frame(shell, bg=C["border"], bd=0)
        strip_outer.pack(fill=tk.X, padx=12, pady=(12, 0))
        strip = tk.Frame(strip_outer, bg=C["surface"], bd=0)
        strip.pack(fill=tk.X, padx=1, pady=1)
        strip_inner = ttk.Frame(strip, style="Strip.TFrame")
        strip_inner.pack(fill=tk.X, padx=14, pady=12)

        status_row = ttk.Frame(strip_inner, style="Strip.TFrame")
        status_row.pack(fill=tk.X)
        self.status_dot = tk.Canvas(
            status_row, width=12, height=12, bg=C["surface"], highlightthickness=0
        )
        self.status_dot.pack(side=tk.LEFT, padx=(0, 8), pady=(6, 0))
        self._status_dot_id = self.status_dot.create_oval(
            1, 1, 11, 11, fill=C["warn"], outline=C["warn"]
        )
        self.status_var = tk.StringVar(value="Поиск…")
        self.status_lbl = ttk.Label(
            status_row, textvariable=self.status_var, style="Status.TLabel"
        )
        self.status_lbl.pack(side=tk.LEFT)
        self.status_badge = tk.Label(
            status_row,
            text="ОЖИДАНИЕ",
            bg=C["warn_bg"],
            fg=C["warn"],
            font=("Segoe UI Semibold", 8),
            padx=8,
            pady=2,
        )
        self.status_badge.pack(side=tk.LEFT, padx=(12, 0), pady=(4, 0))

        self.device_var = tk.StringVar(value="Устройство: —")
        ttk.Label(strip_inner, textvariable=self.device_var, style="Body.TLabel").pack(
            anchor="w", pady=(6, 0)
        )
        self.state_var = tk.StringVar(value="Состояние: —")
        ttk.Label(strip_inner, textvariable=self.state_var, style="Muted.TLabel").pack(
            anchor="w", pady=(2, 0)
        )

        self.banner_frame = tk.Frame(strip_inner, bg=C["warn_bg"], bd=0)
        self.lock_var = tk.StringVar(value="")
        self.lock_lbl = tk.Label(
            self.banner_frame,
            textvariable=self.lock_var,
            bg=C["warn_bg"],
            fg=C["warn"],
            font=("Segoe UI Semibold", 9),
            wraplength=520,
            justify="left",
            anchor="w",
        )
        self.lock_lbl.pack(anchor="w", padx=10, pady=8, fill=tk.X)
        self.alert_frame = self.banner_frame  # compatibility alias

        nb = ttk.Notebook(shell, style="App.TNotebook")
        nb.pack(fill=tk.BOTH, expand=True, padx=8, pady=(8, 8))
        self.notebook = nb
        nb.bind("<<NotebookTabChanged>>", self._on_tab_changed)

        tab_connect = ttk.Frame(nb, style="App.TFrame")
        tab_reconnect = ttk.Frame(nb, style="App.TFrame")
        tab_tunnel = ttk.Frame(nb, style="App.TFrame")
        tab_device = ttk.Frame(nb, style="App.TFrame")
        nb.add(tab_connect, text="Новое подключение")
        nb.add(tab_reconnect, text="Восстановление сети")
        nb.add(tab_tunnel, text="Туннель")
        nb.add(tab_device, text="Устройство")

        self._build_connect_tab(tab_connect)
        self._build_reconnect_tab(tab_reconnect)
        self._build_tunnel_tab(tab_tunnel)
        self._build_device_tab(tab_device)

        if not self.session.has_credentials():
            self._show_alert(
                "Нужен pairing-токен или ключ администратора. "
                "Web → Связь с офисом или ADMIN-PAROL.bat.",
                kind="warn",
            )
        else:
            self._hide_alert()

    def _build_connect_tab(self, parent: ttk.Frame) -> None:
        frm = self._scrollable(parent)

        conn = self._card(frm, "Параметры подключения")
        try:
            from paths import bound_web_label, load_config

            cfg = load_config(self.session.root)
            label = bound_web_label(cfg, self.session.root)
            if label:
                ttk.Label(
                    conn,
                    text=(
                        "Это приложение привязано к указанному web. "
                        "Для другого клиента скачайте новый пакет с того же web."
                    ),
                    style="Muted.TLabel",
                    wraplength=520,
                ).pack(anchor="w", pady=(0, 8))
                ttk.Label(conn, text=label, style="Body.TLabel", wraplength=520).pack(
                    anchor="w", pady=(0, 8)
                )
        except Exception:
            pass

        row = self._field_row(conn, "Pairing-токен")
        self.token_var = tk.StringVar(value=read_pairing_token(self.session.root))
        # ASCII mask — Unicode «•» on some Windows/Tk builds breaks paste/input.
        self.token_entry = ttk.Entry(
            row, textvariable=self.token_var, show="*", style="App.TEntry"
        )
        self.token_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self._enable_entry_clipboard(self.token_entry, self.token_var, replace_all=True)
        self.token_paste_btn = ttk.Button(
            row,
            text="Вставить",
            style="Secondary.TButton",
            command=lambda: self._paste_into_entry(
                self.token_entry, self.token_var, replace_all=True
            ),
        )
        self.token_paste_btn.pack(side=tk.LEFT, padx=(8, 0))
        self.token_btn = ttk.Button(
            row, text="Сохранить", style="Secondary.TButton", command=self._save_token
        )
        self.token_btn.pack(side=tk.LEFT, padx=(8, 0))

        row = self._field_row(conn, "IP-адрес (необязательно)")
        self.ip_var = tk.StringVar()
        self.ip_entry = ttk.Entry(row, textvariable=self.ip_var, style="App.TEntry")
        self.ip_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self._enable_entry_clipboard(self.ip_entry, self.ip_var, replace_all=False)
        self.rescan_btn = ttk.Button(
            row, text="Найти", style="Secondary.TButton", command=self._start_scan
        )
        self.rescan_btn.pack(side=tk.LEFT, padx=(8, 0))

        row = self._field_row(conn, "Локация")
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
            row, text="Обновить", style="Secondary.TButton", command=self._load_locations
        )
        self.loc_refresh_btn.pack(side=tk.LEFT, padx=(8, 0))

        row = self._field_row(conn, "Текущий пароль администратора (один раз)")
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
            text="Показать",
            style="Secondary.TButton",
            command=self._toggle_pwd_visibility,
            width=10,
        )
        self.pwd_toggle_btn.pack(side=tk.LEFT, padx=(8, 0))

        self.btn_row = ttk.Frame(conn, style="Card.TFrame")
        self.btn_row.pack(anchor="e", pady=(4, 0))
        self.btn = tk.Button(
            self.btn_row,
            text="Подключить",
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

        hint_wrap = ttk.Frame(frm, style="App.TFrame")
        hint_wrap.pack(fill=tk.X, padx=16, pady=(0, 16))
        hint_outer = tk.Frame(hint_wrap, bg=C["accent"], bd=0)
        hint_outer.pack(fill=tk.X)
        hint = tk.Frame(hint_outer, bg=C["accent_soft"], bd=0)
        hint.pack(fill=tk.X, padx=(3, 0))
        self.note = ttk.Label(
            hint,
            text=(
                "В Web → «Связь с офисом» скопируйте pairing-токен. "
                "Здесь Ctrl+V / Shift+Insert или «Вставить», затем «Сохранить». "
                "Первое подключение: «Подключить» — установит новый пароль. "
                "Если сменились Wi‑Fi / IP: вкладка «Восстановление сети». "
                "Если туннель упал: вкладка «Туннель» — автовосстановление "
                "или «Восстановить туннель»."
            ),
            style="Hint.TLabel",
            wraplength=520,
            justify="left",
        )
        self.note.pack(anchor="w", padx=14, pady=12, fill=tk.X)

    def _build_reconnect_tab(self, parent: ttk.Frame) -> None:
        frm = self._scrollable(parent)
        body = self._card(frm, "Восстановление сети")
        ttk.Label(
            body,
            text=(
                "Используются токен, IP и пароль с вкладки «Новое подключение». "
                "Пароль администратора не меняется — обновляется только сетевая привязка."
            ),
            style="Muted.TLabel",
            wraplength=520,
        ).pack(anchor="w", pady=(0, 10))

        self.reconnect_steps_frame = tk.Frame(body, bg=C["surface"], bd=0)
        self.reconnect_steps_frame.pack(fill=tk.X, pady=(0, 0))
        self._reconnect_step_vars: dict[str, tk.StringVar] = {}
        self._reconnect_step_labels: dict[str, tk.Label] = {}
        steps_row = tk.Frame(self.reconnect_steps_frame, bg=C["surface"])
        steps_row.pack(fill=tk.X)
        for sid in RECONNECT_STEPS:
            var = tk.StringVar(value=_RECONNECT_STEP_LABELS.get(sid, sid))
            self._reconnect_step_vars[sid] = var
            lbl = tk.Label(
                steps_row,
                textvariable=var,
                bg=C["border"],
                fg=C["muted"],
                font=("Segoe UI Semibold", 8),
                padx=8,
                pady=4,
            )
            lbl.pack(side=tk.LEFT, padx=(0, 4))
            self._reconnect_step_labels[sid] = lbl
        self.reconnect_detail_var = tk.StringVar(value="")
        ttk.Label(
            self.reconnect_steps_frame,
            textvariable=self.reconnect_detail_var,
            style="Muted.TLabel",
            wraplength=500,
        ).pack(anchor="w", pady=(8, 0))

        btn_row = ttk.Frame(body, style="Card.TFrame")
        btn_row.pack(anchor="e", pady=(14, 0))
        self.reconnect_btn = tk.Button(
            btn_row,
            text="Восстановить сеть",
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
        self.reconnect_btn.pack(side=tk.LEFT)

        hint_wrap = ttk.Frame(frm, style="App.TFrame")
        hint_wrap.pack(fill=tk.X, padx=16, pady=(0, 16))
        hint_outer = tk.Frame(hint_wrap, bg=C["accent"], bd=0)
        hint_outer.pack(fill=tk.X)
        hint = tk.Frame(hint_outer, bg=C["accent_soft"], bd=0)
        hint.pack(fill=tk.X, padx=(3, 0))
        ttk.Label(
            hint,
            text=(
                "Шаги: Веб → Сканер → Сопоставление → Пароль → Связь. "
                "При смене IP сервер обновит адрес; лица и пароль сохраняются."
            ),
            style="Hint.TLabel",
            wraplength=520,
            justify="left",
        ).pack(anchor="w", padx=14, pady=12, fill=tk.X)

    def _build_tunnel_tab(self, parent: ttk.Frame) -> None:
        frm = self._scrollable(parent)
        tun = self._card(frm, "Интернет-туннель (GW)")
        ind = tk.Frame(tun, bg=C["surface"])
        ind.pack(fill=tk.X, pady=(0, 8))
        self._tun_ind_vars: dict[str, tk.StringVar] = {}
        self._tun_ind_dots: dict[str, tuple[tk.Canvas, int]] = {}
        for key, title in (
            ("gw_http", "Шлюз :8800"),
            ("tun_http", "Туннель URL"),
            ("gw_proc", "Процесс GW"),
            ("tun_proc", "Процесс tunnel"),
        ):
            cell = tk.Frame(ind, bg=C["surface"])
            cell.pack(side=tk.LEFT, padx=(0, 14))
            row = tk.Frame(cell, bg=C["surface"])
            row.pack(anchor="w")
            canvas = tk.Canvas(
                row, width=10, height=10, bg=C["surface"], highlightthickness=0
            )
            canvas.pack(side=tk.LEFT, padx=(0, 4))
            oid = canvas.create_oval(1, 1, 9, 9, fill=C["muted"], outline=C["muted"])
            self._tun_ind_dots[key] = (canvas, oid)
            var = tk.StringVar(value=f"{title}: —")
            self._tun_ind_vars[key] = var
            tk.Label(
                row,
                textvariable=var,
                bg=C["surface"],
                fg=C["text"],
                font=("Segoe UI", 9),
            ).pack(side=tk.LEFT)

        self.tunnel_status_var = tk.StringVar(value="Проверка…")
        ttk.Label(
            tun, textvariable=self.tunnel_status_var, style="Body.TLabel", wraplength=500
        ).pack(anchor="w")
        self.tunnel_url_var = tk.StringVar(value="URL: —")
        ttk.Label(
            tun, textvariable=self.tunnel_url_var, style="Muted.TLabel", wraplength=500
        ).pack(anchor="w", pady=(4, 0))
        self.tunnel_auto_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            tun,
            text="Автовосстановление (если туннель упал — поднять снова)",
            variable=self.tunnel_auto_var,
        ).pack(anchor="w", pady=(8, 4))
        tun_btns = ttk.Frame(tun, style="Card.TFrame")
        tun_btns.pack(fill=tk.X, pady=(4, 0))
        self.tunnel_restore_btn = ttk.Button(
            tun_btns,
            text="Восстановить туннель",
            style="Secondary.TButton",
            command=self._on_restore_tunnel,
        )
        self.tunnel_restore_btn.pack(side=tk.LEFT)
        ttk.Label(
            tun,
            text=(
                "Для синхронизации лиц с Web на ПК нужен постоянный GW+туннель. "
                "Быстрый Cloudflare-туннель часто обновляет URL — автовосстановление "
                "анонсирует новый URL на платформу. При закрытии окна "
                "фоновый процесс сохраняет туннель."
            ),
            style="Muted.TLabel",
            wraplength=500,
        ).pack(anchor="w", pady=(8, 0))

    def _build_device_tab(self, parent: ttk.Frame) -> None:
        frm = self._scrollable(parent)
        info = self._card(frm, "Привязанное устройство")
        self.dev_online_var = tk.StringVar(value="—")
        self.dev_name_var = tk.StringVar(value="—")
        self.dev_host_var = tk.StringVar(value="—")
        self.dev_ip_var = tk.StringVar(value="—")
        self.dev_port_var = tk.StringVar(value="—")
        self.dev_model_var = tk.StringVar(value="—")
        self.dev_serial_var = tk.StringVar(value="—")
        self.dev_id_var = tk.StringVar(value="—")
        self.dev_location_var = tk.StringVar(value="—")
        self.dev_state_var = tk.StringVar(value="—")
        self.dev_sealed_var = tk.StringVar(value="—")
        self.dev_phase_var = tk.StringVar(value="—")
        self.dev_link_key_var = tk.StringVar(value="—")
        self.dev_tunnel_var = tk.StringVar(value="—")
        self.dev_gw_var = tk.StringVar(value="—")
        self._info_row(info, "В сети", self.dev_online_var)
        self._info_row(info, "Имя", self.dev_name_var)
        self._info_row(info, "Хост", self.dev_host_var)
        self._info_row(info, "IP", self.dev_ip_var)
        self._info_row(info, "Порт", self.dev_port_var)
        self._info_row(info, "Модель", self.dev_model_var)
        self._info_row(info, "Серийный №", self.dev_serial_var)
        self._info_row(info, "ID устройства", self.dev_id_var)
        self._info_row(info, "Локация", self.dev_location_var)
        self._info_row(info, "Состояние", self.dev_state_var)
        self._info_row(info, "Печать / подтверждение", self.dev_sealed_var)
        self._info_row(info, "Фаза / учётные данные", self.dev_phase_var)
        self._info_row(info, "Ключ связи (link.key)", self.dev_link_key_var)
        self._info_row(info, "Туннель", self.dev_tunnel_var)
        self._info_row(info, "Локальный шлюз", self.dev_gw_var)
        ttk.Button(
            info,
            text="Обновить сведения",
            style="Secondary.TButton",
            command=self._refresh_device_tab,
        ).pack(anchor="w", pady=(8, 0))
        ttk.Label(
            info,
            text=(
                "Здесь — снимок привязки: LAN-доступность, модель/серийный номер, "
                "статус подтверждения в Web и туннель. Если «В сети» = нет, "
                "проверьте IP и одну подсеть с ПК."
            ),
            style="Muted.TLabel",
            wraplength=500,
        ).pack(anchor="w", pady=(10, 0))

    def _on_tab_changed(self, _event=None) -> None:
        try:
            tab = self.notebook.select()
            text = self.notebook.tab(tab, "text")
        except tk.TclError:
            return
        if text == "Устройство":
            self._refresh_device_tab()

    def _refresh_device_tab(self) -> None:
        d = self.session.chosen
        link = self._last_link_device or {}
        cred: dict = {}
        try:
            from credential_store import read_device_credential

            cred = read_device_credential(self.session.root) or {}
        except Exception:
            cred = {}

        name = (
            str(link.get("name") or "").strip()
            or (d.hint_name if d else "")
            or str(cred.get("name") or "").strip()
            or "—"
        )
        host = (
            str(link.get("host") or "").strip()
            or (d.host if d else "")
            or str(cred.get("host") or "").strip()
            or "—"
        )
        ip = self.ip_var.get().strip() or host
        port = (
            str(link.get("port") or "").strip()
            or (str(d.port) if d else "")
            or str(cred.get("port") or "").strip()
            or "—"
        )
        model = str(link.get("model") or cred.get("model") or "").strip() or "—"
        serial = (
            str(link.get("serialNumber") or cred.get("serialNumber") or "").strip()
            or "—"
        )
        device_id = (
            str(link.get("id") or link.get("deviceId") or cred.get("deviceId") or "").strip()
            or "—"
        )
        loc_name = ""
        try:
            loc_name = str(self.location_var.get() or "").strip()
        except Exception:
            loc_name = ""
        if not loc_name:
            loc_name = str(link.get("locationName") or cred.get("locationName") or "").strip()
        if d:
            label = self._state_label_ru()
        else:
            label = "—"
        sealed = link.get("sealed")
        needs = link.get("needsAdminConfirm")
        if sealed is True:
            seal_txt = "Запечатано"
        elif needs:
            seal_txt = "Ожидает подтверждения в Web"
        elif sealed is False:
            seal_txt = "Не запечатано"
        elif cred:
            seal_txt = f"Локальные учётные данные ({cred.get('phase') or 'сохранено'})"
        else:
            seal_txt = "Нет данных о привязке"
        phase = str(cred.get("phase") or link.get("phase") or "").strip() or "—"
        try:
            from paths import read_link_key

            has_key = bool(read_link_key(self.session.root))
        except Exception:
            has_key = False
        link_key_txt = "Есть" if has_key else "Нет — сначала «Подключить»"
        tun = self._last_tunnel_url or ""
        try:
            raw = self.tunnel_url_var.get()
            if raw.startswith("URL: "):
                cand = raw[5:].strip()
                if cand and cand != "—":
                    tun = cand
        except Exception:
            pass
        short = tun if len(tun) < 64 else tun[:28] + "…" + tun[-20:]

        self.dev_online_var.set("Проверка…")
        self.dev_name_var.set(name or "—")
        self.dev_host_var.set(host or "—")
        self.dev_ip_var.set(ip or "—")
        self.dev_port_var.set(port or "—")
        self.dev_model_var.set(model)
        self.dev_serial_var.set(serial)
        self.dev_id_var.set(device_id)
        self.dev_location_var.set(loc_name or "—")
        self.dev_state_var.set(label)
        self.dev_sealed_var.set(seal_txt)
        self.dev_phase_var.set(phase)
        self.dev_link_key_var.set(link_key_txt)
        self.dev_tunnel_var.set(short or "—")
        self.dev_gw_var.set("Проверка…")

        chosen = d

        def work() -> None:
            online_txt = "—"
            if chosen and host and host != "—":
                try:
                    from discovery import probe_online

                    probe = probe_online(chosen.host, chosen.port)
                    online_txt = "Да" if probe.online else "Нет"
                except Exception:
                    online_txt = "Проверка не удалась"
            elif host and host != "—":
                online_txt = "Не проверено"
            gw_txt = "—"
            try:
                health = self.session.tunnel_health()
                gw_ok = bool(getattr(health, "gw_http", False))
                tun_ok = bool(getattr(health, "ok", False))
                gw_txt = (
                    f"{'OK' if gw_ok else 'Нет'} · "
                    f"туннель {'OK' if tun_ok else 'проблема'}"
                )
            except Exception:
                gw_txt = "Не удалось проверить"
            self.root.after(
                0,
                lambda: (
                    self.dev_online_var.set(online_txt),
                    self.dev_gw_var.set(gw_txt),
                ),
            )

        threading.Thread(target=work, daemon=True).start()

    def _state_label_ru(self) -> str:
        state = str((self.session.detected_state or {}).get("state") or "")
        if not state:
            return "—"
        return _STATE_LABELS_RU.get(state, state)

    def _show_alert(self, text: str, kind: str = "danger") -> None:
        colors = {
            "ok": (C["ok_bg"], C["ok"]),
            "warn": (C["warn_bg"], C["warn"]),
            "danger": (C["danger_bg"], C["danger"]),
            "accent": (C["accent_soft"], C["accent"]),
        }
        bg, fg = colors.get(kind, colors["danger"])
        self.lock_var.set(text)
        try:
            self.banner_frame.configure(bg=bg)
            self.lock_lbl.configure(bg=bg, fg=fg)
        except tk.TclError:
            pass
        if not self.banner_frame.winfo_ismapped():
            self.banner_frame.pack(fill=tk.X, pady=(10, 0))

    def _hide_alert(self) -> None:
        self.lock_var.set("")
        if self.banner_frame.winfo_ismapped():
            self.banner_frame.pack_forget()

    def _set_badge(self, text: str, kind: str = "warn") -> None:
        colors = {
            "ok": (C["ok_bg"], C["ok"], C["ok"]),
            "warn": (C["warn_bg"], C["warn"], C["warn"]),
            "danger": (C["danger_bg"], C["danger"], C["danger"]),
            "accent": (C["accent_soft"], C["accent"], C["accent"]),
        }
        bg, fg, dot = colors.get(kind, colors["warn"])
        self.status_badge.configure(text=text, bg=bg, fg=fg)
        try:
            self.status_dot.itemconfigure(self._status_dot_id, fill=dot, outline=dot)
        except tk.TclError:
            pass

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
            self._show_alert(
                "Буфер пуст — сначала скопируйте токен из Web (Ctrl+C).",
                kind="warn",
            )
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
        if self.lock_var.get().startswith("Буфер"):
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
            label="Вставить (Ctrl+V)",
            command=lambda: self._paste_into_entry(entry, var, replace_all=replace_all),
        )
        menu.add_command(label="Выделить всё", command=lambda: _select_all())
        menu.add_command(label="Очистить", command=lambda: _clear())

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
            self._show_alert("Токен удалён.", kind="warn")
            if not self.session.has_link_key():
                self._show_alert(
                    "Нужен pairing-токен или ключ администратора. "
                    "Web → Связь с офисом или ADMIN-PAROL.bat.",
                    kind="warn",
                )
            return
        self._show_alert("Токен сохранён. Привязка сессии…", kind="ok")
        threading.Thread(target=self._bind_pairing_worker, daemon=True).start()

    def _bind_pairing_worker(self) -> None:
        ok, msg = self.session.bind_pairing_session()

        def done() -> None:
            if ok:
                self._show_alert("Сессия pairing привязана.", kind="ok")
                self._load_locations()
                self._maybe_resume_confirm_poll()
            else:
                self._show_alert(msg[:200] if msg else "Ошибка pairing", kind="danger")

        self.root.after(0, done)

    def _maybe_resume_confirm_poll(self) -> None:
        """If Ulash already waiting for Web confirm, resume poll after restart."""
        if not (self.session.provision_session_id or "").strip():
            return
        if self._confirm_notified or self._confirm_poll_job is not None:
            return

        def work() -> None:
            ok, info, _msg = self.session.fetch_provision_status()
            self.root.after(0, lambda: self._resume_confirm_from_status(ok, info))

        threading.Thread(target=work, daemon=True).start()

    def _resume_confirm_from_status(self, ok: bool, info: dict) -> None:
        if not ok or not isinstance(info, dict):
            return
        if info.get("sealed") or (
            info.get("status") == "linked" and not info.get("pendingAdminConfirm")
        ):
            # Already confirmed while app was closed — show once.
            self._confirm_poll_done(True, info, "OK")
            return
        if info.get("pendingAdminConfirm") or info.get("step") == "awaiting_admin_confirm":
            self.status_var.set("Ожидание подтверждения в Web")
            self._set_badge("ПОДТВЕРЖДЕНИЕ", "warn")
            self._show_alert(
                "Web → Устройства → «Подтвердить привязку». "
                "Приложение ожидает подтверждение…",
                kind="warn",
            )
            self._start_confirm_poll()

    def _load_locations(self) -> None:
        key = read_link_key(self.session.root)
        pairing = self.session.pairing_token()
        if not key and not pairing:
            self.location_combo["values"] = []
            self.location_var.set("")
            self._show_alert(
                "Сначала сохраните pairing-токен — затем загрузятся локации.",
                kind="warn",
            )
            return

        self._show_alert("Загрузка локаций…", kind="accent")

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
            err_detail = "Сетевая ошибка (не удалось подключиться к API)"
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
            self._show_alert(f"Локации: {len(labels)}. Выберите из списка.", kind="ok")
            self.root.after(
                1800,
                lambda: self._hide_alert()
                if "Локации:" in self.lock_var.get()
                else None,
            )
        else:
            self.location_var.set("")
            self.session.set_location_id(None)
            if not (200 <= code < 300):
                self._show_alert(
                    "Локации не загружены: "
                    + (err_detail or "проверьте токен / API. Нажмите «Сохранить» снова."),
                    kind="danger",
                )
            else:
                self._show_alert(
                    "Локаций нет. Создайте в Web → Устройства → Локации, "
                    "затем снова сохраните токен.",
                    kind="warn",
                )

    def _toggle_pwd_visibility(self) -> None:
        self._pwd_visible = not getattr(self, "_pwd_visible", False)
        self.pwd_entry.configure(show="" if self._pwd_visible else "*")
        try:
            self.pwd_toggle_btn.configure(
                text="Скрыть" if self._pwd_visible else "Показать"
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
            self.status_var.set("Заблокировано")
            self._set_badge("БЛОКИРОВКА", "danger")
            self._show_alert(
                f"Заблокировано: {left}  (приложение, не терминал). "
                "Меню не нужно — перезапустите окно или подождите.",
                kind="danger",
            )
            self.pwd_entry.configure(state="disabled")
            self._set_primary_btn(False)
        else:
            if self.lock_var.get().startswith("Заблокировано"):
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
            self.device_var.set("Устройство: не найдено")
            self.state_var.set("Состояние: —")
            self._refresh_device_tab()
            return
        name = d.hint_name or "Hikvision"
        self.device_var.set(f"Устройство: {name}  {d.host}")
        if not self.ip_var.get().strip():
            self.ip_var.set(d.host)
        label = self._state_label_ru()
        self.state_var.set(f"Состояние: {label}")
        if (self.session.detected_state or {}).get("state") == "new":
            self._show_alert(
                "Новое устройство: при нажатии «Подключить» платформа попытается "
                "сама задать пароль и активировать. Если не получится — сначала "
                "задайте пароль администратора на терминале, затем подключите "
                "как устройство с администратором.",
                kind="warn",
            )
            self.pwd_var.set("")
            self.pwd_entry.configure(state="disabled")
        else:
            if str(self.pwd_entry.cget("state")) == "disabled" and not self.session.auth.is_locked():
                self.pwd_entry.configure(state="normal")
            if self.lock_var.get().startswith("Новое устройство:"):
                self._hide_alert()
        self._refresh_device_tab()

    def _start_scan(self) -> None:
        if self.busy:
            return
        self.status_var.set("Поиск…")
        self._set_badge("ПОИСК", "warn")
        self.device_var.set("Устройство: —")
        self.state_var.set("Состояние: —")
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
            self.status_var.set("Устройство не найдено")
            self._set_badge("OFFLINE", "danger")
            if hint:
                self.device_var.set(f"Устройство: {hint} не отвечает")
                self._show_alert(
                    f"Устройство по адресу {hint} не отвечает.",
                    kind="danger",
                )
            else:
                self.device_var.set(
                    "Устройство: не найдено — укажите IP (например 192.168.0.116)"
                )
                self._show_alert(
                    "Устройство не найдено. Укажите IP и нажмите «Найти».",
                    kind="danger",
                )
            self.state_var.set("Состояние: —")
            return
        self._show_device()
        if devices[0].online:
            self.status_var.set("В сети")
            self._set_badge("ONLINE", "ok")
            self._show_alert("Устройство найдено и доступно в сети.", kind="ok")
        else:
            self.status_var.set("Устройство не найдено")
            self._set_badge("OFFLINE", "danger")
            self._show_alert("Устройство обнаружено, но не в сети.", kind="danger")

    def _reset_reconnect_steps(self) -> None:
        self.reconnect_detail_var.set("")
        for sid in RECONNECT_STEPS:
            self._set_reconnect_step(sid, "pending")

    def _show_reconnect_steps(self, show: bool = True) -> None:
        # Steps live permanently on the reconnect tab; keep API for callers.
        try:
            if show:
                self.reconnect_steps_frame.pack(fill=tk.X, pady=(0, 0))
            else:
                pass
        except tk.TclError:
            pass

    def _set_reconnect_step(self, step_id: str, state: str, detail: str = "") -> None:
        lbl = self._reconnect_step_labels.get(step_id)
        var = self._reconnect_step_vars.get(step_id)
        if not lbl or not var:
            return
        base = _RECONNECT_STEP_LABELS.get(step_id, step_id)
        mark = {
            "pending": "○",
            "active": "●",
            "done": "✓",
            "fail": "✗",
            "skip": "–",
        }.get(state, "○")
        var.set(f"{mark} {base}")
        colors = {
            "pending": (C["border"], C["muted"]),
            "active": (C["accent_soft"], C["accent"]),
            "done": (C["ok_bg"], C["ok"]),
            "fail": (C["danger_bg"], C["danger"]),
            "skip": (C["border"], C["muted"]),
        }
        bg, fg = colors.get(state, (C["border"], C["muted"]))
        try:
            lbl.configure(bg=bg, fg=fg)
        except tk.TclError:
            pass
        if detail:
            self.reconnect_detail_var.set(detail[:180])

    def _on_reconnect_step(self, step_id: str, state: str, detail: str = "") -> None:
        self.root.after(
            0, lambda: self._set_reconnect_step(step_id, state, detail)
        )

    def _on_reconnect(self) -> None:
        if self.busy or self.session.auth.is_locked():
            return
        tok = self.token_var.get().strip()
        if tok != (self.session.pairing_token() or ""):
            self.session.set_pairing_token(tok)
        if not self.session.has_credentials():
            self.status_var.set("Нужен токен")
            self._set_badge("ТОКЕН", "warn")
            self._show_alert(
                "Нужен pairing-токен или ключ администратора. "
                "Web → Связь с офисом или ADMIN-PAROL.bat.",
                kind="warn",
            )
            return

        ip = self.ip_var.get().strip()
        if ip:
            from discovery import valid_ip

            if not valid_ip(ip):
                self.status_var.set("Некорректный IP-адрес.")
                self._set_badge("IP", "warn")
                self._show_alert("Некорректный IP-адрес.", kind="warn")
                return

        self._show_reconnect_steps(True)
        self._reset_reconnect_steps()
        self._set_busy(True)
        self.status_var.set("Автоматическое переподключение…")
        self._set_badge("СКАНЕР", "accent")
        self._hide_alert()
        password = self.pwd_var.get().strip()
        threading.Thread(
            target=self._reconnect_auto_worker,
            args=(password, ip or None),
            daemon=True,
        ).start()

    def _reconnect_auto_worker(self, password: str, ip_hint: str | None) -> None:
        def on_status(msg: str) -> None:
            self.root.after(0, lambda m=msg: self.status_var.set(m[:120]))

        result = self.session.auto_reconnect_network(
            password,
            on_status=on_status,
            on_step=self._on_reconnect_step,
            ip_hint=ip_hint,
        )
        self.root.after(0, lambda: self._reconnect_done(result))

    def _reconnect_done(self, result: SubmitResult) -> None:
        self._set_busy(False)
        kind = result.kind
        if kind == "reconnected":
            self.pwd_var.set("")
            host = (result.device or {}).get("host") or ""
            name = (result.device or {}).get("name") or ""
            serial = (result.device or {}).get("serialNumber") or ""
            changed = bool((result.device or {}).get("hostChanged"))
            self._last_link_device = dict(result.device or {})
            self.status_var.set("Сеть обновлена")
            self._set_badge("ОБНОВЛЕНО", "ok")
            self._show_alert("Сеть успешно обновлена.", kind="ok")
            self.device_var.set(f"Устройство: {name}  {host}".strip())
            if host:
                self.ip_var.set(host)
            self.state_var.set(
                "Состояние: сеть синхронизирована"
                + (f" · S/N {serial}" if serial else "")
            )
            try:
                self.session.write_service_handoff()
                svc_note = " Конфиг службы обновлён."
            except Exception:
                svc_note = ""
            self.note.configure(
                text=(
                    "Сеть обновлена. Пароль не менялся, лица сохраняются. "
                    "Проверьте, что работает Windows Service."
                    + svc_note
                )
            )
            self.reconnect_detail_var.set(
                ("IP изменился — " if changed else "Туннель/GW обновлён — ")
                + f"{host}"
            )
            self._refresh_device_tab()
            messagebox.showinfo(
                "Сеть обновлена",
                "LAN-сканер + сверка с Web — OK.\n"
                f"Хост: {host}\n"
                + ("IP изменился — сервер обновлён.\n" if changed else "")
                + "Пароль администратора не менялся — перезагрузка лиц не нужна.\n"
                "Теперь Web → Синхронизировать должен работать (DEVICE_GW tunnel).",
            )
            return
        if kind == UNAUTHORIZED or kind == "empty":
            self.status_var.set(result.message or "Пароль не найден")
            self._set_badge("ПАРОЛЬ", "danger")
            self._show_alert(
                result.message
                or "Пароль не найден — введите вручную или выполните полное «Подключить».",
                kind="danger",
            )
            return
        if kind == LOCKED:
            self.status_var.set("Заблокировано")
            self._refresh_lock_ui()
            if self._tick_job is None:
                self._tick_lock()
            return
        if kind == TIMEOUT:
            self.status_var.set("Таймаут сети")
            self._set_badge("TIMEOUT", "warn")
            self._show_alert(result.message, kind="warn")
            return
        if kind == OFFLINE:
            self.status_var.set("Устройство не в сети")
            self._set_badge("OFFLINE", "danger")
            self._show_alert(result.message, kind="danger")
            return
        if kind == "no_key":
            self.status_var.set("Нужен токен")
            self._set_badge("ТОКЕН", "warn")
            self._show_alert(result.message, kind="warn")
            return
        self.status_var.set(result.message or "Ошибка")
        self._set_badge("ОШИБКА", "danger")
        self._show_alert(result.message, kind="danger")

    def _on_ulash(self) -> None:
        if self.busy or self.session.auth.is_locked():
            return
        tok = self.token_var.get().strip()
        if tok != (self.session.pairing_token() or ""):
            self.session.set_pairing_token(tok)
        self._on_location_selected()
        if not (self.session.location_id or "").strip():
            self.status_var.set("Локация не выбрана")
            self._set_badge("ЛОКАЦИЯ", "warn")
            self._show_alert(
                "Локация не выбрана. Перед подключением выберите локацию.",
                kind="warn",
            )
            return
        if not self.session.has_credentials():
            self.status_var.set("Нужен токен")
            self._set_badge("ТОКЕН", "warn")
            self._show_alert(
                "Нужен pairing-токен или ключ администратора. "
                "Web → Связь с офисом или ADMIN-PAROL.bat.",
                kind="warn",
            )
            return
        ip = self.ip_var.get().strip()
        if ip:
            chosen = self.session.choose_ip(ip)
            if chosen is None:
                self.status_var.set("Некорректный IP-адрес.")
                self._show_alert("Некорректный IP-адрес.", kind="warn")
                return
            if not chosen.online:
                self.status_var.set("Устройство не в сети")
                self._set_badge("OFFLINE", "danger")
                self.device_var.set(f"Устройство: {ip}")
                self.state_var.set("Состояние: —")
                self._show_alert("Устройство не в сети.", kind="danger")
                return
            self._show_device()
        elif not self.session.chosen:
            self.status_var.set("Устройство не найдено")
            self._show_alert("Устройство не найдено. Сначала выполните поиск.", kind="warn")
            return
        password = self.pwd_var.get()
        if not password.strip():
            self.status_var.set("Нужен пароль")
            self._set_badge("ПАРОЛЬ", "warn")
            self._show_alert("Введите текущий пароль администратора.", kind="warn")
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
            "Подтвердите перед подключением.\n\n"
            f"IP: {self.ip_var.get().strip() or (self.session.chosen.host if self.session.chosen else '—')}\n"
            f"Локация: {self.location_var.get() or '—'}\n"
            f"Введённый пароль администратора: {password}\n"
            f"Почта восстановления: {recovery_email}\n\n"
            "При продолжении приложение:\n"
            "1) установит НОВЫЙ пароль на терминале\n"
            "2) настроит почту восстановления\n"
            "3) отправит новый пароль на Web-сервер\n"
            "4) закрепит привязку\n\n"
            "Продолжить?"
        )
        if not messagebox.askokcancel("Подтверждение пароля", confirm_msg):
            return
        self._set_busy(True)
        self.status_var.set("Проверка…")
        self._set_badge("ПОДКЛЮЧЕНИЕ", "accent")
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
            self.status_var.set("Неверный пароль")
            self._set_badge("ПАРОЛЬ", "danger")
            self._show_alert(
                "Неверный пароль. Введите снова (автоповтор отключён).",
                kind="danger",
            )
        elif kind == LOCKED:
            self.status_var.set("Заблокировано")
            self._refresh_lock_ui()
            if self._tick_job is None:
                self._tick_lock()
        elif kind == TIMEOUT:
            self.status_var.set("Таймаут сети")
            self._set_badge("TIMEOUT", "warn")
            self._show_alert(result.message, kind="warn")
        elif kind == OFFLINE:
            self.status_var.set("Устройство не в сети")
            self._set_badge("OFFLINE", "danger")
            self._show_alert(result.message, kind="danger")
        elif kind == "location":
            self.status_var.set("Локация не выбрана")
            self._set_badge("ЛОКАЦИЯ", "warn")
            self._show_alert(result.message, kind="warn")
        elif kind == "linked" or (linked and kind == "linked"):
            sealed = bool((result.device or {}).get("sealed"))
            needs_confirm = bool((result.device or {}).get("needsAdminConfirm"))
            self._last_link_device = dict(result.device or {})
            self.status_var.set(
                "Ожидание подтверждения в Web"
                if needs_confirm
                else ("Привязка закреплена" if sealed else "Подключено")
            )
            self._set_badge(
                "ПОДТВЕРЖДЕНИЕ" if needs_confirm else "ПОДКЛЮЧЕНО",
                "warn" if needs_confirm else "ok",
            )
            host = (result.device or {}).get("host") or ""
            name = (result.device or {}).get("name") or ""
            self.device_var.set(f"Устройство: {name}  {host}".strip())
            web = self.session.web_url
            try:
                self.session.write_service_handoff()
                svc_note = (
                    " Настройка завершена — GUI можно закрыть. "
                    "Фоновый tunnel при входе в Windows. "
                    "Лица только Web «Синхронизировать» (приложение не участвует)."
                )
            except Exception:
                svc_note = " На вкладке «Туннель»: «Восстановить туннель» / автовосстановление."
            try:
                self.session.ensure_tunnel_supervisor()
            except Exception:
                pass
            self.root.after(500, self._poll_tunnel_once)
            extra = f" Web: {web}." if web else ""
            if needs_confirm:
                self._show_alert(
                    "Пароль установлен на терминал и отправлен на сервер. "
                    "Web → уведомление / Устройства → «Подтвердить привязку».",
                    kind="warn",
                )
                self.note.configure(
                    text=(
                        "Следующий шаг: администратор tenant в Web открывает уведомление "
                        "и нажимает «Подтвердить привязку». "
                        "После этого лица и устройство полностью синхронизируются. "
                        "Приложение автоматически отслеживает подтверждение."
                        + extra
                        + svc_note
                    )
                )
                messagebox.showinfo(
                    "Ожидание подтверждения",
                    "Пароль установлен на устройство и отправлен в Web.\n\n"
                    "Администратор tenant должен в Web (колокольчик уведомлений) "
                    "или на карточке Устройства нажать «Подтвердить привязку».\n"
                    "После подтверждения в этом окне появится «Подключено».",
                )
                self._start_confirm_poll()
            else:
                seal_note = (
                    " Пароль на терминале сменён и закреплён на Web-сервере."
                    if sealed
                    else " Пароль записан на сервер."
                )
                self._show_alert("Устройство успешно подключено.", kind="ok")
                self.note.configure(
                    text=(
                        "Подключено. Управление устройством передано в Web."
                        + seal_note
                        + " Новый пароль администратора смотрите в Web → Устройства "
                        "(Показать / Копировать). "
                        "Затем синхронизируйте лица из Web."
                        + extra
                        + svc_note
                    )
                )
                messagebox.showinfo(
                    "Подключено",
                    "Новый пароль администратора отправлен на Web-сервер.\n"
                    "Его можно посмотреть в Web → Устройства → карточка устройства "
                    "через «Показать» / «Копировать».",
                )
            self.pwd_var.set("")
            self.pwd_entry.configure(state="disabled")
            self._set_primary_btn(False)
            self._refresh_device_tab()
        else:
            self.status_var.set(result.message or "Ошибка")
            self._set_badge("ОШИБКА", "danger")
            self._show_alert(result.message, kind="danger")

    def _show_saved_credential(self) -> None:
        data = None
        try:
            from credential_store import format_credential_for_display, read_device_credential

            data = read_device_credential(self.session.root)
            text = format_credential_for_display(data)
        except Exception as exc:
            text = f"Не удалось прочитать: {exc}"
        messagebox.showinfo("Сохранённый пароль терминала", text)
        if data and data.get("password"):
            self._show_alert(
                f"Пароль восстановления есть локально (host={data.get('host')}). "
                "Если Web vault пуст — сохраните этот пароль.",
                kind="ok",
            )
            self._refresh_device_tab()

    def _apply_recovery_email_now(self) -> None:
        """Admin: set recovery email on currently selected device (no Ulash)."""
        if not self.session.chosen:
            self._show_alert("Сначала выберите / найдите устройство.", kind="warn")
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
            self._show_alert(
                "Введите пароль администратора (или нужен сохранённый recovery).",
                kind="warn",
            )
            return
        try:
            from device_email import apply_recovery_email_from_config, normalize_recovery_email

            email = normalize_recovery_email(
                str((self.session.cfg or {}).get("recoveryEmail") or "")
            )
            if not messagebox.askokcancel(
                "Почта восстановления",
                f"Устройство: {self.session.chosen.host}\n"
                f"Email: {email}\n\n"
                "Установить?",
            ):
                return
            self.status_var.set(f"Установка почты: {email}")
            res = apply_recovery_email_from_config(
                self.session.chosen.host,
                int(self.session.chosen.port or 80),
                (self.session.username or "admin").strip() or "admin",
                password,
                self.session.cfg if isinstance(self.session.cfg, dict) else {},
            )
            if res.get("ok"):
                messagebox.showinfo(
                    "Почта восстановления",
                    f"OK — {res.get('email') or email}\nЧерез: {res.get('via') or '—'}",
                )
                self.status_var.set(f"Почта OK: {res.get('email') or email}")
                self._show_alert("Почта восстановления установлена.", kind="ok")
            else:
                self._show_alert(
                    str(res.get("message") or "Не удалось установить почту")[:200],
                    kind="danger",
                )
        except Exception as exc:
            self._show_alert(str(exc)[:200], kind="danger")

    def _open_admin(self) -> None:
        bat = find_root() / "ADMIN-PAROL.bat"
        if not bat.is_file():
            self._show_alert("ADMIN-PAROL.bat не найден.", kind="danger")
            return
        flags = subprocess.CREATE_NEW_CONSOLE if sys.platform == "win32" else 0
        try:
            subprocess.Popen(
                ["cmd.exe", "/c", str(bat)] if sys.platform == "win32" else ["bash", str(bat)],
                cwd=str(bat.parent),
                creationflags=flags,
            )
        except OSError as exc:
            self._show_alert(str(exc)[:160], kind="danger")

    def _cancel_confirm_poll(self) -> None:
        if self._confirm_poll_job is not None:
            try:
                self.root.after_cancel(self._confirm_poll_job)
            except Exception:
                pass
            self._confirm_poll_job = None

    def _start_confirm_poll(self) -> None:
        """Poll Web until admin confirms — then show success in this app."""
        self._cancel_confirm_poll()
        self._confirm_notified = False
        # First check soon (admin may already have confirmed).
        self._confirm_poll_job = self.root.after(1500, self._poll_confirm_once)

    def _poll_confirm_once(self) -> None:
        self._confirm_poll_job = None

        def work() -> None:
            ok, info, msg = self.session.fetch_provision_status()
            self.root.after(0, lambda: self._confirm_poll_done(ok, info, msg))

        threading.Thread(target=work, daemon=True).start()

    def _confirm_poll_done(
        self, ok: bool, info: dict, msg: str
    ) -> None:
        if self._confirm_notified:
            return
        sealed = bool(ok and isinstance(info, dict) and info.get("sealed"))
        pending = bool(
            ok and isinstance(info, dict) and info.get("pendingAdminConfirm")
        )
        if sealed or (ok and not pending and info.get("status") == "linked"):
            self._confirm_notified = True
            self._cancel_confirm_poll()
            name = ""
            if isinstance(info, dict):
                name = str(info.get("deviceName") or "")
                self._last_link_device = {
                    **self._last_link_device,
                    "name": name or self._last_link_device.get("name"),
                    "sealed": True,
                    "needsAdminConfirm": False,
                }
            self.status_var.set("Привязка закреплена")
            self._set_badge("ПОДКЛЮЧЕНО", "ok")
            self._show_alert(
                "Web подтвердил привязку. Синхронизация лиц началась"
                + (f" ({name})." if name else "."),
                kind="ok",
            )
            self.note.configure(
                text=(
                    "В Web выполнено «Подтвердить привязку». "
                    "Устройство закреплено на платформе; лица сотрудников "
                    "синхронизируются. Новый пароль администратора смотрите "
                    "в Web → Устройства."
                )
            )
            self._refresh_device_tab()
            messagebox.showinfo(
                "Подтверждено",
                "Администратор Web подтвердил привязку.\n\n"
                "Устройство готово — синхронизация лиц запустится автоматически.\n"
                "Пароль: Web → Устройства → Показать / Копировать.",
            )
            return
        # Keep waiting (also retry after transient API errors).
        self._confirm_poll_job = self.root.after(3000, self._poll_confirm_once)

    def _poll_tunnel_once(self) -> None:
        if self._tunnel_poll_job is not None:
            try:
                self.root.after_cancel(self._tunnel_poll_job)
            except Exception:
                pass
            self._tunnel_poll_job = None

        def work() -> None:
            try:
                health = self.session.tunnel_health()
            except Exception as e:
                self.root.after(
                    0,
                    lambda: self._apply_tunnel_health_error(str(e)[:160]),
                )
                return
            self.root.after(0, lambda h=health: self._apply_tunnel_health(h))

        threading.Thread(target=work, daemon=True).start()
        self._tunnel_poll_job = self.root.after(12000, self._poll_tunnel_once)

    def _apply_tunnel_health_error(self, msg: str) -> None:
        self.tunnel_status_var.set(f"Ошибка: {msg}")
        self.tunnel_url_var.set("URL: —")
        self._set_tun_ind("gw_http", "Шлюз :8800", False)
        self._set_tun_ind("tun_http", "Туннель URL", False)
        self._set_tun_ind("gw_proc", "Процесс GW", None)
        self._set_tun_ind("tun_proc", "Процесс tunnel", None)
        self._show_alert(f"Туннель: {msg}", kind="danger")

    def _set_tun_ind(self, key: str, title: str, ok: bool | None) -> None:
        var = getattr(self, "_tun_ind_vars", {}).get(key)
        dots = getattr(self, "_tun_ind_dots", {}).get(key)
        if ok is True:
            label, color = f"{title}: OK", C["ok"]
        elif ok is False:
            label, color = f"{title}: нет", C["danger"]
        else:
            label, color = f"{title}: —", C["muted"]
        if var is not None:
            var.set(label)
        if dots:
            canvas, oid = dots
            try:
                canvas.itemconfigure(oid, fill=color, outline=color)
            except tk.TclError:
                pass

    def _apply_tunnel_health(self, health) -> None:
        mode = getattr(health, "mode", "?")
        ok = bool(getattr(health, "ok", False))
        msg = getattr(health, "message", "") or ""
        url = getattr(health, "tunnel_url", "") or ""
        if url:
            self._last_tunnel_url = url
        self._set_tun_ind("gw_http", "Шлюз :8800", bool(getattr(health, "gw_http", False)))
        tun_http = getattr(health, "tunnel_http", None)
        self._set_tun_ind(
            "tun_http",
            "Туннель URL",
            True if tun_http is True else (False if tun_http is False else None),
        )
        self._set_tun_ind(
            "gw_proc", "Процесс GW", bool(getattr(health, "gw_process", False))
        )
        self._set_tun_ind(
            "tun_proc",
            "Процесс tunnel",
            bool(getattr(health, "tunnel_process", False)),
        )
        self.tunnel_status_var.set(
            f"{'OK' if ok else 'ОТКЛЮЧЁН'} · {mode} · {msg}"
        )
        short = url if len(url) < 64 else url[:28] + "…" + url[-20:]
        self.tunnel_url_var.set(f"URL: {short or '—'}")
        if ok:
            # Soft success banner only when recovering from failure text.
            if "ОТКЛЮЧЁН" in (self.status_var.get() or "") or "туннел" in (
                self.lock_var.get() or ""
            ).lower():
                self._show_alert("Туннель и шлюз работают.", kind="ok")
        elif msg and not self._tunnel_busy:
            self._show_alert(f"Туннель: {msg}", kind="warn")
        if (
            ok
            or self._tunnel_busy
            or self.busy
            or not self.tunnel_auto_var.get()
        ):
            return
        # Only auto-heal when handoff / credentials already exist.
        try:
            from paths import load_service_config, read_link_key

            svc = load_service_config(self.session.root)
            if not svc and not read_link_key(self.session.root):
                return
        except Exception:
            return
        self._start_restore_tunnel(auto=True)

    def _on_restore_tunnel(self) -> None:
        self._start_restore_tunnel(auto=False)

    def _start_restore_tunnel(self, *, auto: bool) -> None:
        if self._tunnel_busy or self.busy:
            return
        self._tunnel_busy = True
        self.tunnel_restore_btn.configure(state=tk.DISABLED)
        self.tunnel_status_var.set(
            "Автовосстановление…" if auto else "Восстановление туннеля…"
        )

        def work() -> None:
            def progress(msg: str) -> None:
                self.root.after(0, lambda m=msg: self.tunnel_status_var.set(m[:120]))

            result = self.session.restore_tunnel(progress)
            self.root.after(0, lambda: self._restore_tunnel_done(result, auto=auto))

        threading.Thread(target=work, daemon=True).start()

    def _restore_tunnel_done(self, result: SubmitResult, *, auto: bool) -> None:
        self._tunnel_busy = False
        self.tunnel_restore_btn.configure(state=tk.NORMAL)
        if result.kind == "tunnel_ok":
            url = (result.device or {}).get("tunnelUrl") or ""
            if url:
                self._last_tunnel_url = url
            self.tunnel_status_var.set(result.message or "Туннель OK")
            self.tunnel_url_var.set(f"URL: {url or '—'}")
            self._show_alert("Туннель восстановлен и анонсирован на платформу.", kind="ok")
            if not auto:
                messagebox.showinfo(
                    "Туннель",
                    "Туннель восстановлен и анонсирован на платформу.\n"
                    "Попробуйте снова Web → Синхронизировать.",
                )
            self._refresh_device_tab()
        else:
            self.tunnel_status_var.set(result.message or "Ошибка туннеля")
            self._show_alert(
                result.message or "Не удалось восстановить туннель",
                kind="danger",
            )
            if not auto:
                messagebox.showerror(
                    "Туннель",
                    result.message or "Не удалось восстановить туннель",
                )

    def _on_close(self) -> None:
        if self._tunnel_poll_job is not None:
            try:
                self.root.after_cancel(self._tunnel_poll_job)
            except Exception:
                pass
            self._tunnel_poll_job = None
        try:
            # Keep GW+tunnel alive; spawn detached worker for auto-heal.
            if self._keep_tunnel_on_close:
                try:
                    self.session.write_service_handoff()
                except Exception:
                    pass
                try:
                    self.session.ensure_tunnel_supervisor()
                except Exception:
                    pass
                self.session.stop(kill_tunnel=False)
            else:
                self.session.stop(kill_tunnel=True)
        except Exception:
            pass
        self._cancel_confirm_poll()
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
