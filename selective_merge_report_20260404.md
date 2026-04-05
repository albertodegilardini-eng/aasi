# Selective Merge Report — React/Next Set → Live Frontend
**Date:** April 4, 2026  
**Source of truth:** `/home/user/workspace/frontend`  
**React/Next set reviewed:** workspace root (globals.css, layout.tsx, page.tsx, topbar.tsx, filter-rail.tsx, mode-switch.tsx, hero-panel.tsx, kpi-strip.tsx, listings-panel.tsx, intelligence-rail.tsx, compare-panel.tsx, negotiation-panel.tsx, bottom-ticker.tsx, guided-modal.tsx, chart-card.tsx, dashboard-provider.tsx, export-snapshot-button.tsx, route.ts, utils.ts, index.ts, README.md, package.json, next.config.ts, data.json)

---

## Files Changed

| File | What changed |
|---|---|
| `frontend/app.js` | KPI sublabel refinement; hero subtitle dynamic copy; compare chart subtitle; "Walk away — no cruces" band label; "Offer band — Banda operativa"; operator card target_close display; ticker enriched with target, confianza, riesgo fantasma; sortLabel() helper; decision engine banner uses sortLabel; pricingDeltaPct (peer delta) on listing cards; Playbook section renamed |
| `frontend/index.html` | Hero title → "Intelligence Layer"; overview h1 updated; operator subtitle → "Argumentos, banda operativa y guión de cierre…"; advanced filter summary → "Execution controls — Filtros avanzados"; negotiable checkbox → "Mostrar solo negociables"; sort options → "Oportunidad (score composite)", "Mayor antigüedad (DOM)" |
| `frontend/style.css` | Added `.op-target-close` (teal mono label below price in operator cards); added `.card-psm-delta` with `.delta-below`, `.delta-above`, `.delta-neutral` variants (peer % badge on listing cards) |

---

## Accepted Ideas (material improvements to live product)

### 1. KPI sublabel — "universo total" (from `kpi-strip.tsx`)
**Source:** `{ label: 'Listings visibles', meta: '${listings.length} universo total' }`  
**Improvement:** The sublabel under the first KPI card now dynamically shows the total dataset size ("14 universo total"), making "Listings visibles" meaningful when filters are applied. Previously said "Universo activo" which was static and redundant.

### 2. Hero panel copy hierarchy (from `hero-panel.tsx`)
**Source:** `<h2>Intelligence layer for Santa Fe leasing decisions</h2>` + dynamic summary `N activos en X. Mediana Y. N con señal clara de negociación. Orden Z.`  
**Improvement:** Hero title changed to "Intelligence Layer". Overview h1 now reads "Intelligence Layer — Decisión de Arrendamiento, Santa Fe". Overview subtitle dynamically states actual active count, tower count, negotiable count, and the product's positioning as "Motor de decisión para arrendamiento de alto valor".

### 3. Decision engine banner with sortLabel (from `utils.ts` `sortLabel()`)
**Source:** `sortLabel()` map function returning human-readable sort description  
**Improvement:** Added `sortLabel()` helper to `app.js`. Decision engine banner now appends "Orden por oportunidad" (or whichever sort mode is active), making the operating context strip self-documenting when users change sort order.

### 4. Compare chart subtitle — "Benchmark operativo" (from `compare-panel.tsx`)
**Source:** `<p className="muted small">Benchmark operativo lado a lado</p>`  
**Improvement:** Compare chart subtitle now reads "Benchmark operativo · Todos los listados por edificio · N unidades" instead of just "Todos los listados…". Reinforces that this view is an operational comparative tool.

### 5. Negotiation operator subtitle — "Argumentos, banda operativa y guión de cierre" (from `negotiation-panel.tsx`)
**Source:** `<p className="muted small">Argumentos, banda operativa y guion de cierre</p>`  
**Improvement:** Operator view page subtitle now leads with "Argumentos, banda operativa y guión de cierre" before the technical description, making the intent of the view immediately clear.

### 6. "Walk away — no cruces" band anchor label (from `negotiation-panel.tsx`)
**Source:** `<p className="muted">No cruces el walk-away de {formatCurrency(walkAway)}.</p>`  
**Improvement:** The "Walk away" label in the negotiation band anchors row now reads "Walk away — no cruces", adding the behavioral directive without requiring a tooltip or separate callout.

### 7. Operator card target_close display (from `negotiation-panel.tsx`)
**Source:** Recommended offer card showing `formatCurrency(targetClose)` prominently  
**Improvement:** Operator cards now show a "Target $X" line in teal below the listed price whenever `intel.pricing.target_close` is available. This surfaces the recommended close price directly in the action list without needing to drill into detail view.

### 8. Offer band heading — "Banda operativa de negociación" (from `intelligence-rail.tsx`)
**Source:** `intelligence-rail.tsx` metric stack with operational naming  
**Improvement:** Negotiation band h3 changed from "Offer band — Banda de Negociación" to "Offer band — Banda operativa de negociación". Adds "operativa" to clarify this is the actionable range, not just a descriptive range.

### 9. "Playbook operativo — Contraparte" section rename (from `intelligence-rail.tsx`)
**Source:** intelligence-rail.tsx groups intel under an "operating playbook" concept  
**Improvement:** Intel grid section "Playbook de Contraparte" renamed to "Playbook operativo — Contraparte". Aligns with the market intelligence + negotiation leverage branding.

### 10. Filter label — "Execution controls — Filtros avanzados" (from `filter-rail.tsx`)
**Source:** `<h2>Execution controls</h2>` in filter-rail.tsx  
**Improvement:** Advanced filter toggle label now reads "Execution controls — Filtros avanzados". Signals to users this panel controls the execution environment, not just aesthetic preferences.

### 11. "Mostrar solo negociables" checkbox (from `filter-rail.tsx`)
**Source:** `label Mostrar solo negociables` in filter-rail.tsx  
**Improvement:** Checkbox label changed from "Solo unidades negociables" to "Mostrar solo negociables". Mirrors the React/Next wording, which reads more naturally as a user instruction.

### 12. Sort option labels (from `utils.ts` `applyFilters()` sort keys)
**Source:** `score_desc` → `'Oportunidad'`; `dom_desc` → `'Mayor antigüedad'`  
**Improvement:** Sort selects (both overview and advanced filter) now use "Oportunidad" instead of "Score Composite" and "Mayor antigüedad (DOM)" instead of "Días en Mercado". User-oriented language over technical score names.

### 13. Ticker enriched with target_close, confianza, riesgo fantasma (from `utils.ts` `getSignalFeed()`)
**Source:** `getSignalFeed()` format: `"${towerLabel}: target ${formatCurrency(targetClose)} · confianza N · riesgo fantasma N%"`  
**Improvement:** Footer ticker items now show building-prefixed title, target close price (when available) replacing raw $/m², plus confidence score and ghost probability percentage. Converts the ticker from a price marquee into an actual signal feed.

### 14. Peer delta badge on listing cards (from `utils.ts` `normalizeListing()` pricingDeltaPct)
**Source:** `pricingDeltaPct = (price_per_sqm - peerMedian) / peerMedian * 100`; isOpportunity when `pricingDeltaPct <= -2`  
**Improvement:** Listing cards now show a colored pill ("+3% peer", "−5% peer") derived from the listing's $/m² vs market median. Green for below-median (opportunity signal), red for above-median (overpriced signal), neutral otherwise. This was the clearest normalization insight in utils.ts — now available at a glance in the grid.

---

## Rejected Ideas

### R1. React/Next migration (layout.tsx, page.tsx, next.config.ts, package.json)
**Reason:** Explicit constraint. The live app is a production-grade vanilla JS/HTML/CSS frontend with map, tracking, dashboard, operator, agent, and export capabilities. React/Next would require a complete rewrite and would initially discard all these features.

### R2. DashboardProvider / reducer state management (from `dashboard-provider.tsx`)
**Reason:** The live app uses a simpler but effective global state model (module-scoped vars + direct DOM updates). The React context/reducer pattern is appropriate for React's re-render model but is unnecessary overhead in vanilla JS. The live state model already handles all the same use cases (filter state, active listing, selected listings, view mode).

### R3. ModeSwitch component (from `mode-switch.tsx`)
**Reason:** The live app has a richer navigation model — 7 views (overview, detail, operator, compare, agents, dashboard, map, tracking) vs the React set's 3 modes. ModeSwitch would reduce capability. Already superseded.

### R4. ExportSnapshotButton → API fetch pattern (from `export-snapshot-button.tsx`, `route.ts`)
**Reason:** The export pattern requiring a `/api/export-snapshot` backend route was already superseded by a superior client-side implementation in the live app (adopted in a previous merge) that uses `Blob + URL.createObjectURL` with no backend dependency. The live app's export also includes more fields (ghost probability, status, market_summary metadata).

### R5. GuidedModal steps (from `guided-modal.tsx`)
**Reason:** The live app has a richer 4-step guided dialog (already merged in a previous cycle) with step-by-step instructions specific to the 7-view navigation model. The React set's version covers only 3 modes. The live version is more comprehensive.

### R6. Bottom ticker — basic format (from `bottom-ticker.tsx`)
**Reason:** The live app's ticker already existed from a prior merge and was further enriched in this cycle. The React/Next version showed only `towerLabel: target $X · leverage N` — less informative than the enriched live version which now also shows confianza, riesgo fantasma, and peer delta.

### R7. HeroPanel "Select top 3" button (from `hero-panel.tsx`)
**Reason:** The live app's compare view works differently — it uses metric-based selection rather than listing pre-selection. Adding a bulk "Select top 3" action would require wiring the compare view to a selection model that doesn't currently exist and could conflict with the existing compare-by-metric UX.

### R8. ChartCard (from `chart-card.tsx`)
**Reason:** The live app has a richer market chart panel with 3 chart types (price distribution, DOM distribution, score distribution) controlled by tabs. The React/Next ChartCard shows a single market spread chart. The live implementation is already stronger.

### R9. globals.css, base.css (from React/Next set)
**Reason:** The live app has its own `base.css` and `style.css` with more comprehensive dark/light mode tokens, building-specific color tokens, map tokens, and tracking view styling. Importing the React/Next CSS would overwrite these.

### R10. ListingsPanel with side-by-side selection (from `listings-panel.tsx`)
**Reason:** The live app uses the same grid-style listing cards but with richer data (score bars, leverage meter, DOM, furnishing details). The React/Next ListingsPanel is a simpler implementation that would reduce richness.

---

## Superseded by Stronger Live Features

### S1. Filter rail (from `filter-rail.tsx`)
The React/Next filter rail is a left sidebar with standard selects and sliders. The live app has a richer advanced filter `<details>` panel that integrates with an existing filter-chip navigation row (quick toggles by tower, beds, negotiate state), giving faster access to common filters. The "Execution controls" label and "Mostrar solo negociables" copy were absorbed without adopting the sidebar layout.

### S2. Intelligence rail (from `intelligence-rail.tsx`)
The React/Next side panel shows a static metric stack (offer band, opening anchor, target close, walk away, leverage, confidence, required proof, talk track). The live app's detail view shows all of these plus a full negotiation band visualization with visual markers, leverage analysis panel, counterparty playbook with full tactics, comparable listings, price history chart, and an inquiry form. The intelligence-rail naming conventions ("Selected asset", "Offer band — Banda operativa") were absorbed into the live detail view headings.

### S3. ComparePanel table (from `compare-panel.tsx`)
The React/Next compare panel is a static side-by-side table for up to 3 pre-selected listings. The live compare view is a full cross-tower chart system comparing any metric across all listings simultaneously, plus per-tower aggregate stats. The "Benchmark operativo" framing was absorbed.

### S4. NegotiationPanel (from `negotiation-panel.tsx`)
The React/Next panel shows Recommended offer, Opening anchor, Battle card, Counter script for a single selected listing. The live Operator view (Negotiation Workbench) groups all listings by status category (Negociar/Fast move/Verify/Monitor), shows score bars, leverage pills, and ghost risk — a more operational layout. The copy "Argumentos, banda operativa y guión de cierre", "No cruces el walk-away", and target_close display were absorbed.

### S5. BottomTicker (from `bottom-ticker.tsx`)
Already implemented in a prior merge and now enriched with the signal feed concept from `utils.ts` `getSignalFeed()`.

---

## Summary

- **Accepted:** 14 ideas across copy hierarchy, terminology, utility functions, and new data display concepts
- **Rejected:** 10 ideas (framework migration, state management pattern, components that duplicate or reduce live functionality)
- **Superseded:** 5 components where the live app's implementation is richer (filter rail, intelligence rail, compare panel, negotiation panel, ticker)
- **Files changed:** `frontend/app.js`, `frontend/index.html`, `frontend/style.css`
- **Zero capability removed:** All map, dashboard, tracking, operator, agents, and export features are intact
