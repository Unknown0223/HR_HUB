"""Entry point for pythonw / PyInstaller (no console)."""
from __future__ import annotations

import os
import sys
from pathlib import Path


def _attach_stdio() -> None:
    if sys.stdout is not None and sys.stderr is not None:
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
        return
    from paths import find_root, runtime_dir

    log_dir = runtime_dir(find_root())
    stream = open(log_dir / "office-link.log", "a", encoding="utf-8", errors="replace")
    sys.stdout = stream
    sys.stderr = stream


def main() -> None:
    here = (
        Path(__file__).resolve().parent
        if not getattr(sys, "frozen", False)
        else Path(sys.executable).resolve().parent
    )
    if str(here) not in sys.path:
        sys.path.insert(0, str(here))
    _attach_stdio()

    # Product default: Fluent WebView2 UI (Arena design). Fallback: Tkinter.
    # Force Tk with OFFICE_LINK_UI=tk|native|classic.
    ui = os.environ.get("OFFICE_LINK_UI", "webview").strip().lower()
    webview_error = ""
    if ui not in ("tk", "tkinter", "native", "classic", "gui"):
        try:
            from desktop_app import run_desktop

            run_desktop()
            return
        except (Exception, SystemExit) as exc:
            webview_error = str(exc)
            try:
                sys.stderr.write(f"desktop_app failed: {exc}\n")
            except Exception:
                pass

    try:
        from office_link_gui import run_app
    except ImportError as exc:
        # The bundled embeddable Python has no tkinter: the WebView2 window is the only UI.
        _fatal(
            "HR HUB Link oynasi ochilmadi.\n\n"
            f"{webview_error or exc}\n\n"
            "Microsoft Edge WebView2 Runtime o‘rnatilganini tekshiring "
            "(https://go.microsoft.com/fwlink/p/?LinkId=2124703) va qayta oching."
        )
        return
    run_app()


def _fatal(message: str) -> None:
    try:
        sys.stderr.write(message + "\n")
    except Exception:
        pass
    if sys.platform == "win32":
        import ctypes

        ctypes.windll.user32.MessageBoxW(None, message, "HR HUB Link", 0x10)


if __name__ == "__main__":
    main()
