"""Bulk provision CLI — up to 5 hosts, one-by-one (Faza 2 lite).

Example:
  python bulk_provision.py --hosts 192.168.1.50,192.168.1.51 \\
      --location LOC_ID --password 'AdminPass'
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from typing import Any

from discovery import OK
from paths import find_root, read_link_key, read_pairing_token
from session import OfficeLinkSession

MAX_HOSTS = 5


@dataclass
class HostResult:
    host: str
    status: str
    message: str = ""
    device: dict[str, Any] = field(default_factory=dict)


def parse_hosts(raw: str) -> list[str]:
    parts = [p.strip() for p in (raw or "").replace(";", ",").split(",")]
    return [p for p in parts if p]


def provision_hosts(
    hosts: list[str],
    *,
    location_id: str,
    password: str,
    root=None,
    on_status=None,
) -> list[HostResult]:
    """Provision configured devices sequentially (max MAX_HOSTS)."""
    if len(hosts) > MAX_HOSTS:
        raise ValueError(f"Maksimum {MAX_HOSTS} ta host (hozir {len(hosts)}).")
    location_id = (location_id or "").strip()
    password = (password or "").strip()
    if not location_id:
        raise ValueError("Lokatsiya (--location) majburiy.")
    if not password:
        raise ValueError("Parol (--password) majburiy.")

    results: list[HostResult] = []
    for host in hosts:
        if on_status:
            on_status(f"=== {host} ===")
        sess = OfficeLinkSession(root=root)
        if not sess.has_credentials():
            results.append(
                HostResult(
                    host=host,
                    status="error",
                    message="Pairing token yoki link.key yo‘q",
                )
            )
            continue
        chosen = sess.choose_ip(host)
        if chosen is None:
            results.append(HostResult(host=host, status="error", message="IP noto‘g‘ri"))
            continue
        if not chosen.online:
            results.append(HostResult(host=host, status="offline", message="Onlayn emas"))
            continue
        sess.set_location_id(location_id)
        state = (sess.detected_state or {}).get("state")
        if state == "new":
            results.append(
                HostResult(
                    host=host,
                    status="skipped",
                    message="Yangi (aktivatsiya) — Faza 3; o‘tkazib yuborildi",
                )
            )
            continue

        submit = sess.submit_password(password)
        if submit.kind != OK:
            results.append(
                HostResult(host=host, status=str(submit.kind), message=submit.message)
            )
            continue

        linked = sess.link_to_cloud(on_status)
        # Keep last host's GW/tunnel; stop previous sessions' handles without killing
        # shared runtime if this was not the last — only release Python refs.
        if linked.kind == "linked":
            results.append(
                HostResult(
                    host=host,
                    status="linked",
                    message=linked.message or "Ulandi",
                    device=linked.device or {},
                )
            )
            # Detach so closing CLI does not kill shared GW for remaining hosts.
            sess.services = None
        else:
            results.append(
                HostResult(
                    host=host,
                    status=str(linked.kind),
                    message=linked.message or "Xato",
                )
            )
            try:
                sess.stop()
            except Exception:
                pass
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=f"HR HUB Link — bulk provision (max {MAX_HOSTS} host)"
    )
    parser.add_argument(
        "--hosts",
        required=True,
        help="IP ro‘yxati vergul bilan: 1.2.3.4,1.2.3.5",
    )
    parser.add_argument("--location", required=True, help="Lokatsiya UUID")
    parser.add_argument("--password", required=True, help="Hikvision admin paroli")
    parser.add_argument("--root", default="", help="office-link root (ixtiyoriy)")
    args = parser.parse_args(argv)

    hosts = parse_hosts(args.hosts)
    if not hosts:
        print("[XATO] Host ro‘yxati bo‘sh.", file=sys.stderr)
        return 2
    if len(hosts) > MAX_HOSTS:
        print(f"[XATO] Maksimum {MAX_HOSTS} ta host.", file=sys.stderr)
        return 2

    root = find_root()
    if args.root:
        from pathlib import Path

        root = Path(args.root).resolve()

    if not read_link_key(root) and not read_pairing_token(root):
        print("[XATO] data/link.key yoki pairing.token kerak.", file=sys.stderr)
        return 2

    def _print(msg: str) -> None:
        print(msg, flush=True)

    print(f"Bulk provision: {len(hosts)} ta host (max {MAX_HOSTS})", flush=True)
    try:
        results = provision_hosts(
            hosts,
            location_id=args.location,
            password=args.password,
            root=root,
            on_status=_print,
        )
    except ValueError as exc:
        print(f"[XATO] {exc}", file=sys.stderr)
        return 2

    print("\n--- Natija ---", flush=True)
    linked_n = 0
    for r in results:
        mark = "OK" if r.status == "linked" else r.status.upper()
        print(f"[{mark}] {r.host}: {r.message}", flush=True)
        if r.status == "linked":
            linked_n += 1

    print(f"\nUlandi: {linked_n}/{len(results)}", flush=True)
    return 0 if linked_n == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
