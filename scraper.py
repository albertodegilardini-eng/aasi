#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

try:
    from intelligence import enrich_payload
except ModuleNotFoundError:  # pragma: no cover
    from .intelligence import enrich_payload

BACKEND = Path(__file__).resolve().parent
DATA_DIR = BACKEND / "data"
SEED_FILE = DATA_DIR / "listings.seed.json"
LIVE_FILE = DATA_DIR / "listings.live.json"
INQUIRIES_FILE = DATA_DIR / "inquiries.json"


def read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def build_live_payload(seed_path: Path, live_path: Path, inquiries_path: Path, *, mode: str = "live") -> dict:
    seed_payload = read_json(seed_path, {})
    if not isinstance(seed_payload, dict) or "listings" not in seed_payload or "buildings" not in seed_payload:
        raise SystemExit(f"Invalid seed payload: {seed_path}")

    previous_payload = read_json(live_path, {})
    inquiries = read_json(inquiries_path, [])
    if not isinstance(inquiries, list):
        inquiries = []

    payload = enrich_payload(seed_payload, previous_payload=previous_payload, inquiries=inquiries)
    payload["signature"] = hashlib.sha1(
        (str(payload.get("generated_at")) + str(len(payload.get("listings", [])))).encode("utf-8")
    ).hexdigest()[:12]
    payload["mode"] = mode
    return payload


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="Compile Santa Fe listing seed data into an enriched live intelligence payload."
    )
    ap.add_argument("--seed", type=Path, default=SEED_FILE, help="Path to listings.seed.json")
    ap.add_argument("--live", type=Path, default=LIVE_FILE, help="Path to listings.live.json")
    ap.add_argument("--inquiries", type=Path, default=INQUIRIES_FILE, help="Path to inquiries.json")
    ap.add_argument("--mode", default="live", choices=["live", "enriched_seed", "demo"], help="Output mode label")
    ap.add_argument("--stdout", action="store_true", help="Print payload to stdout instead of writing file")
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    payload = build_live_payload(args.seed, args.live, args.inquiries, mode=args.mode)
    if args.stdout:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        write_json(args.live, payload)
        print(f"wrote {len(payload.get('listings', []))} listings to {args.live}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
