"""Entry point for pythonw / PyInstaller (no console)."""
from __future__ import annotations

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
    here = Path(__file__).resolve().parent if not getattr(sys, "frozen", False) else Path(sys.executable).resolve().parent
    if str(here) not in sys.path:
        sys.path.insert(0, str(here))
    _attach_stdio()
    from office_link_gui import run_app

    run_app()


if __name__ == "__main__":
    main()
