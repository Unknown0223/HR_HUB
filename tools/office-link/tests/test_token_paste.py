"""Smoke test: pairing-token entry paste helpers (no display needed)."""
from __future__ import annotations

import tkinter as tk
from tkinter import ttk
import unittest


class PasteHelpersTest(unittest.TestCase):
    def setUp(self) -> None:
        self.root = tk.Tk()
        self.root.withdraw()
        # Import after Tk so Tcl is ready
        from office_link_gui import OfficeLinkApp  # type: ignore

        self.OfficeLinkApp = OfficeLinkApp

    def tearDown(self) -> None:
        try:
            self.root.destroy()
        except tk.TclError:
            pass

    def test_clipboard_strip_and_replace(self) -> None:
        # Minimal stand-in: call methods via unbound helpers on a fake owner
        class Owner:
            pass

        owner = Owner()
        owner.root = self.root
        owner.lock_var = tk.StringVar(value="")
        owner._show_alert = lambda msg: setattr(owner, "alert", msg)
        owner._hide_alert = lambda: setattr(owner, "alert", None)

        # Bind real methods
        owner._clipboard_text = self.OfficeLinkApp._clipboard_text.__get__(owner)
        owner._paste_into_entry = self.OfficeLinkApp._paste_into_entry.__get__(owner)

        var = tk.StringVar(value="OLD")
        entry = ttk.Entry(self.root, textvariable=var, show="*")
        entry.pack()

        self.root.clipboard_clear()
        self.root.clipboard_append('  "NEW-TOKEN-XYZ"  \n')
        self.root.update()

        owner._paste_into_entry(entry, var, replace_all=True)
        self.assertEqual(var.get(), "NEW-TOKEN-XYZ")


if __name__ == "__main__":
    unittest.main()
