from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

import _pathsetup  # noqa: F401

from discovery import OK, UNAUTHORIZED, OnlineInfo, VerifyResult
from session import OfficeLinkSession, ReconnectMatch, SubmitResult


def _online(host: str = "192.168.0.116") -> OnlineInfo:
    return OnlineInfo(
        host=host,
        port=80,
        online=True,
        likely_hikvision=True,
        hint_name="Gate",
        kind=OK,
    )


class MatchWebDeviceTests(unittest.TestCase):
    def test_match_by_serial(self):
        devices = [
            {"id": "a", "serialNumber": "111", "host": "1.1.1.1", "password": "x"},
            {"id": "b", "serialNumber": "255", "host": "2.2.2.2", "password": "y"},
        ]
        m = OfficeLinkSession.match_web_device(devices, serial="255", host="9.9.9.9")
        self.assertEqual(m["id"], "b")

    def test_match_by_host_fallback(self):
        devices = [
            {"id": "a", "serialNumber": "111", "host": "192.168.0.116", "password": "x"},
        ]
        m = OfficeLinkSession.match_web_device(devices, serial="999", host="192.168.0.116")
        self.assertEqual(m["id"], "a")

    def test_match_by_device_id(self):
        devices = [
            {"id": "dev-a", "serialNumber": "1", "host": "1.1.1.1", "password": "x"},
            {"id": "dev-b", "serialNumber": "2", "host": "2.2.2.2", "password": "y"},
        ]
        m = OfficeLinkSession.match_web_device(devices, device_id="dev-b")
        self.assertEqual(m["id"], "dev-b")


class ResolveReconnectMatchTests(unittest.TestCase):
    def setUp(self):
        self.sess = OfficeLinkSession()

    def test_match_serial_and_host_changed(self):
        lan = [_online("192.168.0.200")]
        web = [
            {
                "id": "dev-1",
                "serialNumber": "SN-1",
                "host": "10.0.0.1",
                "password": "VaultPwd1!",
                "username": "admin",
                "name": "Gate",
            }
        ]
        ok_verify = VerifyResult(
            kind=OK,
            host="192.168.0.200",
            port=80,
            name="Gate",
            serialNumber="SN-1",
            model="DS",
        )
        with patch(
            "credential_store.read_device_credential", return_value=None
        ), patch("session.verify_password", return_value=ok_verify):
            resolved = self.sess.resolve_reconnect_match(lan, web)
        self.assertIsInstance(resolved, ReconnectMatch)
        assert isinstance(resolved, ReconnectMatch)
        self.assertEqual(resolved.web["id"], "dev-1")
        self.assertTrue(resolved.host_changed)
        self.assertEqual(resolved.lan.host, "192.168.0.200")

    def test_bad_password(self):
        lan = [_online()]
        web = [
            {
                "id": "dev-1",
                "serialNumber": "SN-1",
                "host": "192.168.0.116",
                "password": "wrong",
                "username": "admin",
            }
        ]
        bad = VerifyResult(kind=UNAUTHORIZED, host="192.168.0.116")
        with patch(
            "credential_store.read_device_credential", return_value=None
        ), patch("session.verify_password", return_value=bad):
            resolved = self.sess.resolve_reconnect_match(lan, web)
        self.assertIsInstance(resolved, SubmitResult)
        assert isinstance(resolved, SubmitResult)
        self.assertEqual(resolved.kind, UNAUTHORIZED)


class ReconnectNetworkTests(unittest.TestCase):
    def setUp(self):
        self.sess = OfficeLinkSession()
        self.sess.chosen = _online()
        self.sess.set_pairing_token("pair-token")

    def test_auto_reconnect_scan_match_link(self):
        web_device = {
            "id": "dev-1",
            "serialNumber": "SN-1",
            "host": "10.0.0.1",
            "password": "VaultPwd1!",
            "username": "admin",
            "name": "Gate",
        }
        ok_verify = VerifyResult(
            kind=OK,
            host="192.168.0.116",
            port=80,
            name="Gate",
            serialNumber="SN-1",
            model="DS",
        )

        class DummyBundle:
            def __init__(self):
                self.root = None
                self.gw = None
                self.tunnel = None
                self.tunnel_url = ""

            def stop(self):
                return None

        dummy = DummyBundle()
        rotate_spy = MagicMock()
        steps: list[tuple[str, str]] = []

        def on_step(sid: str, state: str, _detail: str = "") -> None:
            steps.append((sid, state))

        with patch(
            "session.read_link_key", return_value="link-key"
        ), patch.object(
            self.sess,
            "fetch_web_devices",
            return_value=(True, [web_device], "OK"),
        ), patch.object(
            self.sess,
            "scan_for_reconnect",
            return_value=[_online()],
        ), patch(
            "session.verify_password", return_value=ok_verify
        ), patch(
            "credential_store.read_device_credential", return_value=None
        ), patch(
            "runtime_setup.ensure_runtime"
        ), patch(
            "runtime_setup.ServiceBundle", return_value=dummy
        ), patch(
            "runtime_setup.start_gateway", return_value=object()
        ), patch(
            "runtime_setup.start_tunnel",
            return_value=(object(), "https://abc.trycloudflare.com"),
        ), patch(
            "api_client.ping", return_value=(200, {"ok": True})
        ), patch(
            "api_client.announce", return_value=(200, {"ok": True})
        ), patch(
            "api_client.reconnect_device",
            return_value=(200, {"ok": True, "gwVerified": True, "device": web_device}),
        ) as recon, patch(
            "api_client.register_device"
        ) as reg, patch(
            "passwords.change_admin_password", rotate_spy
        ), patch(
            "credential_store.save_device_credential"
        ):
            r = self.sess.auto_reconnect_network(
                "VaultPwd1!",
                on_step=on_step,
                ip_hint="192.168.0.116",
            )

        self.assertEqual(r.kind, "reconnected")
        self.assertTrue(r.device.get("hostChanged"))
        recon.assert_called_once()
        kwargs = recon.call_args.kwargs
        self.assertEqual(kwargs.get("device_id"), "dev-1")
        self.assertEqual(kwargs.get("host"), "192.168.0.116")
        reg.assert_not_called()
        rotate_spy.assert_not_called()
        self.assertIn(("link", "done"), steps)
        self.assertIn(("scan", "done"), steps)
        self.assertIn(("match", "done"), steps)

    def test_peek_prefers_local_then_web(self):
        with patch(
            "credential_store.read_device_credential",
            return_value={"password": "LocalPwd", "username": "admin", "host": "1.1.1.1"},
        ):
            peek = self.sess.peek_reconnect_password()
        self.assertEqual(peek["source"], "local")
        self.assertEqual(peek["password"], "LocalPwd")

        with patch(
            "credential_store.read_device_credential", return_value=None
        ), patch.object(
            self.sess,
            "fetch_web_devices",
            return_value=(
                True,
                [
                    {
                        "id": "d1",
                        "serialNumber": "S",
                        "host": "192.168.0.116",
                        "password": "WebPwd",
                        "username": "admin",
                    }
                ],
                "OK",
            ),
        ):
            peek2 = self.sess.peek_reconnect_password()
        self.assertEqual(peek2["source"], "web")
        self.assertEqual(peek2["password"], "WebPwd")

    def test_bad_password_message(self):
        with patch(
            "session.read_link_key", return_value="k"
        ), patch.object(
            self.sess,
            "fetch_web_devices",
            return_value=(
                True,
                [
                    {
                        "id": "dev-1",
                        "serialNumber": "SN",
                        "host": "1.1.1.1",
                        "password": "wrong",
                        "username": "admin",
                    }
                ],
                "OK",
            ),
        ), patch.object(
            self.sess,
            "scan_for_reconnect",
            return_value=[_online()],
        ), patch(
            "credential_store.read_device_credential", return_value=None
        ), patch(
            "session.verify_password",
            return_value=VerifyResult(kind=UNAUTHORIZED, host="192.168.0.116"),
        ):
            r = self.sess.auto_reconnect_network("wrong")
        self.assertEqual(r.kind, UNAUTHORIZED)
        self.assertIn("Ulash", r.message)


if __name__ == "__main__":
    unittest.main()
