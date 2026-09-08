from __future__ import annotations

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import patch

import _pathsetup  # noqa: F401

from auth_lock import CONFIRM, LOCKED
from discovery import OFFLINE, OK, TIMEOUT, UNAUTHORIZED, OnlineInfo, VerifyResult
from session import OfficeLinkSession


def _online(host: str = "192.168.1.50") -> OnlineInfo:
    return OnlineInfo(
        host=host,
        port=80,
        online=True,
        likely_hikvision=True,
        hint_name="Cam",
        kind=OK,
    )


class SessionPasswordTests(unittest.TestCase):
    def setUp(self):
        self.sess = OfficeLinkSession()
        self.sess.chosen = _online()

    def test_empty_password(self):
        r = self.sess.submit_password("  ")
        self.assertEqual(r.kind, "empty")

    def test_first_401_confirm_clears_policy(self):
        with patch("session.probe_online", return_value=_online()):
            with patch(
                "session.verify_password",
                return_value=VerifyResult(kind=UNAUTHORIZED, host="192.168.1.50"),
            ) as vp:
                r = self.sess.submit_password("bad-one")
        self.assertEqual(r.kind, CONFIRM)
        self.assertIn("Qayta", r.message)
        vp.assert_called_once()

    def test_second_401_locks_and_no_further_verify(self):
        with patch("session.probe_online", return_value=_online()):
            with patch(
                "session.verify_password",
                return_value=VerifyResult(kind=UNAUTHORIZED, host="192.168.1.50"),
            ) as vp:
                self.sess.submit_password("bad-one")
                r2 = self.sess.submit_password("bad-two")
                r3 = self.sess.submit_password("bad-three")
        self.assertEqual(r2.kind, LOCKED)
        self.assertEqual(r3.kind, LOCKED)
        self.assertEqual(vp.call_count, 2)

    def test_timeout_not_a_fail(self):
        with patch("session.probe_online", return_value=_online()):
            with patch(
                "session.verify_password",
                return_value=VerifyResult(kind=TIMEOUT, host="192.168.1.50"),
            ):
                r = self.sess.submit_password("maybe")
        self.assertEqual(r.kind, TIMEOUT)
        self.assertEqual(self.sess.auth.fail_count, 0)
        self.assertTrue(self.sess.auth.can_attempt())

    def test_offline_not_a_fail(self):
        off = OnlineInfo(host="192.168.1.50", port=80, online=False, kind=OFFLINE)
        with patch("session.probe_online", return_value=off):
            with patch("session.verify_password") as vp:
                r = self.sess.submit_password("secret")
        self.assertEqual(r.kind, OFFLINE)
        vp.assert_not_called()
        self.assertEqual(self.sess.auth.fail_count, 0)

    def test_success_resets_and_keeps_device(self):
        self.sess.auth.record_401()
        ok = VerifyResult(
            kind=OK,
            host="192.168.1.50",
            port=80,
            name="Gate",
            serialNumber="SN",
            model="DS",
        )
        with patch("session.probe_online", return_value=_online()):
            with patch("session.verify_password", return_value=ok):
                r = self.sess.submit_password("GoodPass1")
        self.assertEqual(r.kind, OK)
        self.assertEqual(self.sess.auth.fail_count, 0)
        self.assertEqual(self.sess.verified["name"], "Gate")


class MockedLinkTests(unittest.TestCase):
    def test_announce_and_device_mocked(self):
        sess = OfficeLinkSession()
        sess.chosen = _online()
        sess.verified = {
            "host": "192.168.1.50",
            "port": 80,
            "name": "Gate",
            "serialNumber": "SN",
            "model": "DS",
        }
        sess.password = "GoodPass1"

        class DummyBundle:
            def __init__(self):
                self.root = None
                self.gw = None
                self.tunnel = None
                self.tunnel_url = ""

            def stop(self):
                return None

        dummy = DummyBundle()

        with patch("runtime_setup.ensure_runtime"), patch(
            "runtime_setup.ServiceBundle", return_value=dummy
        ), patch("runtime_setup.start_gateway", return_value=object()), patch(
            "runtime_setup.start_tunnel", return_value=(object(), "https://abc.trycloudflare.com")
        ), patch("api_client.ping", return_value=(200, {"ok": True})), patch(
            "api_client.announce", return_value=(200, {"ok": True})
        ) as ann, patch(
            "api_client.register_device",
            return_value=(200, {"ok": True, "device": {"name": "Gate", "host": "192.168.1.50"}}),
        ) as reg, patch("session.read_link_key", return_value="dummy-key"):
            r = sess.link_to_cloud()
        self.assertEqual(r.kind, "linked")
        self.assertEqual(r.message, "Ulandi")
        ann.assert_called_once()
        reg.assert_called_once()
        self.assertNotIn("dummy-key", json.dumps(r.device))


class LocalHttpApiTests(unittest.TestCase):
    def test_api_client_against_mock_server(self):
        class H(BaseHTTPRequestHandler):
            def log_message(self, format, *args):  # noqa: A003
                return

            def do_GET(self):  # noqa: N802
                key = self.headers.get("X-Device-Link-Key") or ""
                self.send_response(200 if key == "ok-key" else 401)
                self.send_header("Content-Type", "application/json")
                body = b'{"ok":true}' if key == "ok-key" else b'{"error":"no"}'
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_POST(self):  # noqa: N802
                n = int(self.headers.get("Content-Length") or 0)
                if n:
                    self.rfile.read(n)
                self.send_response(200)
                body = b'{"ok":true}'
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        httpd = HTTPServer(("127.0.0.1", 0), H)
        port = httpd.server_address[1]
        t = threading.Thread(target=httpd.serve_forever, daemon=True)
        t.start()
        try:
            import api_client

            api = f"http://127.0.0.1:{port}"
            code, _ = api_client.ping(api, "wrong", "demo")
            self.assertEqual(code, 401)
            code, _ = api_client.ping(api, "ok-key", "demo")
            self.assertEqual(code, 200)
            code, data = api_client.announce(
                api, "ok-key", "demo", "https://abc.trycloudflare.com"
            )
            self.assertEqual(code, 200)
        finally:
            httpd.shutdown()
            httpd.server_close()


if __name__ == "__main__":
    unittest.main()
