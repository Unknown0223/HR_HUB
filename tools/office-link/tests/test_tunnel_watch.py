"""Unit tests for tunnel health helpers (no real cloudflared)."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import tunnel_watch as tw  # noqa: E402


class TunnelWatchTests(unittest.TestCase):
    def test_probe_local_gw_false_when_down(self):
        with patch("tunnel_watch.urlopen", side_effect=OSError("down")):
            self.assertFalse(tw.probe_local_gw(timeout=0.1))

    def test_probe_tunnel_dns_failure_returns_none(self):
        from urllib.error import URLError

        with patch(
            "tunnel_watch.urlopen",
            side_effect=URLError("getaddrinfo failed"),
        ):
            self.assertIsNone(
                tw.probe_tunnel_url("https://example.trycloudflare.com", timeout=0.1)
            )

    def test_probe_tunnel_empty(self):
        self.assertIsNone(tw.probe_tunnel_url(""))

    def test_snapshot_device_reach_does_not_require_gw(self):
        """With terminal host known, missing :8800 is OK — ask to restore tunnel."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "data").mkdir()
            with patch("tunnel_watch.load_config", return_value={}), patch(
                "tunnel_watch.load_service_config", return_value={}
            ), patch(
                "tunnel_watch.resolve_tunnel_token", return_value=""
            ), patch(
                "tunnel_watch.read_tunnel_url", return_value=""
            ), patch(
                "tunnel_watch.resolve_named_tunnel_url", return_value=""
            ), patch(
                "tunnel_watch._resolve_device_host",
                return_value=("192.168.1.107", 80),
            ), patch(
                "tunnel_watch.probe_local_gw", return_value=False
            ), patch(
                "tunnel_watch._pidfile_alive", return_value=False
            ):
                health = tw.snapshot_health(None, root)
        self.assertEqual(health.reach_mode, "device")
        self.assertFalse(health.ok)
        self.assertFalse(health.gw_http)
        self.assertIn("терминал", health.message.lower())
        self.assertNotIn("8800", health.message)

    def test_snapshot_lan_fallback_ok_without_cloudflared(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "data").mkdir()
            with patch("tunnel_watch.load_config", return_value={}), patch(
                "tunnel_watch.load_service_config",
                return_value={
                    "reachMode": "device",
                    "lanFallback": True,
                    "host": "192.168.100.127",
                },
            ), patch(
                "tunnel_watch.resolve_tunnel_token", return_value=""
            ), patch(
                "tunnel_watch.read_tunnel_url",
                return_value="http://192.168.100.127",
            ), patch(
                "tunnel_watch.resolve_named_tunnel_url", return_value=""
            ), patch(
                "tunnel_watch._resolve_device_host",
                return_value=("192.168.100.127", 80),
            ), patch(
                "tunnel_watch.probe_local_gw", return_value=False
            ), patch(
                "tunnel_watch._pidfile_alive", return_value=False
            ):
                health = tw.snapshot_health(None, root)
        self.assertTrue(health.ok)
        self.assertEqual(health.mode, "lan")
        self.assertIn("LAN", health.message)

    def test_restore_lan_reach_announces_without_cloudflared(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "data").mkdir()
            bundle = MagicMock()
            with patch(
                "tunnel_watch.announce_best_effort", return_value=True
            ) as ann, patch(
                "tunnel_watch.write_service_config"
            ), patch(
                "tunnel_watch.write_tunnel_url"
            ), patch(
                "tunnel_watch.write_status"
            ):
                out_bundle, url = tw.restore_lan_reach(
                    root=root,
                    host="192.168.100.127",
                    port=80,
                    api_url="http://127.0.0.1:1882",
                    tenant="demo",
                    device_id="dev1",
                    bundle=bundle,
                )
        self.assertEqual(url, "http://192.168.100.127:80")
        self.assertEqual(out_bundle.tunnel_url, url)
        ann.assert_called_once()

    def test_restore_tunnel_uses_lan_during_cooldown(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "data").mkdir()
            with patch("tunnel_watch.load_config", return_value={}), patch(
                "tunnel_watch.load_service_config",
                return_value={"apiUrl": "http://127.0.0.1:1882", "tenantCode": "demo"},
            ), patch("tunnel_watch.read_link_key", return_value="k"), patch(
                "paths.read_pairing_token", return_value=""
            ), patch(
                "credential_store.read_device_credential",
                return_value={"host": "192.168.100.127", "port": 80, "deviceId": "d1"},
            ), patch(
                "credential_store.peek_device_host", return_value={}
            ), patch(
                "tunnel_watch.tunnel_cooldown_remaining", return_value=600
            ), patch(
                "tunnel_watch.restore_lan_reach",
                return_value=(MagicMock(), "http://192.168.100.127:80"),
            ) as lan:
                bundle, url = tw.restore_tunnel(root=root, bundle=None)
        self.assertEqual(url, "http://192.168.100.127:80")
        lan.assert_called_once()

    def test_snapshot_gw_mode_reports_8800_when_down(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with patch("tunnel_watch.load_config", return_value={}), patch(
                "tunnel_watch.load_service_config",
                return_value={"reachMode": "gw"},
            ), patch(
                "tunnel_watch.resolve_tunnel_token", return_value=""
            ), patch(
                "tunnel_watch.read_tunnel_url", return_value=""
            ), patch(
                "tunnel_watch.resolve_named_tunnel_url", return_value=""
            ), patch(
                "tunnel_watch._resolve_device_host", return_value=("", 80)
            ), patch(
                "tunnel_watch.probe_local_gw", return_value=False
            ), patch(
                "tunnel_watch._pidfile_alive", return_value=False
            ):
                health = tw.snapshot_health(None, root)
        self.assertEqual(health.reach_mode, "gw")
        self.assertFalse(health.ok)
        self.assertIn("8800", health.message)


class CopyGwSourcesTests(unittest.TestCase):
    def test_copy_from_bundled_seed(self):
        import runtime_setup as rs

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "install"
            seed = root / "gw"
            dest_parent = Path(tmp) / "userdata"
            seed.mkdir(parents=True)
            (seed / "main.py").write_text("# gw\n", encoding="utf-8")
            (seed / "adapters").mkdir()
            (seed / "adapters" / "x.py").write_text("x=1\n", encoding="utf-8")
            writable = dest_parent / "gw"
            with patch("runtime_setup.gw_dir", return_value=writable), patch(
                "runtime_setup.find_root", return_value=root
            ):
                out = rs.copy_gw_sources(root)
            self.assertEqual(out, writable)
            self.assertTrue((writable / "main.py").is_file())
            self.assertTrue((writable / "adapters" / "x.py").is_file())


if __name__ == "__main__":
    unittest.main()
