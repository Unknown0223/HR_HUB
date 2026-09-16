"""Multi-device LAN password probe + pick."""
from __future__ import annotations

import unittest
from unittest.mock import patch

import _pathsetup  # noqa: F401

from discovery import OK, UNAUTHORIZED, OnlineInfo, VerifyResult
from session import OfficeLinkSession, PasswordProbeResult


def _lan(host: str) -> OnlineInfo:
    return OnlineInfo(
        host=host,
        port=80,
        online=True,
        likely_hikvision=True,
        hint_name=f"Term-{host.split('.')[-1]}",
    )


class MultiDevicePickTests(unittest.TestCase):
    def test_match_password_marks_ok_and_fail(self):
        session = OfficeLinkSession.__new__(OfficeLinkSession)
        session.username = "admin"
        session.devices = [_lan("192.168.0.10"), _lan("192.168.0.20")]
        session.chosen = None
        session.password = ""

        def fake_verify(host, port, username, password, timeout=6.0):
            if host.endswith(".10") and password == "GoodPass1":
                return VerifyResult(
                    kind=OK, host=host, port=port, serialNumber="SN10", name="A"
                )
            return VerifyResult(kind=UNAUTHORIZED, host=host, port=port, detail="401")

        with patch("session.verify_password", side_effect=fake_verify):
            results = session.match_password_on_lan("GoodPass1")
        self.assertEqual(len(results), 2)
        self.assertTrue(results[0].ok and results[0].host == "192.168.0.10")
        self.assertFalse(results[1].ok)
        self.assertIn("✓", results[0].label())
        self.assertIn("✗", results[1].label())

    def test_pick_password_match_auto_selects_single(self):
        session = OfficeLinkSession.__new__(OfficeLinkSession)
        session.username = "admin"
        session.devices = [_lan("192.168.0.10"), _lan("192.168.0.20")]
        session.chosen = None
        session.password = ""
        session.detected_state = {}

        def fake_verify(host, port, username, password, timeout=6.0):
            if host.endswith(".20"):
                return VerifyResult(
                    kind=OK, host=host, port=port, serialNumber="SN20", name="B"
                )
            return VerifyResult(kind=UNAUTHORIZED, host=host, port=port)

        with patch("session.verify_password", side_effect=fake_verify):
            with patch.object(session, "_refresh_detected_state"):
                results, match, reason = session.pick_password_match("GoodPass1")
        self.assertEqual(reason, "ok")
        self.assertIsNotNone(match)
        self.assertEqual(match.host, "192.168.0.20")
        self.assertIsNotNone(session.chosen)
        self.assertEqual(session.chosen.host, "192.168.0.20")
        self.assertEqual(sum(1 for r in results if r.ok), 1)

    def test_pick_password_match_need_pick_when_many_ok(self):
        session = OfficeLinkSession.__new__(OfficeLinkSession)
        session.username = "admin"
        session.devices = [_lan("192.168.0.10"), _lan("192.168.0.20")]
        session.chosen = None
        session.password = ""

        def fake_verify(host, port, username, password, timeout=6.0):
            return VerifyResult(kind=OK, host=host, port=port, serialNumber="X", name="Y")

        with patch("session.verify_password", side_effect=fake_verify):
            results, match, reason = session.pick_password_match("SamePass1")
        self.assertEqual(reason, "need_pick")
        self.assertIsNone(match)
        self.assertEqual(len([r for r in results if r.ok]), 2)

    def test_password_probe_result_label(self):
        p = PasswordProbeResult(
            host="192.168.0.5", ok=True, name="Gate", serialNumber="ABC"
        )
        self.assertTrue(p.label().startswith("✓"))
        self.assertIn("192.168.0.5", p.label())
        self.assertIn("ABC", p.label())

    def test_scan_does_not_auto_choose_when_many(self):
        session = OfficeLinkSession.__new__(OfficeLinkSession)
        session.devices = []
        session.chosen = None
        session.detected_state = None
        many = [_lan("192.168.0.10"), _lan("192.168.0.20")]

        with patch("session.find_devices", return_value=many):
            with patch.object(session, "_refresh_detected_state"):
                out = session.scan()
        self.assertEqual(len(out), 2)
        self.assertIsNone(session.chosen)

    def test_scan_auto_chooses_single(self):
        session = OfficeLinkSession.__new__(OfficeLinkSession)
        session.devices = []
        session.chosen = None
        session.detected_state = None
        one = [_lan("192.168.0.10")]

        with patch("session.find_devices", return_value=one):
            with patch.object(session, "_refresh_detected_state"):
                out = session.scan()
        self.assertEqual(len(out), 1)
        self.assertIsNotNone(session.chosen)
        self.assertEqual(session.chosen.host, "192.168.0.10")


if __name__ == "__main__":
    unittest.main()
