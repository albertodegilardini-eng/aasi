# Blueprint → Live App Selective Merge Report
**Date:** April 4, 2026  
**Files modified:** `/home/user/workspace/frontend/style.css`, `/home/user/workspace/frontend/index.html`, `/home/user/workspace/frontend/app.js`

---

## Blueprint Ideas ACCEPTED

### 1. Decision Engine Eyebrow Banner ("Motor de Decisión")
**What:** A teal framed banner below the filter chips showing the full market context in one line: total activos, $/m² mediano, negotiable count, best opportunity ID. Includes a "Guía rápida" CTA button.  
**Why accepted:** Upgrades the framing from "listing viewer" to "decision engine" without touching any existing component. Pure addition.  
**Files:** `index.html` (HTML), `style.css` (.decision-engine-banner, .decision-engine-eyebrow, etc.)

### 2. Collapsible Advanced Filters (`<details>` + `<summary>`)
**What:** A `<details>` disclosure element labeled "Filtros avanzados" that expands to show: tower selector, bedrooms, sort order, min price, min m², negotiable-only checkbox — plus Apply / Reset buttons.  
**Why accepted:** Matches the blueprint's "reduce noise, prioritize comparability" philosophy. Wired to existing `activeFilter`, `sortMode`, `renderOverview()` — no new state, no new API calls. Progressive disclosure keeps the overview clean by default.  
**Files:** `index.html` (HTML), `style.css` (.adv-filter-details, .adv-filter-summary, .adv-filter-body, etc.), `app.js` (setupAdvancedFilters function)

### 3. Operating Context Strip (Single Source of Truth Summary)
**What:** A horizontal strip below the advanced filter panel showing five data points in one glance: Universo, Mediana, $/m², Para negociar, Mejor oportunidad — all populated from `marketSummary` after data loads.  
**Why accepted:** Directly from blueprint's "single-source-of-truth" principle. Uses the same data source as KPI cards for consistency. No duplicate state.  
**Files:** `index.html` (HTML), `style.css` (.operating-context-strip, .op-context-item, etc.), `app.js` (updateDecisionEngineBanner populates this)

### 4. Animated Scrolling Ticker Footer
**What:** Replaced the static footer (which showed only static attribution text) with an animated `ticker-scroll-track` marquee showing the top 12 listings by composite score: building, price, $/m², delta vs peer. Pauses on hover. Infinite seamless loop via CSS `@keyframes ticker-scroll`.  
**Why accepted:** Blueprint's ticker treatment is strictly better than static text — adds live market context at a glance. No regressions: footer metadata is preserved in `cacheStatusFooter`.  
**Files:** `index.html` (replaced `<footer>` body), `style.css` (.ticker-scroll-wrap, .ticker-scroll-track, @keyframes ticker-scroll, .ticker-item-bp), `app.js` (renderAnimatedTicker function)

### 5. Guided Mode Dialog (Onboarding / 4-Step Workflow)
**What:** A `<dialog>` element with four numbered steps explaining the workflow: (1) Filter, (2) Inspect, (3) Compare, (4) Operator. Triggered by a "?" help button added to header-actions next to the refresh and theme toggles.  
**Why accepted:** Directly from blueprint. Keeps all existing navigation intact — it's an additive overlay. The four steps map exactly to the live app's actual views (Overview → Detail → Compare → Operator).  
**Files:** `index.html` (dialog HTML + "?" button), `style.css` (.guided-dialog-bp, .guided-card-bp, .guided-step, .help-btn), `app.js` (setupGuidedMode IIFE)

### 6. Compare View Decision Framing Banner
**What:** A teal-bordered banner at the top of the Compare view reading "Comparación de mercado — Analiza hasta 3 torres en paralelo. Prioriza $/m² y días en mercado…"  
**Why accepted:** Pure copy/framing improvement. Does not change any Compare view logic or data rendering.  
**Files:** `index.html` (HTML in compareView)

### 7. Operator View Negotiation Framing Banner
**What:** A green-bordered banner at the top of the Operator view reading "Lista de acción operativa — 'Negociar' significa oportunidad verificada con banda de oferta calculada y script de apertura listo."  
**Why accepted:** Pure copy/framing. Clarifies operator intent without changing any action card logic.  
**Files:** `index.html` (HTML in operatorView)

---

## Blueprint Ideas REJECTED

### 1. Three-Tab Mode Switch in Topbar (Overview / Compare / Negotiation)
**Why rejected:** The live app has a richer 6-view navigation (Vista, Operador, Comparar, Agentes, Dashboard, Mapa, Tracking) that is strictly better. Replacing it with three tabs would regress the entire Operator, Agents, Dashboard, Map, and Tracking workflows.

### 2. Blueprint's Single-Panel Sidebar Layout
**Why rejected:** The blueprint uses a 3-column workspace (filter sidebar / main stage / detail panel) that eliminates the multi-view routing. The live app's view-based architecture supports more capability.

### 3. Blueprint's Static Data-Only Pattern
**Why rejected:** The live app's `loadData()` has a smart API → local fallback → offline chain with in-memory TTL cache. The blueprint uses a single `fetch('./data.json')`. Live app pattern is strictly superior.

### 4. Blueprint's hero-panel as the primary information surface
**Why rejected:** The live app has a photographic hero with image and overlay — visually richer. The blueprint's hero is a text card with two CTA buttons. The live app's hero image is kept; the decision-engine framing is adopted via the banner instead.

### 5. Blueprint's Bottom Ticker as Static Wrapped Chips
**Why rejected:** Blueprint's ticker uses `display:flex; flex-wrap:wrap` — a static pill layout. Adopted the animated marquee treatment instead, which is strictly better.

---

## Live App Capabilities PRESERVED (not regressed)

- Full 7-view navigation (Vista, Operador, Comparar, Agentes, Dashboard, Mapa, Tracking)
- Tracking view (Alerts, Watch State, Event Log, Snapshots)
- MapLibre GL map with building pins, layer toggle, and filter
- Dashboard view (composite chart, leverage chart, PSM distribution, ghost % chart)
- Agents directory with credibility scores
- Operator view action cards with filter bar (negotiate/fast_move/verify/monitor)
- Detail drawer with renter intel header, leverage analysis, negotiation band, inquiry form
- API → demo → offline data fallback chain
- In-memory TTL cache (no localStorage/sessionStorage)
- Theme toggle (dark/light mode)
- Keyboard shortcut ⌘K for search
- Building image cards with aerial photos
- Animated skeleton loaders
- Toast notifications
- Market Pulse Bar (sticky real-time status strip)
- Chart registry with proper destroy/recreate lifecycle

---

## Files Changed

| File | Changes |
|---|---|
| `frontend/style.css` | Appended ~350 lines: animated ticker styles, guided dialog styles, decision engine banner, advanced filter collapse, operating context strip, compare/negotiation decision banners, responsive overrides |
| `frontend/index.html` | Added: "?" help button in header-actions; decision engine banner + advanced filter collapse + operating context strip in overview view; compare decision banner in compare view; negotiation framing banner in operator view; guided mode `<dialog>`; animated footer ticker |
| `frontend/app.js` | Appended: setupGuidedMode IIFE, renderAnimatedTicker(), updateDecisionEngineBanner(), setupAdvancedFilters IIFE, init() override hook to wire blueprint additions after data loads |
