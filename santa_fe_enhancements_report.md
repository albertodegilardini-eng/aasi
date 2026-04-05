# Santa Fe CI — Enhancement Implementation Report
Generated: 2026-04-04

## Files Changed

### 1. `/home/user/workspace/intelligence.py`
**Enhancement: Fix days-on-market to use real first_seen_at**

- In `derive_first_seen_at()` (line ~350), added a fallback that reads `listing.get("days_on_market")` (snake_case) in addition to the existing `listedDays` / `metrics.daysOnMarket` lookups.
- **Root cause**: The seed file uses `days_on_market` (snake_case) but the function only checked `listedDays` (camelCase) and `metrics.daysOnMarket`. When neither matched, it fell back to `now`, producing DOM=0 for all listings on first generation.
- **Effect**: On the next scraper run with fresh seeds, `first_seen_at` will be correctly back-dated using the seed's `days_on_market` value. Subsequent runs preserve this via `previous.first_seen_at`, so DOM accumulates in real time.

### 2. `/home/user/workspace/data/listings.live.json`
**Enhancement: Corrected first_seen_at for existing live listings**

- Applied a one-time Python patch that back-dated `first_seen_at` for all 14 live listings using the seed's hardcoded `days_on_market` values.
- This ensures the live file immediately reflects real DOM values (e.g., sf_001: 45 days) rather than 0.
- On subsequent scraper runs, `derive_first_seen_at` will find the correct `first_seen_at` in the previous payload and preserve it.

### 3. `/home/user/workspace/frontend/style.css`
**Three distinct enhancements:**

#### (a) Dark-mode CSS token consolidation
- Replaced the original two-block structure (`[data-theme="dark"]` + `@media (prefers-color-scheme: dark) :root:not([data-theme])`) with a clearly documented two-block structure where both blocks are now fully symmetrical.
- The `@media` block now includes the previously missing `--chart-peninsula`, `--chart-torre300`, `--chart-paradox`, and `--color-primary-bg` variables that existed in `[data-theme="dark"]` but were absent from the `@media` fallback.
- Added a comment documenting the design intent. Safe — backward compatible with all browsers.
- **Adaptation note**: True single-declaration consolidation (sharing one ruleset between a `[attr]` selector and an `@media` block) is not valid in standard CSS without nesting. The approach taken (documented symmetrical blocks with a clear comment) is the safe, production-compatible choice.

#### (b) Map view flex-based height
- Replaced `height: calc(100dvh - 32px - 52px)` with flex-based layout.
- `#mapView` now uses `flex: 1; min-height: 0; display: flex; flex-direction: column;` — it fills remaining space after the pulse bar and header without hardcoded pixel arithmetic.
- Added `#mapView.active { display: flex; }` to override the base `.view.active { display: block; }`.
- Added `:is(.app-main:has(#mapView.active))` CSS rule so `app-main` becomes a flex column when the map is active.
- `#mapView .map-section` and `#mapView .map-body` both use `flex: 1; min-height: 0;` instead of hardcoded heights.

#### (c) Listing card keyboard focus styles
- Added `.listing-card:focus-visible` rule matching the hover visual treatment: border-color, box-shadow (3px primary ring), translate-up.
- Also `.listing-card:focus-visible::before` to trigger the building-color accent bar on focus.

#### (d) Search result keyboard highlight style
- Added `.search-result-item.search-result-active` style for ArrowUp/Down navigation highlighting.

### 4. `/home/user/workspace/frontend/app.js`
**Four distinct enhancements:**

#### (a) In-memory TTL caching layer
- Added `_apiCache` object, `CACHE_TTL_MS = 60000` (60s), `cachePut()`, `cacheGet()`, `cacheBust()` functions.
- `apiFetch()` now checks the cache before making a network request; stores responses on success.
- Accepts `opts.noCache` to bypass (used for `/api/refresh` calls).
- `cacheBust()` (clears all entries) is called after both manual refresh button clicks.
- **No localStorage / sessionStorage / cookies / indexedDB used.** Pure in-memory state, resets on page reload.

#### (b) 150ms debounced search with keyboard navigation
- Replaced the immediate `input` event listener with a `setTimeout(runSearch, 150)` debounce.
- Added `setActive(idx)` function that tracks the highlighted result item index.
- ArrowDown: moves highlight down (expands if closed), prevents default scroll.
- ArrowUp: moves highlight up, prevents default scroll.
- Enter: opens the highlighted item, or the only item if exactly one match.
- Escape: closes dropdown, blurs input.
- Each result item gets `tabindex="-1"` and `aria-selected` attribute management.
- `aria-expanded` is toggled on the `#searchResults` listbox element.
- `#searchInput` gets `aria-controls="searchResults"` and `aria-autocomplete="list"` in the HTML.

#### (c) Accessibility: keyboard-focusable listing cards
- Changed listing card from `role="listitem"` to `role="button" tabindex="0"`.
- Added `aria-label` with a human-readable summary: title, building, price, days on market.
- Added `keydown` handler on each card: Enter and Space both trigger `openCard()`.

#### (d) Accessibility: score bar text alternatives
- Added `scoreBarTier(value, inverse)` function that returns "alto" / "medio" / "bajo".
- `scoreBarRow()` now adds `role="meter" aria-valuemin aria-valuemax aria-valuenow aria-label` to the bar track element.
- The `aria-label` reads e.g. "Valor: 72 de 100, nivel alto".
- Numeric value `<span>` gets `aria-hidden="true"` since the bar's `aria-label` already conveys the value.
- Same pattern applied to the detail view score gauges.

#### (e) Accessibility: negotiation band screen-reader fallback
- Added `srSummary` string summarising all price anchors in plain text.
- Injected as `<p class="sr-only">…</p>` inside the negotiation band, before the visual `band-visual` div.
- The `band-visual` div gets `aria-hidden="true"` so screen readers skip the purely visual marker/track elements and read the text summary instead.

### 5. `/home/user/workspace/frontend/index.html`
- Added `aria-controls="searchResults"` and `aria-autocomplete="list"` to `#searchInput`.
- Added `aria-expanded="false"` to `#searchResults` (toggled by JS).

## Adaptations from Requested Enhancements

| Requested | Adaptation |
|---|---|
| Consolidate dark-mode CSS into a single token declaration | Full deduplication across two ruleset blocks is not valid CSS without nesting. Kept two symmetric blocks with complete parity and clear documentation. The missing tokens (`--chart-peninsula`, etc.) that were absent from the `@media` block are now present in both. |
| Map height flex-based | Used `:has(#mapView.active)` for the parent flex column — requires modern browsers (Chromium 105+, Firefox 121+, Safari 15.4+). This is the correct modern approach; the hardcoded calc fallback is removed. |
| TTL caching without storage APIs | In-memory only — resets on page load. TTL is 60s by default, configurable via `CACHE_TTL_MS`. |
