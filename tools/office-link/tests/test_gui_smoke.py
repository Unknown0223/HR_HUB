from __future__ import annotations

import unittest
from unittest.mock import patch

import _pathsetup  # noqa: F401


class GuiSmokeTests(unittest.TestCase):
    def test_window_builds_uzbek_controls(self):
        import tkinter as tk

        from office_link_gui import OfficeLinkApp

        root = tk.Tk()
        root.withdraw()
        try:
            with patch.object(OfficeLinkApp, "_start_scan", lambda self: None):
                app = OfficeLinkApp(root)
                root.update_idletasks()
                self.assertEqual(str(app.btn.cget("text")), "Ulash")
                self.assertEqual(app.status_var.get(), "Qidirilmoqda")
                self.assertEqual(str(app.pwd_entry.cget("show")), "*")
        finally:
            try:
                root.destroy()
            except Exception:
                pass
