# Santa Fe CI — Canonical Schema Normalization Report

**Date:** 2026-04-05  
**Status:** Complete  
**Deployed:** https://www.perplexity.ai/computer/a/santa-fe-ci-real-estate-intell-dfWoe4.8QoWfi6cgjb3rxQ

---

## Files Changed

| File | Change |
|---|---|
| `scraper.py` | Rewritten — fixed path resolution, emits full canonical schema, syncs 3 output files |
| `server.py` | Rewritten — fixed path resolution, correct API endpoints, serves canonical feed |
| `frontend/app.js` | Removed legacy `listings.live.json` root path from fallback list |
| `frontend/index.html` | Updated script version strings to bust cache (`?v=20260405-canonical`) |
| `data/listings.live.json` | Regenerated — canonical shape (was: rich intel schema, now: verified consistent) |
| `frontend/data.json` | Regenerated — synced from `data/listings.live.json` via scraper |
| `listings.live.json` | Regenerated — now a canonical alias (was: simpler legacy shape, 23KB, no intel) |
| `CANONICAL_SCHEMA.md` | New — authoritative schema definition document |

---

## The Canonical Schema

### Listing Object (top-level fields)

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique listing ID |
| `building` | string | Slug: `peninsula`, `torre300`, `paradox` |
| `beds` | int | Bedrooms |
| `baths` | int | Bathrooms |
| `parking` | int | Parking spaces |
| `sqm` | number | Area in m² |
| `price` | number | Monthly rent MXN |
| `price_per_sqm` | number | **Computed** — price / sqm |
| `title` | string | Display title |
| `description` | string | Optional description |
| `furnished` | boolean | |
| `floor` | string | Floor description |
| `source` | string | Listing URL |
| `amenities` | string[] | Amenity list |
| `history` | `{date, price}[]` | Price history |
| `first_seen_at` | ISO string | First appearance date |
| `last_seen_at` | ISO string | Last seen date |
| `days_on_market` | int | **Computed** from `first_seen_at` |
| `agent_name` | string | Agent's name |
| `agent_company` | string | Agent's company |
| `source_profile` | object | Optional source metadata |
| `browser_verification` | object | Optional |
| `watch_state` | string | Optional tracking state |
| `negotiation_timeline` | array | Optional |
| `intel` | object | **Intelligence sub-object** |

### Intel Sub-object

```
intel.scores:
  composite_score     0-100
  value_score         0-100
  confidence_score    0-100
  leverage_score      0-100
  action_score        0-100
  offer_score         0-100
  qual_score / quant_score
  ghost_probability   0-1
  engine_version      string

intel.status:
  key     negotiate | watch | avoid
  label   display string
  tone    high | mid | low

intel.pricing:
  fair_low / fair_high
  opening_anchor / target_close / walk_away
  blended_reference_price
  price_per_sqm / delta_to_peer_price_pct / delta_to_peer_psqm_pct
  same_tower_median_price / cross_tower_median_price
  peak_price / price_cuts

intel.primary_angle        string
intel.battle_card          string[]
intel.comparable_ids       string[]
intel.flags                string[]
intel.peer_group           { median_price_per_sqm, count }
intel.building_context     { median_price_per_sqm }
```

### Feed Envelope

```
generated_at, generated_at_label, mode, signature, notes
listings[]
buildings{}      keyed by building slug
tower_summary{}  keyed by building slug
market_summary{}
events[]
agent_summary{}
```

---

## Deprecated Fields Removed

| Legacy field | Canonical replacement |
|---|---|
| `listedAt` | `first_seen_at` |
| `metrics.leverageScore` | `intel.scores.leverage_score` |
| `metrics.daysOnMarket` | `days_on_market` |
| `metrics.priceAdvantagePct` | `intel.pricing.delta_to_peer_price_pct` |
| `agent.name` | `agent_name` |
| `agent.company` | `agent_company` |
| `agent.grade / responseHours / ghostIncidents` | (removed — not in canonical) |
| `verification.*` | `browser_verification.*` |

---

## Frontend/Bot Mappings (canonical field access)

### app.js

| Feature | Canonical field(s) |
|---|---|
| Search | `l.title`, `l.id`, `l.building`, `l.price`, `l.agent_name` |
| Filter (negotiate) | `l.intel.status.key === 'negotiate'` |
| Sort by leverage | `l.intel.scores.leverage_score` |
| Sort by composite | `l.intel.scores.composite_score` |
| Sort by DOM | `l.days_on_market` |
| Card display | `l.price_per_sqm`, `l.days_on_market`, `l.beds`, `l.baths`, `l.sqm`, `l.parking`, `l.furnished` |
| Score bars | `l.intel.scores.value_score`, `.confidence_score`, `.leverage_score`, `.composite_score` |
| Negotiation band | `l.intel.pricing.fair_low`, `.target_close`, `.walk_away` |
| Leverage panel | `l.intel.scores.leverage_score`, `l.days_on_market`, `l.price_per_sqm` |
| Detail meta | `l.price`, `l.sqm`, `l.price_per_sqm`, `l.beds`, `l.days_on_market`, `l.id` |
| Agent builder | `l.agent_name`, `l.agent_company`, `l.intel.scores.confidence_score` |
| Market chart | `l.price_per_sqm`, `l.days_on_market`, `l.intel.scores.composite_score` |
| Dashboard | `l.intel.scores.composite_score`, `.leverage_score`, `l.days_on_market`, `l.price_per_sqm` |
| Fallback paths | `./data.json`, `../data/listings.live.json` (root alias removed) |

### bot.js

| Feature | Canonical field(s) |
|---|---|
| Best opportunity | `listingScores(l).composite_score`, `listingScores(l).leverage_score` |
| Status display | `listingStatus(l).key`, `.label`, `.tone` |
| Metric cards | `l.price_per_sqm`, `l.days_on_market`, `l.sqm`, `l.beds`, `l.furnished` |
| Score display | `listingScores(l).composite_score`, `.confidence_score`, `.leverage_score` |
| Market summary | `window.marketSummary.median_price_per_sqm`, `.avg_price_per_sqm`, `.negotiate_count` |
| Tower summary | `window.towerSummary[slug].median_price_per_sqm`, `.median_days_on_market` |
| Data access | `window.listingsData`, `window.marketSummary`, `window.towerSummary`, `window.currentListing` |

---

## Architecture After Normalization

```
data/listings.seed.json    ← source seed (14 listings, no intel)
         │
         ▼  python3 scraper.py
data/listings.live.json    ← canonical source of truth
         │
         ├── frontend/data.json     ← static frontend copy (synced by scraper)
         └── listings.live.json     ← root alias (synced by scraper)
                  │
                  ▼  python3 server.py → GET /api/feed
         frontend/app.js            ← reads canonical fields only
                  │
                  ▼  window.listingsData / window.marketSummary / etc.
         frontend/bot.js             ← reads via window globals, canonical only
```

---

## What Was NOT Changed

- All existing product features preserved (filtering, sorting, map, tracking, dashboard, compare, operator, agents views)
- Bot.js already consumed canonical fields — no logic changes needed
- No CSS changes required
- No HTML structural changes (only version string cache-bust)
