# Scoring Engine v2 — Change Summary

**Implementation date:** March 2026  
**Files changed:** `scoring_engine_v2.py` (new), `intelligence.py`, `operator_engine.py`, `scraper.py`

---

## What Changed at a Glance

| Dimension | v1 | v2 |
|---|---|---|
| Score framework | Flat heuristics: value_score, leverage_score, confidence_score, ghost_probability | Four explicit domains: **quant / qual / action / offer** |
| Comparable reference | Same-tower only (same building + beds) | **Blended same-tower + cross-tower** (all buildings, same beds) |
| BV access_blocked | Applied -2 operator penalty (W_BV_BLOCKED) | **Neutral — zero delta** to qual, action, and operator score |
| BV active | Flat +18 operator bonus | **+12 qual × confidence + +15 action × confidence** |
| BV not_found / off_market | Flat -30 operator penalty | **-20 qual × confidence + -35 action × confidence + hard floor ≤ 8** |
| Listing ranking | `value_score + confidence × 0.2 + …` | `composite_score (quant×0.6 + qual×0.4) + action_score × 0.2 + …` |
| Operator score | Weighted sum of raw value/leverage/confidence | Routes through `action_score` (pre-integrated BV + quant + qual) |
| Negotiation priority | Leverage + confidence thresholds | Routes through `offer_score` (v2) with same thresholds |
| Pricing anchors | Fixed ±4% of same-tower median | **Offer-score-driven anchor pct** (higher leverage → more aggressive open); ±3.5–4% of blended reference |
| Predictive signals | Ad-hoc formulas using same-tower delta | `quant_score` and `qual_score` as primary inputs; BV neutral-blocked |
| Model type field | `"rule_based_v2"` | `"rule_based_v2"` (unchanged) |

---

## New Score Dimensions

### `quant_score` (0–100)
Quantitative price signal.  
**Inputs:** price vs blended reference (same-tower + cross-tower), days on market, price cuts, source trust haircut on anomalous prices.  
**High = below-market or strong value signal.**

### `qual_score` (0–100)
Qualitative credibility layer.  
**Inputs:** source trust, availability state, inquiry proof score, contradictions, browser verification outcome, staleness, social source penalty.  
**High = reliable, verifiable listing.**  
BV policy applied here: active → +12 × confidence weight; blocked → 0; gone → -20 × confidence weight.

### `action_score` (0–100)
Operator decision driver.  
**Inputs:** quant × 0.55 + qual × 0.45, ghost probability drag, BV signed delta.  
**High = urgent renter action warranted.**  
BV policy: active → +15 × conf; blocked → 0; gone → -35 × conf (with hard floor ≤ 8 when conf ≥ 75).

### `offer_score` (0–100)  _(replaces leverage_score semantically)_
Negotiation positioning layer.  
**Inputs:** days on market × 0.85, overpricing vs blended reference × 0.65, price cuts × 9, BV adjustment, ghost drag.  
**High = renter has strong negotiating leverage.**  
BV active → slight offer reduction (-5 × conf, confirmed live listing reduces seller pressure).  
BV gone → offer floored to 5 (leverage is moot).

### `composite_score` (0–100)  _(replaces value_score as primary ranking signal)_
Quant × 0.6 + qual × 0.4 − ghost × 0.25.  
Used for: `sort_targets`, `tower_summary.best_value_id`, `market_summary.top_targets`.

---

## Same-Tower vs Cross-Tower Comparables

v1 used only same-tower medians (same building + same beds).  When a building-bedroom group had only 1–2 listings the median was noisy.

v2 blends in a cross-tower median (all buildings, same beds) using a confidence-weighted interpolation:

| Same-tower credible comps | Same-tower weight | Cross-tower weight |
|---|---|---|
| ≥ 3 | 100 % | 0 % |
| 2 | 60 % | 40 % |
| ≤ 1 | 35 % | 65 % |

This means:
- Thick same-tower groups (Peninsula 2BR: 4 comps) → same-tower dominant, unchanged from v1
- Thin groups (Paradox penthouse: 1 comp) → heavily anchored to cross-tower market reference, tighter fair band, more reliable anchors

New fields added to `pricing` block:
- `blended_reference_price` — the interpolated reference used for all delta calculations
- `same_tower_median_price` — same as v1 `peer_group.median_price`
- `cross_tower_median_price` — market-wide reference for same bedroom count
- `same_tower_credible_comps` — comps with source trust ≥ 40
- `cross_tower_credible_comps` — market-wide credible comp count

---

## Browser Verification Policy Change (Most Impactful)

**v1 problem:** `access_blocked` (Cloudflare/portal firewall) applied `W_BV_BLOCKED = -2.0` to the operator score. Because 8 of 10 verified listings are blocked by Cloudflare on inmuebles24.com, this systematically penalised the majority of the portfolio for a reason unrelated to availability.

**v2 fix:** `access_blocked` and `verification_blocked` result in **zero delta** across qual, action, and operator scores. The signal communicates nothing about availability — it only tells us the portal has bot protection.

**BV outcome → score impact matrix:**

| BV result | qual delta | action delta | operator | ghost |
|---|---|---|---|---|
| `active` | +12 × conf/100 | +15 × conf/100 | positive (via action_score) | -20 × conf/100 |
| `access_blocked` | **0** | **0** | **0** | **0** |
| `verification_blocked` | **0** | **0** | **0** | **0** |
| `not_found` | -20 × conf/100 | -35 × conf/100 | negative (via action_score) | +28 × conf/100 |
| `off_market` | -20 × conf/100 | -35 × conf/100 | negative | +28 × conf/100 |
| `redirected_off_market` | -20 × conf/100 | -35 × conf/100 | negative | +28 × conf/100 |
| none / uncertain / queued | 0 | 0 | 0 | 0 |

**Hard floor:** when BV confirms gone (any gone status) with confidence ≥ 75%, qual is capped at 20 and action is capped at 8 regardless of other signals.

---

## Operator Engine Changes

`operator_score()` in `operator_engine.py` now delegates to `operator_score_v2()` from `scoring_engine_v2.py`.  v2 uses `action_score` as the primary driver (which already incorporates BV, quant, and qual integration) rather than rebuilding a weighted sum of raw signals.

`bv_adjusted_negotiation_priority()` now delegates to `negotiation_priority_v2()`, which reads `offer_score` (not `leverage_score` directly) and `qual_score` (not `confidence_score` directly) — same numeric values via v1-compatible aliases, but the naming is now semantically correct.

**compute_action** reads `composite_score` → `value_s`, `qual_score` → `confidence_s`, `offer_score` → `leverage_s`, `action_score` → `action_s` when v2 fields are present.  Falls back to v1 names when running without v2.

`scoring_weights` in the operator response now includes:
- `engine_version` — "v2" or "v1"
- `bv_blocked_policy` — "neutral" (v2) or "slight_penalty" (v1)
- `bv_active_policy`, `bv_gone_policy` — policy descriptions
- `comp_reference` — "blended_same_cross_tower" (v2) or "same_tower_only" (v1)

---

## Fields Added (Additive — Frontend Unchanged)

All new fields are additive.  All v1 field names (`value_score`, `leverage_score`, `confidence_score`, `ghost_probability`, `delta_to_peer_price_pct`, etc.) are preserved as aliases that carry identical or improved values.

### `intel.scores` new keys:
- `quant_score` — quantitative price-signal score
- `qual_score` — qualitative credibility score  
- `action_score` — operator decision score
- `offer_score` — negotiation leverage score
- `composite_score` — blended ranking score
- `engine_version` — "v2"
- `quant_components` — score breakdown dict for debugging
- `qual_components` — score breakdown dict for debugging
- `bv_adjustment` — BV outcome, confidence, deltas applied, policy

### `intel.pricing` new keys:
- `blended_reference_price`
- `same_tower_median_price`
- `cross_tower_median_price`
- `same_tower_credible_comps`
- `cross_tower_credible_comps`

### `intel.predictive` changed:
- `model_type` now returns `"rule_based_v2"` (was already `"rule_based_v2"` in v1 — unchanged string)

### Operator response new keys per item:
- `composite_score`, `quant_score`, `qual_score`, `action_score`, `offer_score`, `engine_version`

---

## Fields Changed in Value (Same Key, Different Formula)

| Field | v1 formula | v2 formula |
|---|---|---|
| `value_score` | Ad-hoc: `55 - delta_psqm*0.8 + dom*0.25 + cuts*4` | Alias for `composite_score` (quant×0.6 + qual×0.4 - ghost×0.25) |
| `leverage_score` | `15 + dom*0.8 + delta*0.6 + cuts*8` | Alias for `offer_score` (dom×0.85 + delta×0.65 + cuts×9 ± BV) |
| `confidence_score` | `trust*0.7 ± proof*0.5 ± contradictions*8` | Alias for `qual_score` (trust*0.75 ± avail ± proof*0.18 ± BV) |
| `ghost_probability` | Same formula + no BV-blocked penalty | Same formula + explicit BV-active reduction (-20×conf) and BV-gone boost (+28×conf); access_blocked = 0 |
| `delta_to_peer_price_pct` | vs same-tower median only | vs blended (same + cross) reference |
| `opening_anchor` | Fixed percentage of listing price | Scaled by `offer_score` (higher leverage → more aggressive open) |
| `fair_low/fair_high` | ±4% of same-tower median | ±3.5–4% of blended reference |
| `price_cut_probability_14d` | Ad-hoc: `10 + delta*1.3 + dom*0.6 + cuts*8` | `8 + delta*1.4 + dom*0.55 + cuts*9` (slightly recalibrated) |
| `availability_probability_7d` | `85 - ghost*0.55 ± avail ± BV` | Same structure; BV-blocked = 0 delta (was implicit penalty via ghost) |

---

## Architecture: BV Data Flow Fix

In v1, `browser_verification` was attached to listings **after** `enrich_payload()` ran, so the scoring engine never saw it.  The operator engine read BV from listings post-enrichment only for the operator score computation — the core intel scores (ghost, confidence, value, leverage) did not use BV at all.

v2 fixes this in `scraper.py`: minimal BV fields (`result_status`, `confidence`) are pre-injected into seed listings **before** `enrich_payload()` is called, so `compute_scores_v2()` has access to BV outcomes during score computation.  The full BV summary (page_signals, notes, evidence_count, etc.) is still re-attached post-enrichment as before.

---

## Backwards Compatibility

- All existing API endpoints return identical structures with additive fields.
- Frontend JavaScript reads `value_score`, `leverage_score`, `confidence_score`, `ghost_probability`, `delta_to_peer_price_pct`, `fair_low`, `fair_high`, `opening_anchor`, `target_close`, `walk_away` — all preserved.
- `intel.status` keys (`verify`, `anchor`, `fast_move`, `negotiate`, `watch`) are unchanged.
- `model_type` = `"rule_based_v2"` unchanged.
- `scoring_engine_v2.py` is imported with a try/except — if the file is missing, all modules fall back to v1 behavior automatically.
