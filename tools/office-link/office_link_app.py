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
    if ui not in ("tk", "tkinter", "native", "classic", "gui"):
        try:
            from desktop_app import run_desktop

            run_desktop()
            return
        except Exception as exc:
            try:
                sys.stderr.write(f"desktop_app failed: {exc}\n")
            except Exception:
                pass

    from office_link_gui import run_app

    run_app()


if __name__ == "__main__":
    main()
