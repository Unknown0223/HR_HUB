from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

import _pathsetup  # noqa: F401

from discovery import OK, UNAUTHORIZED, OnlineInfo, VerifyResult
from session import OfficeLinkSession, SubmitResult


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


class ReconnectNetworkTests(unittest.TestCase):
    def setUp(self):
        self.sess = OfficeLinkSession()
        self.sess.chosen = _online()
        self.sess.set_pairing_token("pair-token")

    def test_reconnect_uses_web_password_and_skips_rotate(self):
        web_device = {
            "id": "dev-1",
            "serialNumber": "SN-1",
            "host": "10.0.0.1",
            "password": "VaultPwd1!",
            "username": "admin",
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

        with patch(
            "session.read_link_key", return_value="link-key"
        ), patch.object(
            self.sess,
            "peek_reconnect_password",
            return_value={
                "password": "VaultPwd1!",
                "source": "web",
                "device": web_device,
                "username": "admin",
            },
        ), patch(
            "session.verify_password", return_value=ok_verify
        ) as vp, patch.object(
            self.sess,
            "fetch_web_devices",
            return_value=(True, [web_device], "OK"),
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
            r = self.sess.reconnect_network("VaultPwd1!")

        self.assertEqual(r.kind, "reconnected")
        vp.assert_called()
        recon.assert_called_once()
        args, kwargs = recon.call_args
        self.assertEqual(kwargs.get("device_id"), "dev-1")
        self.assertEqual(kwargs.get("host"), "192.168.0.116")
        reg.assert_not_called()
        rotate_spy.assert_not_called()

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
        bad = VerifyResult(kind=UNAUTHORIZED, host="192.168.0.116")
        with patch(
            "session.read_link_key", return_value="k"
        ), patch.object(
            self.sess,
            "peek_reconnect_password",
            return_value={
                "password": "wrong",
                "source": "manual",
                "device": None,
                "username": "admin",
            },
        ), patch(
            "session.verify_password", return_value=bad
        ), patch.object(
            self.sess, "fetch_web_devices", return_value=(True, [], "OK")
        ):
            r = self.sess.reconnect_network("wrong")
        self.assertEqual(r.kind, UNAUTHORIZED)
        self.assertIn("Ulash", r.message)


if __name__ == "__main__":
    unittest.main()
