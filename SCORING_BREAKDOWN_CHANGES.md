# Scoring Breakdown UI — Change Summary
**Date:** 2026-03-24  
**Engine:** scoring-engine-v2 fields  
**Files changed:** `frontend/app.js`, `frontend/platform.css`, `frontend/index.html`

---

## What was built

### 1. `renderScoreBreakdownSection()` — Drawer (primary)
Replaces the old 4-card "Scores de inteligencia" mini-grid with a full scoring breakdown section titled **"Análisis de score — Motor v2"**.

**Structure:**
- **Header**: Section title + composite score ring (color-coded: green ≥70, amber ≥45, red <45)
- **Benchmarks de precio**: Three clearly labeled reference cells:
  - `● MISMO EDIFICIO` — same building + bedrooms median, credible comp count
  - `● CROSS-TOWER` — all buildings, same bedrooms, credible comp count
  - `● REFERENCIA MEZCLADA [blend]` — blended reference with Δ% vs listing price and human-readable blend explanation (e.g. "60 % mismo edificio + 40 % cross-tower — muestra reducida (2 mismo edificio)")
  - Furnished note shown when `listing.furnished === 'furnished'`
- **Five score dimensions** (each with: name, colored score badge, color-filled progress bar, plain-language explanation):
  - **Quant** — price/m² delta vs blended reference, DOM contribution, price cut contribution
  - **Qual** — source trust level, availability state (with truth tier label pill), proof score, contradictions, BV policy explained (v2 neutral rule called out explicitly)
  - **Action** — urgency tier label + ghost warning if applicable + BV action delta
  - **Offer / Palanca** — leverage tier + DOM/cut reinforcement
  - **Ghost risk** — plain risk level with recommendation
- **Browser verify summary** — colored dot + policy label + confidence %
- **Jerarquía de señales** — compact truth hierarchy chain:
  `Browser activo › Browser inactivo › HTTP activo › Broker declara › Bloqueado/desconocido › 404/retirado › Contradicción`

### 2. `renderScoreHintCell()` — Table (secondary)
New **SCORE** column added to the listings table. Shows:
- Composite score number (color-matched to tier)
- Δ% vs blended reference (▲ green below market, ▼ red above market)
- Minimal pill format — doesn't compete with existing score bars

### 3. Support functions added to `app.js`
- `scoreColor(val, invert)` — returns green/amber/red hex for any score
- `scoreTier(val, invert)` — returns tier class string
- `TRUTH_HIERARCHY[]` — ordered array of 10 availability signal states with label, rank, CSS class
- `truthLabel(key)`, `truthClass(key)` — lookup helpers
- `blendNoteHuman(...)` — converts blend_note string to plain Spanish explanation with comp counts and thinness warnings
- `quantExplanation(qc, score, dom, priceCuts)` — human-readable quant narrative
- `qualExplanation(qc, bvAdj)` — qual narrative with inline truth-tier pill for availability state
- `actionExplanation(scores, bvAdj)` — urgency narrative
- `offerExplanation(scores, pricing, dom, priceCuts)` — leverage narrative

### 4. CSS added to `platform.css`
New blocks:
- `.sbd-section`, `.sbd-header`, `.sbd-title` — section container + header
- `.sbd-composite` + tier variants (`.tier-high/mid/low`) — composite score ring
- `.sbd-refs`, `.sbd-refs-header`, `.sbd-refs-grid`, `.sbd-ref-cell`, `.sbd-ref-blended` — reference price grid
- `.sbd-blend-tag`, `.sbd-delta` + direction variants (`.ref-below/above/neutral`) — blend label + delta pill
- `.sbd-src-dot` + variants (`.sbd-src-same/cross/blend`) — colored source indicator dots
- `.sbd-dims`, `.sbd-dim`, `.sbd-dim-header`, `.sbd-dim-name`, `.sbd-dim-badge`, `.sbd-dim-bar-wrap`, `.sbd-dim-bar`, `.sbd-dim-explanation` — five-dimension score rows
- `.sbd-bv-note` + policy variants (`.sbd-bv-boost/neutral/penalty`) — BV summary line
- `.sbd-truth-legend`, `.sbd-truth-chain`, `.sbd-truth-pill`, `.sbd-truth-arrow` — hierarchy chain
- `.th-verified/.th-off-market/.th-http/.th-claimed/.th-unknown/.th-unavail/.th-gone/.th-contradiction` — truth tier pill colors
- `.th-inline` — inline truth pill for use inside explanation text
- `.sbd-furnished-note` — furnished preference note
- `.score-hint`, `.score-hint-val`, `.score-hint-delta` + variants — table score hint cell

### 5. `index.html`
- Added `<th title="Composite score v2 · Δ vs. referencia mezclada">Score</th>` column header

---

## Key design decisions

- **Benchmarks clearly differentiated**: Each reference source has a colored dot + explicit label + subtext explaining what pool it draws from
- **Blend weight explained in plain Spanish**: "60 % mismo edificio + 40 % cross-tower — muestra reducida (2 mismo edificio)" tells the user exactly why cross-tower data was pulled in
- **Truth hierarchy chain always visible**: Shows the complete signal hierarchy so the user understands where "Broker declara disponible" sits relative to browser-verified data
- **BV neutral policy explicitly named**: "portal bloqueado → neutro (política v2)" — users see that a blocked portal is intentionally not penalized
- **No raw math**: All scores converted to plain-language urgency/leverage/quality statements
- **Progressive disclosure preserved**: Compact table hint → full drawer breakdown
- **Responsive**: Benchmark grid collapses to 2-col on narrow viewports with blended cell spanning full width
