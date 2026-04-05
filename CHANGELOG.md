# Santa Fe CI Platform — Enhancement Changelog

**Date:** April 4, 2026
**Scope:** Full-stack frontend refactor — CSS, JavaScript, HTML
**Backward Compatibility:** 100% — same data.json schema, same visual behavior, same file structure

---

## Summary of Changes

| Area | Original | Enhanced | Delta |
|---|---|---|---|
| style.css | 2,771 lines | 2,893 lines | −62 duplicate, +184 new |
| app.js | 2,251 lines | 2,200 lines | −51 lines (cleaner) |
| index.html | 546 lines | 492 lines | −54 lines (removed Perplexity capture script) |
| map.css | 661 lines | 661 lines | Bug fixes only |
| base.css | 64 lines | 64 lines | No change |

---

## 1. CSS Token Deduplication (style.css)

**Problem:** Dark mode tokens declared three times — `[data-theme="dark"]`, `@media (prefers-color-scheme: dark)`, and scattered overrides.

**Fix:** Removed the 42-line `@media (prefers-color-scheme: dark)` fallback block entirely. The JS theme initializer already reads `prefers-color-scheme` on page load and sets `data-theme` accordingly, making the CSS media query redundant. Also removed 20 lines of duplicate `listing-card::before` rules at the end of the file that conflicted with earlier definitions.

**Impact:** Single source of truth for all theme tokens. One edit = one change.

---

## 2. Chart Registry (app.js)

**Problem:** Chart.js instances tracked in a flat `chartInstances[]` array. Selective destruction via `_sfMarketChart` / `_sfDashChart` flags was fragile. Rapid view switching could exceed the browser's 16-canvas limit.

**Fix:** Replaced with `chartRegistry{}` keyed by canvas ID. New `getOrCreateChart(canvasId, config, tag)` always destroys the previous instance for a given canvas before creating a new one. `destroyChartsByTag(tag)` and `destroyAllCharts()` provide clean lifecycle management.

**Impact:** Zero risk of canvas leaks regardless of navigation speed.

---

## 3. localStorage Cache Layer (app.js)

**Problem:** Every page load hit the network or filesystem. No persistence between sessions.

**Fix:** Added `saveToCache()` / `loadFromCache()` with a 5-minute TTL. Data loading priority: (1) API → (2) localStorage cache → (3) local data.json → (4) offline state. Manual refresh (`pulseRefreshBtn`, `refreshBtn`) clears cache before fetching. Theme preference also persisted.

**Impact:** Instant reloads during active research sessions. Manual bypass when fresh data is needed.

---

## 4. Dynamic `days_on_market` Calculation (app.js)

**Problem:** All 14 listings showed `days_on_market: 0` because the scraper wasn't computing it from `first_seen_at`.

**Fix:** Added `computeDaysOnMarket(listings)` that runs on every data load. Computes `Math.floor((now - first_seen_at) / 86400000)` for any listing where DOM is 0 but `first_seen_at` exists.

**Impact:** Unlocks the leverage scoring engine, which weights DOM > 45 as "Fuerte" and DOM > 21 as "Moderado." Previously inoperative.

---

## 5. Search UX Improvements (app.js)

**Problem:** Search triggered on every keystroke with no debounce. No keyboard navigation.

**Fix:**
- 120ms debounce on input
- Arrow key navigation (↑/↓) with visual highlight
- Enter to select highlighted result
- Escape to close and blur
- Global `Cmd+K` / `Ctrl+K` shortcut to focus search
- Agent name added to searchable fields
- Keyboard hint bar at bottom of results dropdown

**Impact:** Professional search UX. Works on keyboard-only workflows.

---

## 6. Data Status Indicator (index.html, app.js, style.css)

**Problem:** No visual indication of data freshness or source.

**Fix:** Added a status badge in the pulse bar (`#dataStatusBadge`) with four states: `live` (green), `cached` (amber), `demo` (teal), `offline` (red). Footer also shows data source and timestamp.

**Impact:** At-a-glance awareness of whether you're negotiating with live data or cached/demo data.

---

## 7. Synthetic Agent Flagging (app.js, style.css)

**Problem:** `buildAgentsFromListings()` synthesized agent credibility scores via naive averaging, but presented them identically to verified scores.

**Fix:** Added `synthetic: true` flag to all generated agent records. Agents view now shows an "Estimado" badge on synthetic entries. Table includes a "Fuente" column distinguishing Estimado from Verificado.

**Impact:** Prevents overconfidence in unverified credibility data.

---

## 8. Loading States (index.html, style.css)

**Problem:** Blank grid during initial load. No visual feedback.

**Fix:** Added three shimmer skeleton cards inside `#listingsGrid` as the initial HTML. They are replaced by real data once loading completes. CSS includes `@keyframes shimmer` animation.

**Impact:** Professional perceived performance.

---

## 9. Toast System (app.js, style.css)

**Problem:** Toast styles were referenced in JS but not defined in CSS. Toast had no `role="alert"` for accessibility.

**Fix:** Added complete toast CSS with success/warning/error variants, entrance/exit animations, and `role="alert"` attribute for screen readers.

---

## 10. Accessibility (app.js, index.html, style.css)

- `tabindex="0"` on all listing cards, building cards, and operator cards
- Keyboard activation (Enter/Space) on all interactive cards
- `title` attributes on score bars with text labels (Alta/Media/Baja)
- `aria-live="polite"` on toast container
- `:focus-visible` styles for card keyboard navigation
- Global Escape key to return from detail view to overview

---

## 11. Map CSS Fixes (map.css)

- Fixed `transition: var(--transition)` → `transition: all var(--transition-interactive)` (the `--transition` variable was undefined)
- Improved height calculation comment for clarity

---

## 12. HTML Cleanup (index.html)

- Removed 60-line Perplexity Computer inline-edit capture script (`data-pplx-inline-edit`) — served no purpose outside Perplexity's iframe
- Added search placeholder hint `(⌘K)`
- Added `onerror` handler on building card images for graceful fallback

---

## Deployment

Drop the 6 files into the same directory as the original. No build step required. The `img/` folder and `data.json` are unchanged and fully compatible.

For live API mode, ensure `python server.py` is running and `/api/feed` + `/api/agents` respond. The platform degrades gracefully through cache → local file → offline states.
