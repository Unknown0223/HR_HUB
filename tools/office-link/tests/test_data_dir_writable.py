"""data_dir must fall back to LocalAppData when install path is not writable."""
from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import paths


class DataDirWritableTest(unittest.TestCase):
    def test_falls_back_to_user_data(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "ProgramFiles" / "HRHUB-Link"
            root.mkdir(parents=True)
            (root / "BOSHLASH.bat").write_text("@echo off\n", encoding="utf-8")
            install_data = root / "data"
            install_data.mkdir()

            user_base = Path(tmp) / "LocalAppData"
            user_base.mkdir()

            def fake_writable(path: Path) -> bool:
                # Simulate Program Files: cannot write into install_data
                return path != install_data and "LocalAppData" in str(path)

            with (
                patch.object(paths, "_dir_is_writable", side_effect=fake_writable),
                patch.object(paths, "user_data_root", return_value=user_base / "HRHUB-Link"),
            ):
                d = paths.data_dir(root)
            self.assertEqual(d, user_base / "HRHUB-Link" / "data")
            self.assertTrue(d.is_dir())

    def test_prefers_existing_credential_in_user_data(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "install"
            root.mkdir()
            install_data = root / "data"
            install_data.mkdir()
            user_data = Path(tmp) / "HRHUB-Link" / "data"
            user_data.mkdir(parents=True)
            (user_data / "device-credential.json").write_text(
                '{"password":"x"}\n', encoding="utf-8"
            )
            with patch.object(paths, "user_data_root", return_value=Path(tmp) / "HRHUB-Link"):
                d = paths.data_dir(root)
            self.assertEqual(d, user_data)


if __name__ == "__main__":
    unittest.main()
