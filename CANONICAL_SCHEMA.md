# Santa Fe CI — Canonical Listing Schema

**Version:** 2.0  
**Effective:** 2026-04-05  
**Source of truth:** `data/listings.live.json`

---

## Feed Envelope

```json
{
  "generated_at": "<ISO-8601 string>",
  "generated_at_label": "<human label, optional>",
  "mode": "live | demo | seed",
  "signature": "<optional>",
  "notes": "<optional>",
  "listings": [ /* array of Listing */ ],
  "buildings": { /* keyed by building slug */ },
  "tower_summary": { /* keyed by building slug */ },
  "market_summary": { /* MarketSummary object */ },
  "events": [ /* EventItem[] */ ],
  "agent_summary": { /* keyed by agent slug */ }
}
```

---

## Listing Object

All fields are **required** unless marked optional.

```json
{
  "id": "string — unique listing identifier (e.g. 'p1', 't300-3')",
  "building": "string — building slug (e.g. 'peninsula', 'torre300', 'paradox')",
  "beds": "integer",
  "baths": "integer",
  "parking": "integer",
  "sqm": "number — area in square meters",
  "price": "number — monthly rent in MXN",
  "price_per_sqm": "number — price / sqm, computed",
  "title": "string — short display title",
  "description": "string — optional longer description",
  "furnished": "boolean",
  "floor": "string — floor description (optional)",
  "source": "string — URL of original listing",
  "amenities": ["string"],
  "history": [
    { "date": "YYYY-MM-DD", "price": "number" }
  ],
  "first_seen_at": "ISO-8601 datetime string",
  "last_seen_at": "ISO-8601 datetime string",
  "days_on_market": "integer — computed from first_seen_at",
  "agent_name": "string",
  "agent_company": "string",
  "source_profile": "object — optional source metadata",
  "browser_verification": "object — optional",
  "watch_state": "string — optional (watching|ignored|...)",
  "negotiation_timeline": "array — optional",
  "intel": {
    "scores": {
      "composite_score": "number 0-100",
      "value_score": "number 0-100",
      "confidence_score": "number 0-100",
      "leverage_score": "number 0-100",
      "action_score": "number 0-100",
      "offer_score": "number 0-100",
      "qual_score": "number 0-100",
      "quant_score": "number 0-100",
      "ghost_probability": "number 0-1",
      "engine_version": "string",
      "bv_adjustment": "number",
      "qual_components": "object",
      "quant_components": "object"
    },
    "status": {
      "key": "string — e.g. 'negotiate', 'watch', 'avoid'",
      "label": "string — display label",
      "tone": "string — 'high'|'mid'|'low'"
    },
    "pricing": {
      "fair_low": "number",
      "fair_high": "number",
      "opening_anchor": "number",
      "target_close": "number",
      "walk_away": "number",
      "blended_reference_price": "number",
      "price_per_sqm": "number",
      "delta_to_peer_price_pct": "number",
      "delta_to_peer_psqm_pct": "number",
      "same_tower_median_price": "number",
      "cross_tower_median_price": "number",
      "same_tower_credible_comps": "number",
      "cross_tower_credible_comps": "number",
      "peak_price": "number",
      "price_cuts": "number"
    },
    "primary_angle": "string — optional negotiation narrative",
    "battle_card": ["string — key negotiation points"],
    "comparable_ids": ["string — IDs of comparable listings"],
    "script": "object — optional conversation script",
    "counterparty_playbook": "object — optional",
    "flags": ["string — risk/quality flags"],
    "peer_group": {
      "median_price_per_sqm": "number",
      "count": "number"
    },
    "building_context": {
      "median_price_per_sqm": "number"
    },
    "availability": "object — optional",
    "canonical_unit_key": "string — optional",
    "duplicate_candidates": ["string"],
    "predictive": "object — optional",
    "required_proof": ["string"]
  }
}
```

---

## DEPRECATED / REMOVED Fields

These legacy fields are no longer emitted and should NOT be referenced:

| Legacy field | Replacement |
|---|---|
| `listedAt` | `first_seen_at` |
| `metrics.leverageScore` | `intel.scores.leverage_score` |
| `metrics.daysOnMarket` | `days_on_market` |
| `metrics.priceAdvantagePct` | `intel.pricing.delta_to_peer_price_pct` |
| `agent.name` | `agent_name` |
| `agent.company` | `agent_company` |
| `agent.grade` / `agent.responseHours` / etc. | (in agent_summary feed key) |
| `verification.*` | `browser_verification.*` |

---

## Rules

1. `scraper.py` — writes to `data/listings.live.json` using the canonical schema.
2. `server.py` — reads from `data/listings.live.json` and serves `/api/feed` (full canonical feed) and `/api/top-deals` (sorted listings slice).
3. `frontend/app.js` — reads ONLY canonical fields. No legacy field fallbacks.
4. `frontend/bot.js` — reads from `window.listingsData`, `window.marketSummary`, `window.towerSummary` (set by app.js).
5. `frontend/data.json` — must be kept in sync with `data/listings.live.json`.
