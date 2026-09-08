from __future__ import annotations

import hashlib
import socket
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import patch

import _pathsetup  # noqa: F401

from discovery import (
    OK,
    TIMEOUT,
    UNAUTHORIZED,
    build_digest_header,
    classify_probe,
    parse_www_authenticate,
    probe_online,
    verify_password,
)


class ParseAuthTests(unittest.TestCase):
    def test_parse_digest_header(self):
        hdr = 'Digest realm="IP Camera(DS-K1T)", nonce="abc", qop="auth"'
        got = parse_www_authenticate(hdr)
        self.assertEqual(got["realm"], "IP Camera(DS-K1T)")
        self.assertEqual(got["nonce"], "abc")
        self.assertEqual(got["qop"], "auth")

    def test_classify_401_digest_is_hikvision(self):
        info = classify_probe(
            401,
            {"www-authenticate": 'Digest realm="IP Camera(C1)", nonce="n"', "server": "App-webs"},
            b"",
        )
        self.assertTrue(info["likely_hikvision"])
        self.assertEqual(info["hint_name"], "C1")

    def test_classify_router_html_not_hikvision(self):
        info = classify_probe(200, {"server": "nginx", "content-type": "text/html"}, b"<html>login</html>")
        self.assertFalse(info["likely_hikvision"])


class _DigestServer(BaseHTTPRequestHandler):
    nonce = "n0ncevalue"
    realm = "IP Camera(TestCam)"
    user = "admin"
    password = "Abcd1234"

    def log_message(self, format, *args):  # noqa: A003
        return

    def do_GET(self):  # noqa: N802
        uri = "/ISAPI/System/deviceInfo"
        if not self.path.startswith(uri):
            self.send_error(404)
            return
        auth = self.headers.get("Authorization") or ""
        if not auth.lower().startswith("digest"):
            self.send_response(401)
            self.send_header(
                "WWW-Authenticate",
                f'Digest realm="{self.realm}", nonce="{self.nonce}", qop="auth"',
            )
            self.end_headers()
            return
        got = parse_www_authenticate(auth)
        expected = build_digest_header(
            {"realm": self.realm, "nonce": self.nonce, "qop": "auth"},
            self.user,
            self.password,
            "GET",
            uri,
            nc=got.get("nc") or "00000001",
            cnonce=got.get("cnonce") or "x",
        )
        exp = parse_www_authenticate(expected)
        if got.get("response") != exp.get("response"):
            self.send_response(401)
            self.send_header(
                "WWW-Authenticate",
                f'Digest realm="{self.realm}", nonce="{self.nonce}", qop="auth"',
            )
            self.end_headers()
            return
        xml = (
            b'<?xml version="1.0"?>'
            b"<DeviceInfo>"
            b"<deviceName>TestCam</deviceName>"
            b"<model>DS-TEST</model>"
            b"<serialNumber>SN-1</serialNumber>"
            b"</DeviceInfo>"
        )
        self.send_response(200)
        self.send_header("Content-Type", "application/xml")
        self.send_header("Content-Length", str(len(xml)))
        self.end_headers()
        self.wfile.write(xml)


def _serve() -> tuple[HTTPServer, int]:
    httpd = HTTPServer(("127.0.0.1", 0), _DigestServer)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, port


class OnlineProbeTests(unittest.TestCase):
    def test_online_without_password(self):
        httpd, port = _serve()
        try:
            info = probe_online("127.0.0.1", port, timeout=2.0)
            self.assertTrue(info.online)
            self.assertTrue(info.likely_hikvision)
            self.assertEqual(info.hint_name, "TestCam")
        finally:
            httpd.shutdown()
            httpd.server_close()

    def test_verify_wrong_then_right_password(self):
        httpd, port = _serve()
        try:
            bad = verify_password("127.0.0.1", port, "admin", "WrongPass1", timeout=2.0)
            self.assertEqual(bad.kind, UNAUTHORIZED)
            good = verify_password("127.0.0.1", port, "admin", "Abcd1234", timeout=2.0)
            self.assertEqual(good.kind, OK)
            self.assertEqual(good.name, "TestCam")
            self.assertEqual(good.serialNumber, "SN-1")
        finally:
            httpd.shutdown()
            httpd.server_close()

    def test_empty_prefixes_finds_nothing(self):
        from discovery import find_devices

        self.assertEqual(find_devices([]), [])

    def test_timeout_is_not_unauthorized(self):
        with patch("discovery._http_get", side_effect=socket.timeout):
            r = verify_password("127.0.0.1", 9, "admin", "x", timeout=0.2)
        self.assertEqual(r.kind, TIMEOUT)


class DigestMathTests(unittest.TestCase):
    def test_response_stable(self):
        hdr = build_digest_header(
            {"realm": "r", "nonce": "n", "qop": "auth"},
            "admin",
            "secret",
            "GET",
            "/x",
            nc="00000001",
            cnonce="deadbeef",
        )
        ha1 = hashlib.md5(b"admin:r:secret").hexdigest()
        ha2 = hashlib.md5(b"GET:/x").hexdigest()
        expect = hashlib.md5(f"{ha1}:n:00000001:deadbeef:auth:{ha2}".encode()).hexdigest()
        self.assertIn(expect, hdr)


if __name__ == "__main__":
    unittest.main()
