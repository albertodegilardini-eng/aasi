# Santa Fe CI Platform — Selective Changelog Merge Report
**Date:** April 4, 2026  
**Source:** CHANGELOG.md vs /home/user/workspace/frontend

---

## (1) Already Present — No Action Needed

| # | Changelog Item | Evidence |
|---|---|---|
| 2 | **Chart Registry** (`chartRegistry{}`, `getOrCreateChart()`, `destroyChartsByTag()`, `destroyAllCharts()`) | Fully implemented in app.js lines 54–101 |
| 4 | **Dynamic `days_on_market` Calculation** (`computeDaysOnMarket()`) | app.js line 163 |
| 5 | **Search UX** — 150ms debounce, ArrowUp/Down navigation, Enter to select, Escape to close, Cmd+K shortcut, agent_name searchable field, keyboard hint bar at bottom of dropdown | All present in app.js lines 429–510, 477 |
| 6 | **Data Status Indicator** — `#dataStatusBadge` in HTML with live/cached/demo/offline states; `updateDataStatus()` in JS; CSS classes `.data-status.live/.cached/.demo/.offline` | index.html line 30, app.js lines 149–160, style.css lines 2517–2532 |
| 8 | **Loading Skeleton Cards** — 3 shimmer skeleton cards as initial HTML in `#listingsGrid`; `@keyframes shimmer` + `.skeleton-card` CSS | index.html lines 208–210, style.css lines 2454–2514 |
| 10 (partial) | **Accessibility** — `role="alert"` on toast, `tabindex="0"` on building cards with Enter/Space keydown, `listing-card:focus-visible` styles, global Escape to return from detail view | app.js lines 142, 630, 666, 297 |
| 12 (partial) | **HTML Cleanup** — `⌘K` placeholder in search input; no Perplexity inline-edit capture script present | index.html line 66 |

---

## (2) Missing Items Merged Now

| # | Changelog Item | Changes Made | Files |
|---|---|---|---|
| 7 | **Synthetic Agent Flagging** | Added `synthetic: true` field to all records built by `buildAgentsFromListings()`. `renderAgentsView()` now shows an `<span class="agent-source-badge estimado">Estimado</span>` badge next to synthetic agent names in the scorecard grid, and a new **Fuente** column in the agents table with Estimado (amber) / Verificado (green) badges. Added `.agent-source-badge` CSS with `.estimado` and `.verificado` variants. | app.js, style.css |
| 9 | **Toast System** | Replaced inline `document.body.appendChild` with a persistent `#toastContainer` div carrying `aria-live="polite"` and `aria-atomic="true"` so screen readers announce toasts. Added exit animation (`toast.exiting` → `@keyframes slideDown`) with animated removal instead of abrupt `el.remove()`. | app.js, style.css |
| 10 (missing parts) | **Accessibility — remaining** | Added `:focus-visible` styles for `.building-card` and `.op-card`. Added `tabindex="0"` + `keydown` (Enter/Space) on operator cards in `renderOperatorView()`. Added `title` attribute on `.op-score-bar-track` and `.scorecard-score-bar` with text labels (Alta/Media/Baja). | app.js, style.css |
| 11 | **Map CSS Fix** | Fixed all 3 instances of `transition: var(--transition)` → `transition: all var(--transition-interactive)` in map.css. `--transition` was never defined; the correct variable is `--transition-interactive` (180ms spring curve). | map.css |
| 12 (missing part) | **Building card image `onerror` handler** | Added `onerror="this.parentNode.style.display='none'"` to building card `<img>` elements so a broken image collapses gracefully rather than showing a broken icon. | app.js |
| 1 (partial) | **CSS Deduplication** | Removed the duplicate `listing-card { position:relative; overflow:hidden; }` + `listing-card::before` block at the bottom of style.css (lines ~2878–2896). The authoritative definition (with `focus-visible` and `height:2px`) at lines 1098–1116 is preserved. Building-color overrides retained at the same location. | style.css |

---

## (3) Rejected — With Reasons

| # | Changelog Item | Reason for Rejection |
|---|---|---|
| 3 | **localStorage Cache Layer** | Explicitly blocked. The task instructions prohibit `localStorage`, `sessionStorage`, `indexedDB`, and cookies. The current in-memory TTL cache (`cachePut`/`cacheGet` in app.js) is the correct platform-safe alternative and was already present. |
| 1 (partial) | **Remove `@media (prefers-color-scheme: dark)` CSS block** | The changelog states JS makes this redundant, but the current block uses `:root:not([data-theme])` — it fires *only when JS has not yet set `data-theme`*, providing a valid no-JS / pre-JS-load fallback. Removing it would cause a flash of light theme on dark-mode OS users before JS initializes. Kept as-is. |

---

## (4) Files Changed

| File | Change Summary |
|---|---|
| `app.js` | `buildAgentsFromListings()`: +`synthetic: true` field; `renderAgentsView()`: +Estimado badge in scorecard, +Fuente column in table; `showToast()`: rewritten to use `aria-live` container + exit animation; `renderOperatorView()`: +`tabindex="0"` and keydown on `.op-card`; `renderOpCard()`: +`title` on score bar; `renderAgentsView()` scorecard: +`title` on credibility bar; building card `<img>`: +`onerror` handler |
| `style.css` | Removed duplicate `listing-card` + `::before` block (~15 lines); added `.building-card:focus-visible`; added `.op-card:focus-visible`; added `.toast.exiting` + `@keyframes slideDown`; added `.agent-source-badge` / `.estimado` / `.verificado` CSS (~30 lines added, ~15 removed) |
| `map.css` | Fixed 3× `transition: var(--transition)` → `transition: all var(--transition-interactive)` |

**`index.html`, `base.css`, `tracking.css`, `data.json`** — unchanged.
