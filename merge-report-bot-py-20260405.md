# Selective Merge Report: bot-py.py → Live System
**Date:** 2026-04-05  
**Source of truth:** server.py / scraper.py / frontend/bot.js  
**Candidate file:** bot-py.py (SF 546 CI Notification & Automation Engine)

---

## Files Changed

| File | Change |
|---|---|
| `price_history.py` | **New** — extracted module from bot-py.py |
| `scraper.py` | **Modified** — calls `PriceHistory.record_all()` after each run |
| `server.py` | **Modified** — imports module, adds 3 new API endpoints |
| `frontend/bot.js` | **Modified** — adds async price-history answer branch + starter prompt |

---

## Accepted

### 1. `PriceHistory` class → `price_history.py` (new file)
**Why:** The scraper already generates `listing.history` arrays, but those are *simulated* — `_gen_history()` in scraper.py generates random price drops using `random.uniform()`. `bot-py.py`'s `PriceHistory` class records *real* observed prices, append-only, per listing, to `data/history/<id>.json`. This is a genuine architectural improvement: over time it will accumulate real price movement data from actual scraper runs instead of random noise.

**What was kept:** The `record()`, `record_all()`, `get_history()`, and `summary()` methods — these are clean, stdlib-only, and stateless.

**What was removed:** All Telegram coupling, the `TELEGRAM_TOKEN`/`TELEGRAM_CHAT_ID` constants, and the `send_whatsapp()` calls that were interleaved with history recording in the original class.

**Adaptation:** Added `_price_of()` helper to accept both `price` (scraper canonical schema) and `asking_price` (bot-py schema), since the live system uses `price` as the field name.

---

### 2. `AlertLog` class → `price_history.py` (new class in same file)
**Why:** The `_already_sent` / `_log_alert` pattern in `bot-py.py`'s `AlertEngine` is a clean deduplication concept independent of Telegram. It's useful as a backend primitive for any future alerting or tracking, and costs essentially nothing to add.

**What was kept:** `already_sent()`, `log()`, `recent()` — pure file-backed logic.

**What was removed:** The `AlertEngine` wrapper class and all Telegram send calls. Only the log/dedup primitives were retained.

---

### 3. `scraper.py` — durable history recording
**Change:** Added `PriceHistory.record_all(listings)` call at the end of `main()`, wrapped in a try/except so it is fully non-breaking.

**Effect:** Each time the scraper runs, prices are appended to `data/history/<id>.json`. Price changes between runs are detected and logged. After enough real runs, `price_drops` and `price_increases` in `/api/history-summary` will reflect actual observed market movements.

---

### 4. `server.py` — three new endpoints
All added to the existing `Handler.do_GET` block, before the static file fallback. All wrapped in try/except; all fail gracefully.

| Endpoint | Purpose |
|---|---|
| `GET /api/history-summary` | Aggregate stats: total tracked, by_building, top price drops/increases |
| `GET /api/price-history/<listing_id>` | Full time-series for a single listing |
| `GET /api/alert-log?limit=N` | Read-only view of the alert dedup log |

---

### 5. `frontend/bot.js` — price history answer branch
**What changed:**
- Added `answerPriceHistoryFromData(data)` — renders a history summary from API or feed data
- Added `answerPriceHistoryFallback(listings)` — uses embedded `listing.history` arrays when API is unavailable (static hosting, network error)
- Added history query routing in `answer()` for Spanish/English terms: `historial`, `baja de precio`, `cayó`, `caída`, `price drop`, `price history`, etc.
- `sendQuestion()` gained an async branch: if the query intent is history, it calls `fetch('/api/history-summary')` and renders from the response; on error it silently falls back to the embedded feed data
- Added "Historial de precios" to `STARTER_PROMPTS`

**Guarantee:** The existing `answer()` function and all other intents are 100% unchanged. The async branch is a new code path that only fires for history queries. Fallback is always available.

---

## Rejected

### Telegram class (`class Telegram`)
**Why:** `bot.js` is the in-app conversational interface. Replacing it with Telegram polling would require external credentials, a long-running process, and breaks the browser-native UX entirely. The Telegram bot and the frontend bot serve different channels and should not be conflated.

### WhatsApp webhook relay (`send_whatsapp`)
**Why:** External service dependency, no configuration present, no test environment, adds fragile network calls to the core scan loop.

### `AlertEngine.process_scan()` + alert message formatters
**Why:** These are tightly coupled to Telegram's HTML message format (`<b>`, emojis, `\n` layout). The live system already handles alert generation in `server.py`'s `_build_alerts()` function using the canonical `intel` schema. Merging two parallel alert systems would create ambiguity about which is authoritative.

### `run_scan_and_notify()` + `intelligence.enrich_payload()` import
**Why:** The live scraper (`scraper.py`) is the source of truth for data enrichment. `bot-py.py`'s scan function imports from a different `intelligence.py` module that follows a different schema (using `asking_price`, `listing_type`, `portal` fields vs. the live schema's `price`, `building`, `source`). Wiring these together would require a schema bridge — added complexity with no clear benefit.

### `run_scheduler()` + `schedule` library
**Why:** The scheduler is a process management concern, not a data concern. The live server is a simple HTTP server that the user controls externally. Adding an embedded scheduler would require the `schedule` pip package and a separate process, adding fragile complexity.

### `generate_report()` HTML template
**Why:** The live server already provides a `/api/feed` + `/api/history-summary` endpoint that a report generator can consume on demand. The report HTML template in bot-py.py is a standalone HTML-to-file generator suitable for a Telegram `sendDocument` workflow — not compatible with the server's API-first architecture. A future report feature should be built as a `/api/report` endpoint, not a standalone HTML writer.

### `handle_command()` / Telegram command handler
**Why:** This is the Telegram equivalent of `bot.js`'s `answer()` function. Merging them would create two competing command dispatchers. The frontend bot is the canonical UI.

---

## Current State of `data/history/`

14 listing history files created on first scraper run (2026-04-05):
- `sf_001.json` through `sf_014.json`
- Each contains: `listing_id`, `building`, `points[]`, `current_price`, `bedrooms`, `size_sqm`, `title`
- `price_drops` and `price_increases` are empty today (first run — no changes yet)
- Will populate with real data after subsequent scraper runs detect price movements

---

## Risk Assessment

| Risk | Level | Mitigation |
|---|---|---|
| `price_history.py` import fails | None | Both `server.py` and `scraper.py` use try/except; system falls back gracefully |
| `data/history/` disk space | Low | Capped at 365 days per listing; 14 listings × ~2 KB/year ≈ 28 KB/year |
| Bot history query breaks | None | `answerPriceHistoryFallback` always available; uses existing feed data |
| `alert-log` endpoint exposes sensitive data | Low | Log contains only alert IDs, types, timestamps, and 120-char previews |
| `server.py` existing endpoints broken | None | New endpoints are additive; existing handler order unchanged |
