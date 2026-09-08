"""test1 — password must remain recoverable in every Ulash failure mode."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from credential_store import (
    format_credential_for_display,
    read_device_credential,
    save_device_credential,
)
from discovery import OK, OnlineInfo, VerifyResult
from passwords import generate_terminal_password
from provision import ProvisionEngine
from session import OfficeLinkSession


class Test1PasswordNeverLost(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "data").mkdir(parents=True, exist_ok=True)
        (self.root / "config.json").write_text(
            '{"apiUrl":"https://example.test","tenantCode":"demo","webUrl":"https://web.test"}',
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test1_save_and_read_roundtrip(self) -> None:
        path = save_device_credential(
            host="192.168.0.116",
            password="HrTestPass99",
            username="admin",
            serial="255",
            phase="rotated_on_device",
            root=self.root,
        )
        self.assertTrue(path.is_file())
        data = read_device_credential(self.root)
        assert data is not None
        self.assertEqual(data["password"], "HrTestPass99")
        self.assertEqual(data["host"], "192.168.0.116")
        text = format_credential_for_display(data)
        self.assertIn("HrTestPass99", text)

    def test1_generate_password_is_recoverable_format(self) -> None:
        pwd = generate_terminal_password("admin")
        self.assertGreaterEqual(len(pwd), 8)
        self.assertLessEqual(len(pwd), 16)
        save_device_credential(
            host="10.0.0.1",
            password=pwd,
            phase="rotated_on_device",
            root=self.root,
        )
        again = read_device_credential(self.root)
        assert again is not None
        self.assertEqual(again["password"], pwd)

    def test1_register_failure_keeps_local_password(self) -> None:
        """After device rotate, if API register fails, recovery file still has password."""
        sess = OfficeLinkSession(root=self.root)
        sess.chosen = OnlineInfo(
            host="192.168.0.50",
            port=80,
            online=True,
            likely_hikvision=True,
            hint_name="DS-test",
            kind=OK,
        )
        sess.location_id = "loc-1"
        sess.set_pairing_token("pairing-token-test")
        engine = ProvisionEngine()

        ok_verify = VerifyResult(
            kind=OK,
            host="192.168.0.50",
            port=80,
            serialNumber="SN1",
            name="Term",
            model="DS",
        )

        with (
            patch("provision.verify_password", return_value=ok_verify),
            patch(
                "passwords.generate_terminal_password",
                return_value="HrRecover99x",
            ),
            patch(
                "passwords.change_admin_password",
                return_value={"ok": True, "reason": "changed"},
            ),
            patch("runtime_setup.ensure_runtime"),
            patch("runtime_setup.start_gateway", return_value=MagicMock()),
            patch(
                "runtime_setup.start_tunnel",
                return_value=(MagicMock(), "https://t.example"),
            ),
            patch("api_client.ping", return_value=(200, {"ok": True})),
            patch("api_client.announce", return_value=(200, {"ok": True})),
            patch("api_client.register_device", return_value=(503, {"error": "down"})),
            patch("api_client.patch_progress", return_value=(0, {})),
        ):
            result = engine.provision_configured(
                sess,
                "OldPass12",
                "loc-1",
                rotate_password=True,
            )

        data = read_device_credential(self.root)
        self.assertIsNotNone(data, "recovery file must exist after register failure")
        assert data is not None
        self.assertEqual(data["password"], "HrRecover99x")
        self.assertIn(
            data.get("phase"),
            ("rotated_on_device", "register_failed_keep_local"),
        )
        self.assertEqual(result.kind, "api")
        self.assertIn("HrRecover99x", result.message)

    def test1_success_still_keeps_local_copy(self) -> None:
        sess = OfficeLinkSession(root=self.root)
        sess.chosen = OnlineInfo(
            host="192.168.0.50",
            port=80,
            online=True,
            likely_hikvision=True,
            hint_name="DS-test",
            kind=OK,
        )
        sess.location_id = "loc-1"
        sess.set_pairing_token("pairing-token-test")
        engine = ProvisionEngine()
        ok_verify = VerifyResult(
            kind=OK,
            host="192.168.0.50",
            port=80,
            serialNumber="SN1",
            name="Term",
            model="DS",
        )
        with (
            patch("provision.verify_password", return_value=ok_verify),
            patch(
                "passwords.generate_terminal_password",
                return_value="HrSuccess88y",
            ),
            patch(
                "passwords.change_admin_password",
                return_value={"ok": True, "reason": "changed"},
            ),
            patch("runtime_setup.ensure_runtime"),
            patch("runtime_setup.start_gateway", return_value=MagicMock()),
            patch(
                "runtime_setup.start_tunnel",
                return_value=(MagicMock(), "https://t.example"),
            ),
            patch("api_client.ping", return_value=(200, {"ok": True})),
            patch("api_client.announce", return_value=(200, {"ok": True})),
            patch(
                "api_client.register_device",
                return_value=(
                    200,
                    {
                        "ok": True,
                        "needsAdminConfirm": True,
                        "sealed": False,
                        "device": {"id": "dev-1", "name": "Term", "host": "192.168.0.50"},
                    },
                ),
            ),
            patch("api_client.patch_progress", return_value=(200, {})),
        ):
            result = engine.provision_configured(
                sess,
                "OldPass12",
                "loc-1",
                rotate_password=True,
            )

        self.assertEqual(result.kind, "linked")
        data = read_device_credential(self.root)
        assert data is not None
        self.assertEqual(data["password"], "HrSuccess88y")
        self.assertEqual(data.get("phase"), "registered_awaiting_admin_confirm")

    def test1_empty_password_refused(self) -> None:
        with self.assertRaises(ValueError):
            save_device_credential(host="1.2.3.4", password="  ", root=self.root)


if __name__ == "__main__":
    unittest.main()
