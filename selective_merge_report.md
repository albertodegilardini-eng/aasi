# Selective Merge Report — Santa Fe CI
**Date:** 2026-04-04  
**Source of truth:** `/home/user/workspace/frontend/`  
**Reference:** `/home/user/workspace/{index.html, app.js, style.css, base.css, map.css, data.json}`

---

## Files Changed

| File | Changes |
|------|---------|
| `frontend/app.js` | 7 distinct improvements merged (see below) |
| `frontend/style.css` | 3 CSS blocks added (skeleton-card, data-status badge, search-shortcut-hint) |
| `frontend/index.html` | 3 additions: data status badge in pulse bar, cacheStatusFooter in footer, skeleton cards in listings grid, ⌘K in search placeholder |

---

## ACCEPTED Enhancements

### 1. Chart Registry Pattern (`app.js`)
**What:** Added `chartRegistry` object + `getOrCreateChart(canvasId, config, tag)`, `destroyChartsByTag(tag)`, `destroyAllCharts()` functions. Migrated all 7 chart instantiations (`marketDistChart`, `priceHistoryChart`, `compareChart`, `dashCompositeChart`, `dashLeverageChart`, `dashPsmChart`, `dashGhostChart`) to use the registry.  
**Why accepted:** The live app used a simple `chartInstances[]` array which had no deduplication — calling renderMarketChart twice would create two instances on the same canvas, producing Chart.js warnings and memory leaks. The registry guarantees each canvas holds exactly one chart at a time. Also fixed a pre-existing bug: `var bColor style.getPropertyValue(...)` (missing `=`) in the compare view cross-tower section.

### 2. Keyboard Shortcuts: Cmd/Ctrl+K (`app.js`)
**What:** Added `setupKeyboardShortcuts()` function (called from `init()`). Cmd/Ctrl+K focuses and selects the search input. Escape from detail view returns to overview. Guard against multiple wiring via `document._sfKbWired`.  
**Why accepted:** The live app had no Cmd+K shortcut despite the search placeholder hinting at it (no tooltip was functional). The reference's implementation is clean and the Escape-from-detail shortcut improves UX.

### 3. Data Status Badge (`app.js` + `index.html` + `style.css`)
**What:** Added `updateDataStatus(status, label)` function, wired it into `loadData()` for live/demo/offline states, plus `dataSource` state variable. Added `<span id="dataStatusBadge">` in the pulse bar HTML, `<span id="cacheStatusFooter">` in the footer.  
**Why accepted:** The live app had zero data provenance feedback — users couldn't tell if they were seeing live API data or static demo data. The badge fills this gap cleanly in the existing pulse bar. Used `color-mix()` for the badge colors instead of the reference's `--color-success-bg` variables (which don't exist in the live app's CSS).

### 4. `computeDaysOnMarket()` (`app.js`)
**What:** Added `computeDaysOnMarket(listings)` function that calculates `days_on_market` from `first_seen_at` for listings where it's 0 or missing. Called from `applyFeedData()` replacing the direct `feedRes.listings || []` assignment.  
**Why accepted:** The live app showed 0 days for any listing where the API didn't pre-compute DOM, making the DOM column useless for those entries. The calculation is safe (keeps existing values, only computes when missing/zero).

### 5. Skeleton Loading Cards (`index.html` + `style.css`)
**What:** Three skeleton card placeholders added to `#listingsGrid` in `index.html` as initial state. Added `.skeleton-card`, `.skeleton-line`, `.skeleton-grid` CSS (shimmer animation on `::after` pseudo-element using `translateX` rather than `background-position`). Added `.skeleton-card::after` shimmer using `@keyframes skeletonSlide`.  
**Why accepted:** The live app showed a blank listings grid during initial load. Skeleton cards give users immediate feedback that content is coming. Used `skeletonSlide` keyframe name to avoid conflict with the existing `shimmer` keyframe for `.skeleton`.

### 6. Search Keyboard Navigation Hint (`app.js` + `style.css`)
**What:** After search results render, a `<div class="search-shortcut-hint">` is appended with ↑↓ Enter Esc labels. Added `.search-shortcut-hint` + `.search-shortcut-hint kbd` CSS rules.  
**Why accepted:** The live app had no hint about keyboard navigation. This is standard UX for command-palette-style search. It's non-interactive (`pointer-events: none`) so doesn't interfere with click handlers.

### 7. Agent Name in Search (`app.js`)
**What:** Added `(l.agent_name || '').toLowerCase().includes(q)` to the search filter in `runSearch()`.  
**Why accepted:** The live app's search missed agent names. The reference correctly included them, consistent with the search placeholder text "Buscar por ID, edificio, precio…".

---

## REJECTED Enhancements

### localStorage Cache (`saveToCache`, `loadFromCache`, `clearCache`) — `app.js`
**Why rejected:** `localStorage`, `sessionStorage`, `indexedDB`, and cookies are **blocked** in this environment. The live app already has a correct in-memory TTL cache (`_apiCache`, `cachePut`, `cacheGet`, `cacheBust`). Re-introducing `localStorage` would silently fail and crash the page.

### localStorage Theme Persistence — `app.js`
**Why rejected:** Same blocking reason. Reference's `initTheme()` reads and writes `localStorage.getItem('sf-ci-theme')`. The live app correctly uses only `matchMedia` for theme detection without persistence.

### `dataSource = 'loading'` as Global Initial State
**Note:** This state variable was added, but the reference's `loading` status badge text was changed to `'Cargando…'` (with ellipsis) for better UX — not kept as the reference's bare `'loading'`.

### Reference `index.html` Skeleton Grid wrapper (`<div class="skeleton-grid">`) 
**Why rejected:** The live app uses `.listings-grid` (which already has `display:grid`) for the container. Adding `.skeleton-grid` as a wrapper would break the layout. Skeleton cards were placed directly inside `#listingsGrid` instead.

### Reference `destroyAllCharts()` replacing `destroyCharts()` in tracking view
**Why rejected:** The live app's tracking view uses `destroyCharts()` in multiple places. Rather than changing all call sites, `destroyCharts()` was updated to delegate to `destroyAllCharts()`, preserving the existing API surface while gaining the registry benefits.

---

## Pre-existing Bug Fixed (bonus)
- **`var bColor style.getProperty…`** (missing `=`) in `renderCompareView` cross-tower section at line ~1589. This caused a SyntaxError that was silently swallowed by the previous error-tolerant load path but would crash in strict environments. Fixed to `var bColor = style.getProperty…`.
