# Dashboard Merge Report — Santa Fe AI
**Date:** April 4, 2026  
**Task:** Merge best parts of reference dashboard (MegaCap 50 — /workspace/index.html, app.js, style.css, base.css) into live Santa Fe AI frontend (/workspace/frontend/)

---

## Files Updated

### 1. `/frontend/index.html`
- **Added**: New "Dashboard" nav button in `.header-nav` (`data-view="dashboard"`, with grid/plus icon)
- **Added**: Complete `#dashboardView` section with:
  - `#dashKpiRow` — 8-card KPI row with accent bars
  - `#dashChartsGrid` — reserved for future top-level charts
  - `.dash-section-header` + `#dashBuildingMetrics` — per-tower metric breakdown cards
  - `.dash-score-charts` — 4 chart card containers (Canvas IDs: `dashCompositeChart`, `dashLeverageChart`, `dashPsmChart`, `dashGhostChart`)

### 2. `/frontend/app.js`
**Merged from reference dashboard:**
- `calcGrowth(values)` — computes total % growth between first/last values in a series
- `shouldBeginAtZero(values)` — smart Y-axis logic: begins at zero only if min/max ratio > 0.3
- `formatCompact(val)` — compact number formatter (K/M suffix) for axis ticks
- `growthBadgeHtml(values)` — generates colored ▲/▼ growth badge HTML
- `renderDashboardView()` — full dashboard renderer with:
  - 8 KPI cards, each with unique `--dash-accent` color per metric
  - Per-building metric summary cards with colored top accent bars
  - Chart 1: **Score Composite** — bar chart, all listings sorted by score, colored by building
  - Chart 2: **Leverage vs. DOM** — scatter chart, one dataset per building, shows correlation
  - Chart 3: **$/m² por edificio** — grouped bar chart, one dataset per building
  - Chart 4: **Ghost % risk** — horizontal bar, top 20 highest-risk listings, error/warning coloring
  - Dashboard charts tagged with `._sfDashChart = true` for targeted destroy on re-render
- `dashBStat(label, value)` — building stat row HTML helper
- **Theme toggle** extended to re-render dashboard charts on theme change (`renderDashboardView()` on `currentView === 'dashboard'`)
- **Navigation** extended: `if (view === 'dashboard') { renderDashboardView(); }`
- **Price history chart** improved: `tension: 0.35` (was 0.3), `borderWidth: 2.5` (was 2), `interaction: { intersect: false, mode: 'index' }`, `animation.duration: 700` (was 600)

### 3. `/frontend/style.css`
**Merged from reference dashboard:**
- `.dash-kpi-row` — CSS Grid, auto-fill min 160px, 8 gap
- `.dash-kpi-card` — surface card with `::before` accent bar that scales-in on hover (matches reference `.company-card::before` pattern), supports `--dash-accent` CSS custom property, `.accent-always` variant keeps bar visible permanently
- `.dash-kpi-label`, `.dash-kpi-value`, `.dash-kpi-delta` — KPI typographic hierarchy with semantic color classes
- `.dash-section-header` — labeled section divider with title + subtitle
- `.dash-building-card` — building summary card with `::before` accent bar, always-visible, controlled via `--dash-building-color`
- `.dash-bstat`, `.dash-bstat-label`, `.dash-bstat-value` — stat row inside building card
- `.dash-score-charts` — 2-column auto-fill grid of chart cards, min 380px
- `.dash-chart-card` — chart card with hover shadow and hover-reveal `::before` accent bar (direct port from reference `.chart-card`)
- `.dash-chart-title`, `.dash-chart-unit`, `.dash-chart-container`, `.dash-chart-footer` — chart card anatomy
- `.dash-chart-growth` with `.positive` / `.negative` — growth badge coloring (▲/▼)
- `.listing-card::before` — **new**: hover-reveal 3px accent bar on all listing cards (from reference `.company-card::before`)
- `.listing-card[data-building="peninsula/torre300/paradox"]::before` — building-specific accent colors on listing cards
- Responsive breakpoints for dashboard grid at 900px, 600px, 480px

### 4. `/frontend/base.css`
- `scroll-padding-top` updated from `4rem` to `4.5rem` to account for sticky pulse bar (32px) + header stacking

---

## Variables / Structure Changed

| What | Before | After |
|---|---|---|
| `calcGrowth` | Not present | Added (from ref dashboard) |
| `shouldBeginAtZero` | Not present | Added (from ref dashboard) |
| `formatCompact` | Not present | Added (from ref dashboard) |
| `growthBadgeHtml` | Not present | Added (new, uses ref pattern) |
| `renderDashboardView` | Not present | Added (new view function) |
| `dashBStat` | Not present | Added (helper) |
| Nav views | 4: Vista, Operador, Comparar, Agentes | 5: + Dashboard |
| Price history tension | 0.3 | 0.35 |
| Price history borderWidth | 2 | 2.5 |
| Price history animation duration | 600ms | 700ms |
| chart interaction mode | Not set | `{ intersect: false, mode: 'index' }` |
| Listing card hover | No accent bar | 3px building-colored accent bar |
| scroll-padding-top | 4rem | 4.5rem |

---

## Backend Contract Preserved
All API calls remain unchanged:
- `apiFetch('/api/feed')` — data source for all dashboard metrics
- `apiFetch('/api/agents')` — agents data
- `apiFetch('/api/refresh')` — refresh trigger
- `fetch('/api/inquiries', POST)` — inquiry submission

The dashboard reads from `listingsData`, `buildingsData`, `towerSummary`, `marketSummary` — all populated by the same `applyFeedData()` function, fully backward-compatible.
