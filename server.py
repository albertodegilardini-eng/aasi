#!/usr/bin/env python3
from __future__ import annotations

import io
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

try:
    from intelligence import slugify
except ModuleNotFoundError:  # pragma: no cover
    from .intelligence import slugify

BACKEND = Path(__file__).resolve().parent
ROOT = BACKEND.parent
FRONTEND = ROOT / "frontend"
DATA_DIR = BACKEND / "data"
SEED_FILE = DATA_DIR / "listings.seed.json"
LIVE_FILE = DATA_DIR / "listings.live.json"
INQUIRIES_FILE = DATA_DIR / "inquiries.json"
WATCH_STATE_FILE = DATA_DIR / "watch_state.json"
EVENT_LOG_FILE = DATA_DIR / "event_log.json"
SNAPSHOTS_FILE = DATA_DIR / "snapshots.json"
SCRAPER = BACKEND / "scraper.py"
MX_TZ = ZoneInfo("America/Mexico_City")
SESSION = requests.Session()
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def now_iso() -> str:
    return datetime.now(MX_TZ).replace(microsecond=0).isoformat()


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


def load_payload() -> dict:
    if LIVE_FILE.exists():
        return read_json(LIVE_FILE, {})
    return read_json(SEED_FILE, {})


def load_inquiries() -> list[dict]:
    items = read_json(INQUIRIES_FILE, [])
    return items if isinstance(items, list) else []


def save_inquiries(items: list[dict]) -> None:
    write_json(INQUIRIES_FILE, items)


def load_watch_state() -> dict:
    data = read_json(WATCH_STATE_FILE, {})
    return data if isinstance(data, dict) else {}


def save_watch_state(items: dict) -> None:
    write_json(WATCH_STATE_FILE, items)


def load_event_log() -> list[dict]:
    items = read_json(EVENT_LOG_FILE, [])
    return items if isinstance(items, list) else []


def save_event_log(items: list[dict]) -> None:
    write_json(EVENT_LOG_FILE, items[-1000:])


def load_snapshots() -> list[dict]:
    items = read_json(SNAPSHOTS_FILE, [])
    return items if isinstance(items, list) else []


def save_snapshots(items: list[dict]) -> None:
    write_json(SNAPSHOTS_FILE, items[-1000:])


def run_refresh():
    return subprocess.run(
        [sys.executable, str(SCRAPER)],
        capture_output=True,
        text=True,
        cwd=str(BACKEND),
    )


def ensure_data_files() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for path, default in [
        (INQUIRIES_FILE, []),
        (WATCH_STATE_FILE, {}),
        (EVENT_LOG_FILE, []),
        (SNAPSHOTS_FILE, []),
    ]:
        if not path.exists():
            write_json(path, default)
    if not LIVE_FILE.exists():
        proc = run_refresh()
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr or proc.stdout or "Failed to build live payload")


def parse_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def parse_int(value, default=None):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_float(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def json_error(message: str, code: int = 400, extra: dict | None = None):
    payload = {"ok": False, "error": message}
    if extra:
        payload.update(extra)
    return payload, code


def sanitize_inquiry(data: dict, existing: dict | None = None) -> dict:
    existing = dict(existing or {})
    out = {
        "id": existing.get("id"),
        "timestamp": existing.get("timestamp"),
        "listing_id": str(data.get("listing_id") or existing.get("listing_id") or "").strip(),
        "channel": str(data.get("channel") or existing.get("channel") or "whatsapp").strip() or "whatsapp",
        "contact_name": str(data.get("contact_name") or existing.get("contact_name") or "").strip(),
        "company": str(data.get("company") or existing.get("company") or "").strip(),
        "claimed_status": str(data.get("claimed_status") or existing.get("claimed_status") or "available").strip(),
        "response_hours": parse_float(data.get("response_hours", existing.get("response_hours"))),
        "price_quoted": parse_float(data.get("price_quoted", existing.get("price_quoted"))),
        "provided_unit_number": parse_bool(data.get("provided_unit_number", existing.get("provided_unit_number"))),
        "provided_video": parse_bool(data.get("provided_video", existing.get("provided_video"))),
        "provided_cost_breakdown": parse_bool(data.get("provided_cost_breakdown", existing.get("provided_cost_breakdown"))),
        "notes": str(data.get("notes") or existing.get("notes") or "").strip(),
    }
    if out["claimed_status"] not in {"available", "unavailable", "no_response", "changed_offer"}:
        out["claimed_status"] = "available"
    return out


def find_listing(payload: dict, listing_id: str):
    for row in payload.get("listings") or []:
        if row.get("id") == listing_id:
            return row
    return None


def normalize_text(text: str) -> str:
    return " ".join((text or "").lower().split())


def token_similarity(a: str, b: str) -> float:
    left = {tok for tok in normalize_text(a).split() if len(tok) > 2}
    right = {tok for tok in normalize_text(b).split() if len(tok) > 2}
    if not left or not right:
        return 0.0
    return len(left & right) / max(len(left | right), 1)


def verify_listing_url(url: str, title: str = "") -> dict:
    checked_at = now_iso()
    if not url:
        return {
            "status": "source_missing",
            "confidence": 5,
            "http_status": None,
            "note": "Listing has no source URL.",
            "signals": ["missing_url"],
            "page_title": None,
            "checked_url": None,
            "checked_at": checked_at,
        }

    headers = {"User-Agent": USER_AGENT, "Accept-Language": "es-MX,es;q=0.9,en;q=0.7"}
    try:
        resp = SESSION.get(url, headers=headers, timeout=(5, 12), allow_redirects=True)
    except requests.RequestException as exc:
        note = str(exc)
        blocked = any(k in note.lower() for k in ["403", "429", "tls", "captcha", "cloudflare"])
        return {
            "status": "access_blocked" if blocked else "network_error",
            "confidence": 20 if blocked else 10,
            "http_status": None,
            "note": note,
            "signals": ["request_exception"],
            "page_title": None,
            "checked_url": url,
            "checked_at": checked_at,
        }

    http_status = resp.status_code
    final_url = resp.url
    html = resp.text or ""
    lower = html.lower()
    soup = BeautifulSoup(html, "html.parser")
    page_title = soup.title.get_text(" ", strip=True) if soup.title else None

    signals: list[str] = []
    confidence = 45
    status = "uncertain"
    note = None

    if http_status in {404, 410}:
        status = "off_market"
        confidence = 98
        note = f"HTTP {http_status}."
        signals.append("http_off_market")
    elif http_status in {401, 403, 429, 503}:
        status = "access_blocked"
        confidence = 25
        note = f"HTTP {http_status}."
        signals.append("http_blocked")
    else:
        blocked_keywords = [
            "captcha", "access denied", "forbidden", "human verification", "robot", "cloudflare", "bloqueado"
        ]
        off_market_keywords = [
            "propiedad fue suspendida", "propiedad suspendida", "publicación finalizada", "publicacion finalizada",
            "anuncio expirado", "ya no está disponible", "ya no esta disponible", "not available",
            "off market", "removed", "sold", "rented", "rentado", "rentada", "suspendida", "suspended"
        ]
        active_keywords = [
            "contactar", "whatsapp", "agenda tu visita", "agendar visita", "amenidades", "m²", "recámara",
            "recamaras", "departamento", "renta", "venta", "precio", "estacionamiento"
        ]

        if any(k in lower for k in blocked_keywords):
            status = "access_blocked"
            confidence = 25
            note = "Page looks blocked by anti-bot or gateway."
            signals.append("keyword_blocked")
        elif any(k in lower for k in off_market_keywords):
            status = "off_market"
            confidence = 92
            note = "Page contains off-market or suspended wording."
            signals.append("keyword_off_market")
        else:
            sim = token_similarity(title, page_title or lower[:800])
            active_hits = sum(1 for k in active_keywords if k in lower)
            if sim >= 0.22:
                status = "active"
                confidence = 80
                note = "Page title matches the listing context."
                signals.append("title_match")
            elif active_hits >= 3:
                status = "active"
                confidence = 68
                note = "Page contains active listing signals."
                signals.append("page_active_signals")
            else:
                status = "not_found"
                confidence = 42
                note = "Page responded but listing evidence is weak."
                signals.append("weak_evidence")

    if final_url and final_url != url:
        signals.append("redirected")
        if not note:
            note = "Request redirected."

    return {
        "status": status,
        "confidence": confidence,
        "http_status": http_status,
        "note": note,
        "signals": signals,
        "page_title": page_title,
        "checked_url": final_url,
        "checked_at": checked_at,
    }


def event_severity(event_type: str) -> str:
    if event_type in {"listing_off_market", "source_missing"}:
        return "critical"
    if event_type in {"access_blocked", "status_changed", "relisted", "confidence_drop"}:
        return "high"
    if event_type in {"network_error", "confidence_rise"}:
        return "medium"
    return "low"


def make_event(listing_id: str, event_type: str, note: str, previous: dict | None = None, current: dict | None = None) -> dict:
    ts = now_iso()
    return {
        "id": f"evt_{int(datetime.now(timezone.utc).timestamp() * 1000)}_{listing_id}",
        "ts": ts,
        "listing_id": listing_id,
        "event_type": event_type,
        "severity": event_severity(event_type),
        "note": note,
        "previous": previous or {},
        "current": current or {},
    }


def collect_sources(payload: dict) -> dict:
    listings = payload.get("listings") or []
    watch_state = load_watch_state()
    event_log = load_event_log()
    snapshots = load_snapshots()
    new_events: list[dict] = []
    checked = 0
    off_market_detected = 0
    blocked_detected = 0

    existing_ids = {str(row.get("id")) for row in listings if row.get("id")}
    for lid in list(watch_state):
        if lid not in existing_ids:
            del watch_state[lid]

    queue = []
    for listing in listings:
        lid = str(listing.get("id"))
        state = dict(watch_state.get(lid, {}))
        state.setdefault("watching", True)
        state.setdefault("check_count", 0)
        watch_state[lid] = state
        if state.get("watching") is False:
            continue
        queue.append((listing, state))

    def _worker(item):
        listing, _state = item
        return listing, verify_listing_url(str(listing.get("source") or ""), str(listing.get("title") or ""))

    with ThreadPoolExecutor(max_workers=min(6, max(len(queue), 1))) as ex:
        futures = [ex.submit(_worker, item) for item in queue]
        for fut in as_completed(futures):
            listing, result = fut.result()
            lid = str(listing.get("id"))
            state = dict(watch_state.get(lid, {}))
            checked += 1
            prev_status = state.get("last_check_status")
            prev_conf = parse_float(state.get("avg_confidence"), 0) or 0
            cur_status = result["status"]
            cur_conf = parse_float(result["confidence"], 0) or 0

            state.update({
                "listing_id": lid,
                "title": listing.get("title"),
                "url": listing.get("source"),
                "building": listing.get("building"),
                "watching": state.get("watching", True),
                "last_check_status": cur_status,
                "last_checked_at": result["checked_at"],
                "last_http_status": result.get("http_status"),
                "avg_confidence": round(((prev_conf * state.get("check_count", 0)) + cur_conf) / max(state.get("check_count", 0) + 1, 1), 1),
                "last_confidence": cur_conf,
                "last_note": result.get("note"),
                "last_signals": result.get("signals", []),
                "page_title": result.get("page_title"),
                "checked_url": result.get("checked_url"),
                "check_count": state.get("check_count", 0) + 1,
            })
            watch_state[lid] = state

            snapshots.append({
                "listing_id": lid,
                "url": listing.get("source"),
                "status": cur_status,
                "confidence": cur_conf,
                "http_status": result.get("http_status"),
                "signals": result.get("signals", []),
                "note": result.get("note"),
                "page_title": result.get("page_title"),
                "collected_at": result["checked_at"],
            })

            if cur_status == "off_market":
                off_market_detected += 1
            if cur_status == "access_blocked":
                blocked_detected += 1

            if prev_status is None:
                continue
            if cur_status != prev_status:
                if cur_status == "off_market":
                    new_events.append(make_event(lid, "listing_off_market", result.get("note") or "Listing appears off market.", {"status": prev_status}, {"status": cur_status}))
                elif cur_status == "source_missing":
                    new_events.append(make_event(lid, "source_missing", "Listing has no source URL.", {"status": prev_status}, {"status": cur_status}))
                elif cur_status == "access_blocked":
                    new_events.append(make_event(lid, "access_blocked", result.get("note") or "Portal blocked verification.", {"status": prev_status}, {"status": cur_status}))
                elif prev_status == "off_market" and cur_status == "active":
                    new_events.append(make_event(lid, "relisted", "Listing appears active again.", {"status": prev_status}, {"status": cur_status}))
                else:
                    new_events.append(make_event(lid, "status_changed", f"Status changed from {prev_status} to {cur_status}.", {"status": prev_status}, {"status": cur_status}))
            else:
                if prev_conf - cur_conf >= 25:
                    new_events.append(make_event(lid, "confidence_drop", f"Confidence dropped from {int(prev_conf)} to {int(cur_conf)}.", {"confidence": prev_conf}, {"confidence": cur_conf}))
                elif cur_conf - prev_conf >= 25:
                    new_events.append(make_event(lid, "confidence_rise", f"Confidence rose from {int(prev_conf)} to {int(cur_conf)}.", {"confidence": prev_conf}, {"confidence": cur_conf}))

    if new_events:
        event_log.extend(new_events)

    save_watch_state(watch_state)
    save_event_log(event_log)
    save_snapshots(snapshots)

    return {
        "checked": checked,
        "events_created": len(new_events),
        "off_market_detected": off_market_detected,
        "blocked_detected": blocked_detected,
        "ts": now_iso(),
    }


def latest_alerts() -> dict:
    events = list(reversed(load_event_log()))
    active_alerts = events[:50]
    critical_count = sum(1 for e in active_alerts if e.get("severity") == "critical")
    high_count = sum(1 for e in active_alerts if e.get("severity") == "high")
    off_market_count = sum(1 for e in active_alerts if e.get("event_type") == "listing_off_market")
    source_missing_count = sum(1 for e in active_alerts if e.get("event_type") == "source_missing")
    blocked_count = sum(1 for e in active_alerts if e.get("event_type") == "access_blocked")
    return {
        "ok": True,
        "total_events": len(events),
        "critical_count": critical_count,
        "high_count": high_count,
        "off_market_count": off_market_count,
        "source_missing_count": source_missing_count,
        "blocked_count": blocked_count,
        "active_alerts": active_alerts,
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND), **kwargs)

    def log_message(self, fmt, *args):
        sys.stdout.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), fmt % args))

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        super().end_headers()

    def _json(self, payload, code: int = 200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _text(self, text: str, code: int = 200, content_type: str = "text/plain; charset=utf-8"):
        body = text.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0:
            return {}
        raw = self.rfile.read(content_length).decode("utf-8")
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        payload = load_payload()

        if path == "/api/health":
            return self._json({"ok": True, "now": now_iso()})

        if path == "/api/status":
            return self._json({
                "ok": True,
                "mode": payload.get("mode", "seed"),
                "generated_at": payload.get("generated_at"),
                "generated_at_label": payload.get("generated_at_label"),
                "count": len(payload.get("listings", [])),
                "signature": payload.get("signature"),
            })

        if path == "/api/feed":
            return self._json(payload)

        if path == "/api/agents":
            rows = list(payload.get("agent_summary", []))
            rows.sort(key=lambda row: (row.get("credibility_score", 0), row.get("interactions", 0)), reverse=True)
            return self._json({"ok": True, "count": len(rows), "items": rows})

        if path == "/api/inquiries":
            rows = load_inquiries()
            listing_id = (query.get("listing_id", [""])[0] or "").strip()
            if listing_id:
                rows = [row for row in rows if row.get("listing_id") == listing_id]
            rows.sort(key=lambda row: row.get("timestamp", ""), reverse=True)
            return self._json({"ok": True, "count": len(rows), "items": rows})

        if path == "/api/alerts":
            return self._json(latest_alerts())

        if path == "/api/watch-state":
            return self._json({"ok": True, "items": load_watch_state()})

        if path == "/api/event-log":
            items = list(reversed(load_event_log()))
            event_type = (query.get("event_type", [""])[0] or "").strip()
            if event_type:
                items = [row for row in items if row.get("event_type") == event_type]
            total = len(items)
            limit = max(1, min(parse_int(query.get("limit", [30])[0], 30), 200))
            offset = max(0, parse_int(query.get("offset", [0])[0], 0))
            paged = items[offset: offset + limit]
            return self._json({"ok": True, "total": total, "offset": offset, "limit": limit, "items": paged})

        if path == "/api/snapshots":
            items = list(reversed(load_snapshots()))
            limit = max(1, min(parse_int(query.get("limit", [50])[0], 50), 200))
            return self._json({"ok": True, "count": min(len(items), limit), "items": items[:limit]})

        if path == "/api/listings":
            items = list(payload.get("listings", []))
            return self._json({"ok": True, "count": len(items), "items": items})

        if path.startswith("/api/listings/"):
            listing_id = unquote(path.split("/api/listings/", 1)[1]).strip("/")
            item = find_listing(payload, listing_id)
            if not item:
                return self._json(*json_error("listing not found", 404))
            return self._json({"ok": True, "item": item})

        if path == "/":
            self.path = "/index.html"
            return super().do_GET()

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        payload = load_payload()

        if path == "/api/refresh":
            proc = run_refresh()
            if proc.returncode != 0:
                return self._json({"ok": False, "stdout": proc.stdout.strip(), "stderr": proc.stderr.strip()}, 500)
            fresh = load_payload()
            return self._json({
                "ok": True,
                "generated_at": fresh.get("generated_at"),
                "generated_at_label": fresh.get("generated_at_label"),
                "count": len(fresh.get("listings", [])),
                "signature": fresh.get("signature"),
            })

        if path == "/api/inquiries":
            data = self._read_json_body()
            inquiry = sanitize_inquiry(data)
            if not inquiry["listing_id"]:
                return self._json(*json_error("listing_id is required", 400))
            if not find_listing(payload, inquiry["listing_id"]):
                return self._json(*json_error("listing_id not found", 404))
            inquiries = load_inquiries()
            inquiry["id"] = f"inq_{len(inquiries) + 1}"
            inquiry["timestamp"] = now_iso()
            inquiries.append(inquiry)
            save_inquiries(inquiries)
            proc = run_refresh()
            if proc.returncode != 0:
                return self._json({"ok": False, "error": "saved inquiry but refresh failed", "stderr": proc.stderr.strip()}, 500)
            return self._json({"ok": True, "item": inquiry}, 201)

        if path == "/api/watch-state":
            data = self._read_json_body()
            lid = str(data.get("listing_id") or "").strip()
            if not lid:
                return self._json(*json_error("listing_id is required", 400))
            if not find_listing(payload, lid):
                return self._json(*json_error("listing_id not found", 404))
            watch_state = load_watch_state()
            state = dict(watch_state.get(lid, {}))
            state["listing_id"] = lid
            state["watching"] = parse_bool(data.get("watching"), True)
            watch_state[lid] = state
            save_watch_state(watch_state)
            return self._json({"ok": True, "listing_id": lid, "watching": state["watching"]})

        if path == "/api/collect":
            summary = collect_sources(payload)
            return self._json({"ok": True, "collection": summary})

        return self._json(*json_error("unknown endpoint", 404))

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/inquiries/"):
            inquiry_id = unquote(path.split("/api/inquiries/", 1)[1]).strip("/")
            inquiries = load_inquiries()
            remaining = [row for row in inquiries if row.get("id") != inquiry_id]
            if len(remaining) == len(inquiries):
                return self._json(*json_error("inquiry not found", 404))
            save_inquiries(remaining)
            proc = run_refresh()
            if proc.returncode != 0:
                return self._json({"ok": False, "error": "deleted inquiry but refresh failed", "stderr": proc.stderr.strip()}, 500)
            return self._json({"ok": True, "deleted_id": inquiry_id})
        return self._json(*json_error("unknown endpoint", 404))


if __name__ == "__main__":  # pragma: no cover
    ensure_data_files()
    port = 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Serving Santa Fe CI Elite on http://127.0.0.1:{port}")
    server.serve_forever()
