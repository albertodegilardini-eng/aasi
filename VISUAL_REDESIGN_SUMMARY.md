# Santa Fe CI Platform — Visual Stabilization Summary

## File Added
`frontend/visual-redesign.css` — 1,200+ lines of pure CSS overrides. No HTML, JS, or data model changes.

## Changes Made

### 1. Hero Banner
- Increased image brightness from 0.48 → 0.56 for better visibility of aerial photo
- Refined gradient composition: cinematic left-to-right fade preserves city skyline on right, dense dark area contains text on left
- Added subtle teal radial glow at top-left for brand reinforcement
- Tightened hero title to `clamp(1.65rem, 2.2vw, 2.4rem)` with `letter-spacing: -0.025em` for premium feel
- Subtitle reduced to 64% white opacity with 1.5 line height for legibility
- Hero tags refined with backdrop-blur and more generous letter spacing
- Overall hero height reduced slightly (218px vs 236px) — tighter without losing impact

### 2. KPI Cards
- Top accent bar `::before` pseudo-element on hover (2px teal line) — elevates active state
- Warning card gets amber top bar, default gets teal on hover
- KPI values use `clamp(1.6rem, 1.8vw, 2rem)` — bold, dominant with `letter-spacing: -0.02em`
- Labels tightened to 9px / 700 weight / 0.10em letter-spacing — distinct from values
- Card padding reduced to 14px vertical for tighter density
- Uses `auto-fill, minmax(168px, 1fr)` — correct for variable card count across sections
- Subtle `box-shadow` on hover with teal glow border

### 3. Building Cards (Inventario por Edificio)
- Rewrote for both `.bldg-card` (HTML template) and `.building-card` (JS-rendered) class names
- Taller images: 158px (was 130px) — more photographic presence
- Image filter: `brightness(0.90) saturate(0.88) contrast(1.06)` — cinematic grading
- Gradient overlay: stronger gradient bottom to top, preserves sky at top
- Badge moved to top-right for cleaner left-side reading
- **Color-coded top borders**: Península Tower = teal `#3ec8c8`, Torre 300 = amber `#f0a020`, Paradox = purple `#9270e8`
- Stat cells now have `border: 1px solid var(--color-border)` and `border-radius: 8px` — proper grid structure
- "Mejor valor" strip at bottom: teal background, price in teal, title truncated — clean at-a-glance info
- Hover: `translateY(-3px)` lift with deeper shadow and teal border

### 4. Events / Feed Section
- Event rows: `border-left: 3px solid` colored by event type (error=red, relisting=amber, duplicate=purple, success=green, price drop=teal)
- Added `access_blocked` → red border mapping (corrected from incorrect `source_missing` class that doesn't exist in rendered DOM)
- Row styling: surface cards with subtle hover state
- Tighter gap (6px) between event rows

### 5. Map Section
- Map top bar height reduced to 48px, tighter padding
- Layer toggle buttons: 7px border-radius, 11px font, refined active/hover states
- Legend: upgraded backdrop-blur to 16px, box-shadow to `0 8px 32px`, inner border at 10% white
- Listing bubbles: slightly reduced (34px), bolder font (font-display), richer gradients with higher-opacity borders
- Tower pins: refined shadow with `0 0 0 3px rgba(0,0,0,0.22)` outer ring
- MapLibre zoom controls: matched to design system border radius (8px), 28px buttons

### 6. Global Typography & Spacing
- Design tokens refined: darker bg (`#0c0e14`), richer surface stack, crisper border colors
- Primary accent: `#3ec8c8` (slightly more vivid)
- Shadows: richer `rgba(0,0,0,0.55/0.65/0.75)` stack + `inset 0 1px 0 rgba(255,255,255,0.03)` for depth
- Section titles: reduced to `var(--text-base)` / 700 weight — appropriate for dashboard context
- Main content padding: `var(--space-5) var(--space-6)` — slightly tighter top/bottom

### 7. Sidebar
- Active nav item: gradient background + 1px border
- Nav item icons: 14px consistent size, 0.6 opacity (increases on active)
- Nav badge: 9px, 7-letter spacing 0 for cleaner numerics
- Status dot: CSS pulse animation (`0 0 0 0 → 0 0 0 4px → 0`) instead of sharp glow

### 8. Global Polish
- Custom scrollbar: 6px thumb, `var(--color-border)` track, matches surface
- Content section enter animation: 0.18s fade+translateY(4px) for smooth tab switching
- Table: slightly tighter `th` padding (10px), 9.5px column headers
- Detail button: reduced to 26px, tighter border-radius
- Footer: reduced to 36px / `var(--color-bg)` background for recessed feel

## Mobile Responsiveness
- Hero: 190px height, `max-width: 100%` content area on mobile
- KPI grid: `repeat(2, 1fr)` on mobile
- Building cards: single column stack on mobile, 140px image height
- Map controls: simplified, layer toggle hidden on small screens
- All tested on 390×844 viewport

## No Functional Changes
- All data loading, API calls, tab switching, drawer, map interactions preserved
- No HTML modifications beyond adding `<link rel="stylesheet" href="visual-redesign.css">`
- No JavaScript changes
