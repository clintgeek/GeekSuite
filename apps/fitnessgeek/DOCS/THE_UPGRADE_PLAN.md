# FitnessGeek — The Upgrade Plan

> **Branch build. Nothing sacred. Go nuts.**
> Audited: Every page, component, theme, service, layout, and dependency.
> Author: Sage × Chef

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Design System Overhaul](#1-design-system-overhaul)
3. [Typography Revolution](#2-typography-revolution)
4. [Navigation & Layout](#3-navigation--layout)
5. [Dashboard Rebuild](#4-dashboard-rebuild)
6. [Food Log — The Core Loop](#5-food-log--the-core-loop)
7. [Weight Tracking](#6-weight-tracking)
8. [Blood Pressure](#7-blood-pressure)
9. [Medications](#8-medications)
10. [Activity / Garmin](#9-activity--garmin)
11. [Reports & Insights](#10-reports--insights)
12. [Health Dashboard](#11-health-dashboard)
13. [Profile & Settings Consolidation](#12-profile--settings-consolidation)
14. [Login & Auth](#13-login--auth)
15. [Stub Pages & Dead Routes](#14-stub-pages--dead-routes)
16. [Architecture & Code Quality](#15-architecture--code-quality)
17. [Performance & PWA](#16-performance--pwa)
18. [Dependency Audit](#17-dependency-audit)
19. [Animations & Motion](#18-animations--motion)
20. [Mobile Experience](#19-mobile-experience)
21. [Implementation Phases](#implementation-phases)

---

## Executive Summary

FitnessGeek is a feature-rich app with **solid bones** — good service layer, lazy loading, dark mode, PWA support, Garmin integration, AI insights. But the UI has grown organically and now suffers from:

- **Identity crisis**: Three different color systems fighting each other (`#6098CC` legacy blue, `#06b6d4` cyan, and CSS custom properties that don't match either)
- **Generic "AI slop" aesthetics**: Inter font, safe Tailwind-esque colors, uniform card-heavy layouts
- **Inconsistent page structure**: Some pages use `Container`, some use raw `Box`, padding varies wildly
- **Duplicated functionality**: Settings page and Profile page overlap significantly (theme, units, Garmin, household)
- **Orphaned/stub pages**: Recipes, Goals (legacy), AITest, BarcodeTest — dead weight in the router
- **No visual hierarchy**: Every page looks the same — header, cards, lists. No personality.
- **Typography is Inter everywhere**: The workflow explicitly flags Inter as an anti-pattern

This plan proposes a **complete visual identity overhaul** while preserving all existing functionality.

---

## 1. Design System Overhaul

### Current Problems
- `theme.jsx` defines cyan/slate palette but pages hardcode `#6098CC`, `#0f172a`, `#64748b` directly
- `index.css` defines CSS custom properties (`--primary-color: #2563eb`) that **don't match** the MUI theme at all
- Cards all have `borderRadius: 24` which makes everything look like bubbly toy UI
- Every card hovers with `translateY(-4px)` — motion without purpose

### Proposed Changes

#### New Aesthetic Direction: **"Clinical Precision meets Warm Data"**
Think: Strava meets a high-end medical dashboard. Data-dense but breathable. Dark sidebar stays, but the content area gets a warmer, more editorial feel.

#### Color System
```
Primary:     #0D9488 (Teal 600) — confident, health-forward, not the overused cyan
Accent:      #F59E0B (Amber 500) — warm highlights for achievements, streaks, warnings  
Success:     #059669 (Emerald 600)
Error:       #DC2626 (Red 600)
Surface:     #FAFAF9 (Stone 50) light / #1C1917 (Stone 900) dark
Card:        #FFFFFF light / #292524 (Stone 800) dark
Sidebar:     #0C0A09 (Stone 950) — near-black, not blue-black
Text:        #1C1917 / #F5F5F4
```

#### Design Tokens
- **Border radius**: `8px` for cards (sharp, editorial), `999px` for pills/chips only
- **Shadows**: Subtle, warm-toned (`rgba(28, 25, 23, 0.08)`) not cool blue shadows
- **Card hover**: Remove global translateY hover. Only interactive cards get subtle shadow lift.
- **Spacing**: Tighten to 6px base with 12/18/24/36/48 scale

#### Action Items
- [ ] Rewrite `theme.jsx` with new palette, remove all hardcoded colors from pages
- [ ] Unify `index.css` custom properties with MUI theme (or remove CSS vars entirely)
- [ ] Create a `tokens.js` file exporting spacing, radius, shadow constants
- [ ] Global find-replace all `#6098CC`, `#06b6d4`, `#0f172a` hardcodes → use `theme.palette.*`
- [ ] Remove `borderRadius: 24` global override, use `8` for cards, `12` for inputs
- [ ] Kill the global card hover translateY effect

---

## 2. Typography Revolution

### Current Problems
- Inter everywhere. The workflow calls this out as an explicit anti-pattern.
- No display/body font pairing. Everything is the same weight/style.
- Headers are large but lack character.

### Proposed Changes

#### Font Pairing: **"DM Serif Display" + "DM Sans"**
- **Display** (h1-h3): DM Serif Display — elegant, warm serifs for page titles. Unexpected in a fitness app. Memorable.
- **Body** (h4-h6, body, UI): DM Sans — geometric sans-serif, cleaner than Inter, pairs perfectly with DM Serif
- **Mono** (data/numbers): JetBrains Mono — for calorie counts, macro numbers, stats. Gives data a "dashboard instrument" feel.

#### Type Scale
```
h1: DM Serif Display, 2.5rem, weight 400 (serifs don't need bold)
h2: DM Serif Display, 2rem, weight 400
h3: DM Serif Display, 1.5rem, weight 400
h4: DM Sans, 1.25rem, weight 600
h5: DM Sans, 1.125rem, weight 600
h6: DM Sans, 1rem, weight 600
body1: DM Sans, 0.9375rem, weight 400
body2: DM Sans, 0.875rem, weight 400
caption: DM Sans, 0.75rem, weight 500, uppercase tracking
data: JetBrains Mono, tabular-nums (for all numeric displays)
```

#### Action Items
- [ ] Install `@fontsource/dm-serif-display`, `@fontsource/dm-sans`, `@fontsource/jetbrains-mono`
- [ ] Remove `@fontsource/inter` and `@fontsource/roboto`
- [ ] Update `theme.jsx` typography config
- [ ] Create a `.data-value` utility class for numeric displays using JetBrains Mono
- [ ] Audit every page header — apply DM Serif Display to page titles

---

## 3. Navigation & Layout

### Current Problems
- Desktop sidebar is fine structurally but has 9 items — too many for primary nav
- Mobile bottom nav only has 4 items (Home, Log, Activity, Profile) — many pages unreachable without the hamburger menu
- `Drawer.jsx` (hamburger drawer) has a **different** set of nav items than `ModernLayout.jsx` sidebar — confusing
- No breadcrumbs or page context on desktop
- Mobile top bar wastes space — just logo + avatar
- Several routes not in any navigation: `my-foods`, `my-meals`, `recipes`, `food-search`, `calorie-wizard`, `barcode-test`, `ai-test`, `settings`

### Proposed Changes

#### Desktop Sidebar
Restructure into **grouped sections** with collapsible groups:

```
TRACK
  Dashboard
  Food Log
  Weight

HEALTH  
  Blood Pressure
  Medications
  Activity
  Health Dashboard

TOOLS
  Food Search
  My Foods
  My Meals
  Calorie Wizard

INSIGHTS
  Reports

─────────
  Settings (gear icon, bottom)
```

- Add section headers (small caps, muted)
- Collapse "TOOLS" by default — it's secondary
- Add a small user card at the bottom (avatar + name + logout)

#### Mobile Navigation
- Keep bottom nav with 5 tabs: **Dashboard, Food Log, Weight, Activity, More**
- "More" opens a full-screen slide-up sheet (not a dropdown menu) with all other pages grouped
- Kill the hamburger menu dropdown — it's a UX dead end

#### Layout Consistency
- Every page gets a consistent wrapper: `<PageContainer title="..." subtitle="...">`
- This component handles: max-width, padding, page header, breadcrumbs
- Remove all per-page `<Container>`, `<Box sx={{ p: 3 }}>` variations

#### Action Items
- [ ] Create `PageContainer.jsx` shared layout component
- [ ] Restructure sidebar into grouped sections
- [ ] Replace mobile dropdown menu with slide-up "More" sheet
- [ ] Add 5th "More" tab to bottom navigation
- [ ] Unify all page wrappers to use `PageContainer`
- [ ] Remove orphaned `Drawer.jsx` (replaced by sidebar)
- [ ] Add subtle page transition animations (fade/slide via framer-motion)

---

## 4. Dashboard Rebuild

### Current Problems
- Bento grid is a good concept but the calorie ring takes up 1/3 of the viewport on desktop
- Stat cards (weight, BP, steps, streak) are visually identical — no hierarchy
- Quick actions are buried in a small card
- Meal cards at the bottom are often empty and take up space
- AI Insights card is always at the very bottom — easy to miss
- Greeting emoji (🌅☀️🌙) feels amateur

### Proposed Changes

#### New Layout: "Command Center"
```
┌─────────────────────────────────────────────┐
│  Good morning, Chef.              Feb 13    │
│  1,247 of 2,000 kcal  ████████░░░░  62%    │  ← Compact inline calorie bar
├──────────┬──────────┬──────────┬────────────┤
│ Protein  │  Carbs   │   Fat    │  + Log     │  ← Macro pills + primary CTA
│ 82/150g  │ 120/250g │  45/65g  │   Food     │
├──────────┴──────────┴──────────┴────────────┤
│                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ -2.1 lbs│ │ 118/76  │ │  8,432  │       │  ← Stat cards, compact
│  │ Weight  │ │   BP    │ │  Steps  │       │
│  └─────────┘ └─────────┘ └─────────┘       │
│                                             │
│  Today's Meals                              │
│  ┌──────────────────────────────────────┐   │
│  │ Breakfast: Oatmeal, Coffee    420cal │   │  ← Compact meal rows, not cards
│  │ Lunch: (empty — tap to add)         │   │
│  │ Dinner: (empty — tap to add)        │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  AI Insight: "You're 200cal under target..." │  ← Inline, not a separate card
└─────────────────────────────────────────────┘
```

#### Key Changes
- **Kill the giant calorie ring** on desktop. Replace with a compact horizontal progress bar with the number inline. Keep the ring on mobile only (smaller, 160px).
- **Macro bars** become compact colored pills in a row, not a full-width card
- **Stat cards** become a tight 3-4 column row with icon + value + label only
- **Meals** become a compact list/table, not 4 separate cards. Empty meals show "tap to add" inline.
- **AI Insight** becomes a subtle banner/callout, not a full card section
- **Quick action "Log Food"** becomes the primary CTA button, always visible
- **Remove greeting emoji**. Keep the text greeting, add the date.
- **Login streak** → move to profile or remove from dashboard (low-value metric)

#### Action Items
- [ ] Redesign `DashboardNew.jsx` with new layout
- [ ] Create `CompactCalorieBar.jsx` (horizontal, inline)
- [ ] Create `MacroPills.jsx` (compact row of colored pills)
- [ ] Refactor `MealCard.jsx` → `MealRow.jsx` (compact list item)
- [ ] Move `AIInsightsCard` to a subtle inline callout
- [ ] Add prominent "Log Food" floating action button on mobile

---

## 5. Food Log — The Core Loop

### Current Problems
- This is the most-used page but it's visually dense and cluttered
- `QuickAddPanel` (favorites/recent) is useful but looks like an afterthought
- `CalorieSummary` embedded in `DateNavigator` is clever but the calorie goal panel toggle is confusing UX
- Copy Meal and Household buttons are icon-only on mobile — not discoverable
- Meal sections are vertically stacked with no visual differentiation
- The `AddFoodDialog` is a modal — on mobile this is fine, but on desktop it could be inline

### Proposed Changes

#### Layout
- **Date navigator** stays but gets a cleaner design — larger touch targets, swipe support
- **Calorie bar** becomes a sticky header element (visible while scrolling)
- **Quick Add** panel gets promoted — show 3-4 recent foods as tappable chips above the meal sections
- **Meal sections** get color-coded left borders (breakfast=amber, lunch=green, dinner=blue, snack=gray)
- **Empty meal sections** collapse to a single "Add breakfast" button row
- **Nutrition summary** moves from bottom to a collapsible section under the calorie bar

#### Interaction Improvements
- **Swipe left on a food item** to delete (mobile)
- **Long press** to edit (mobile)
- **Inline quick-add**: Type a food name directly in the meal section header to search
- **Batch mode indicator**: When multi-adding, show a count badge

#### Action Items
- [ ] Redesign `DateNavigator` with larger touch targets
- [ ] Make calorie summary sticky on scroll
- [ ] Add color-coded left borders to meal sections
- [ ] Collapse empty meal sections
- [ ] Promote QuickAddPanel with recent food chips
- [ ] Add swipe-to-delete gesture (mobile)
- [ ] Consider inline search in meal section headers

---

## 6. Weight Tracking

### Current Problems
- Page is well-structured but `WeightProgress`, `WeightTimeline`, `QuickAddWeight`, `WeightLogList` are all separate cards stacked vertically — feels like 4 separate features, not one cohesive view
- Hardcoded `color: '#0f172a'` in header — doesn't respect dark mode
- Hardcoded `unit="lbs"` everywhere — should come from user settings

### Proposed Changes
- **Combine** progress + timeline into one card with tabs (Progress | Chart | History)
- **Quick add** becomes a floating input at the top, not a separate card
- **Pull unit from settings context** instead of hardcoding `"lbs"`
- **Add weight trend sparkline** to the page header (tiny inline chart)
- **Goal visualization**: Show goal line on the chart, with projected completion date

#### Action Items
- [ ] Consolidate weight components into tabbed card
- [ ] Float quick-add input to top of page
- [ ] Pull weight unit from SettingsContext
- [ ] Add sparkline to page header
- [ ] Fix hardcoded colors → use theme

---

## 7. Blood Pressure

### Current Problems
- Well-built page with good components (Nivo charts, insights, category distribution)
- `logger` is referenced but never imported (line 194 — will crash on error)
- Time range buttons are centered — should be left-aligned with the chart
- `QuickAddBP` and `BPLogList` are in a Grid but both are `xs={12}` — the grid adds nothing

### Proposed Changes
- **Fix the missing `logger` import** (critical bug)
- **Compact the layout**: Insights + Category Distribution side-by-side on desktop
- **Remove unnecessary Grid wrapper** around QuickAdd and LogList
- **Add BP trend indicator** in the page header (like "Trending normal ✓")
- **Heart Rate chart** should be in a tab, not always visible below

#### Action Items
- [ ] Fix missing `logger` import in BloodPressure.jsx
- [ ] Side-by-side insights + category on desktop
- [ ] Remove unnecessary Grid wrappers
- [ ] Add BP trend indicator to header
- [ ] Tab-ify HR chart

---

## 8. Medications

### Current Problems
- This is the longest page file (677 lines) — needs decomposition
- PDF generation logic is inline (130+ lines of jsPDF code in the component)
- Search results hover uses hardcoded `#f8fafc` — doesn't respect dark mode
- Med type colors are hardcoded objects, not theme-aware
- The "time of day" grouping is good UX but visually flat
- No medication adherence tracking (did you take it today?)

### Proposed Changes
- **Extract PDF generation** into a utility/service (`medsPdfExport.js`)
- **Extract med type colors** into theme or constants
- **Add daily adherence checkboxes**: "Did you take your morning meds?" — simple toggle per time slot
- **Visual redesign**: Time-of-day sections get distinct background colors (morning=warm amber tint, evening=cool blue tint)
- **Low supply warnings** should be more prominent — maybe a top-of-page alert banner
- **Fix dark mode**: Replace all hardcoded colors with theme values

#### Action Items
- [ ] Extract PDF generation to `utils/medsPdfExport.js`
- [ ] Extract search/editor/list into sub-components
- [ ] Add daily adherence tracking UI
- [ ] Theme-aware med type colors
- [ ] Fix dark mode hardcoded colors
- [ ] Add low-supply alert banner at top of page

---

## 9. Activity / Garmin

### Current Problems
- Good data display but entirely dependent on Garmin — no manual activity logging
- Sleep section is very long with many conditional blocks — hard to scan
- No date navigation — only shows "today"
- `StatCard` is defined locally in this file but a different `StatCard` exists in `Dashboard/` — naming collision

### Proposed Changes
- **Add date navigation** (same pattern as Food Log)
- **Add manual activity logging** for users without Garmin
- **Rename local `StatCard`** to `ActivityStatCard` to avoid confusion
- **Collapse sleep details** into an expandable section — show sleep score + total time by default
- **Add weekly activity summary** (total steps, calories, workouts this week)

#### Action Items
- [ ] Add date navigation to Activity page
- [ ] Add manual activity entry form
- [ ] Rename local StatCard → ActivityStatCard
- [ ] Collapse sleep details into expandable section
- [ ] Add weekly summary row

---

## 10. Reports & Insights

### Current Problems
- Good feature set (overview, trends, AI coach, trend watch, CSV export)
- Daily totals table is plain — no visual indicators for good/bad days
- Goal compliance progress bars are unstyled (default MUI LinearProgress)
- AI content rendering is custom markdown parsing — fragile

### Proposed Changes
- **Color-code daily totals**: Green rows for on-target days, amber for close, red for way off
- **Style goal compliance bars** with custom colors matching the metric
- **Replace custom markdown parser** with a lightweight markdown renderer (e.g., `react-markdown` — already small)
- **Add date range picker** instead of just 7/14/30 toggle buttons
- **Add charts**: Line chart for calorie trend over the period (use existing Nivo/Recharts)
- **Top Foods** section → add a simple horizontal bar chart

#### Action Items
- [ ] Color-code daily totals table rows
- [ ] Style goal compliance bars
- [ ] Consider react-markdown for AI content
- [ ] Add calorie trend line chart
- [ ] Add horizontal bar chart for top foods
- [ ] Add custom date range picker

---

## 11. Health Dashboard

### Current Problems
- Requires InfluxDB — good gating, but the "not enabled" state is just an Alert + settings form
- Uses raw `<input type="date">` instead of MUI date picker — looks out of place
- Tab navigation works but 5 tabs is a lot on mobile
- "AI Analysis feature coming soon!" alert is embarrassing in production

### Proposed Changes
- **Replace raw date input** with MUI DatePicker or at minimum a styled input
- **Remove the "coming soon" alert** — either implement or remove the button
- **On mobile**: Convert tabs to a horizontal scrollable chip bar
- **Empty state for "not enabled"**: Make it visually appealing — show a preview/mockup of what they'd see

#### Action Items
- [ ] Replace raw date input with styled component
- [ ] Remove "coming soon" alert
- [ ] Mobile-friendly tab navigation
- [ ] Better empty state for InfluxDB not enabled

---

## 12. Profile & Settings Consolidation

### Current Problems
- **Profile.jsx** (506 lines) and **Settings.jsx** (428 lines) have massive overlap:
  - Both have theme selection
  - Both have unit selection
  - Both have Garmin integration
  - Both have Household settings
- Settings page has non-functional items ("Privacy & Security", "Data & Storage", "Help & Support", "About FitnessGeek v1.0.0") — these are placeholder ListItems that do nothing
- Profile page mixes user info editing with app settings
- Settings page uses raw `<input>` for Garmin credentials instead of MUI TextField

### Proposed Changes

#### Merge into a single "Settings" page with sections:
```
/settings
  ├── Profile (avatar, name, email, age, height, gender)
  ├── Appearance (theme, display density)
  ├── Units (weight, height)
  ├── Nutrition Goals (link to calorie wizard)
  ├── Integrations
  │   ├── Garmin
  │   └── InfluxDB
  ├── Household
  ├── Notifications
  └── Account (change password, logout, danger zone)
```

- **Delete** the standalone Profile page — redirect `/profile` → `/settings`
- **Remove** all non-functional placeholder items
- **Use accordion sections** for clean organization
- **Fix** Garmin settings to use MUI TextField (not raw `<input>`)

#### Action Items
- [ ] Merge Profile + Settings into unified Settings page
- [ ] Redirect `/profile` → `/settings`
- [ ] Remove non-functional placeholder items
- [ ] Organize into accordion sections
- [ ] Fix Garmin raw input → MUI TextField
- [ ] Update nav items (remove Profile, keep Settings)

---

## 13. Login & Auth

### Current Problems
- Login page is purely functional — no branding, no visual identity
- Dev login form is unstyled (just stacked fields)
- Production login is just a spinner + "Redirecting to baseGeek…" — no context

### Proposed Changes
- **Branded login page**: Show the FitnessGeek logo, a hero illustration or gradient background, and the app tagline
- **Dev login**: Style it properly with the new design system
- **Production redirect**: Show a branded loading state with the FitnessGeek → BaseGeek SSO flow explained
- **Add "Remember me" context**: Show what app they're logging into

#### Action Items
- [ ] Design branded login page with gradient/illustration background
- [ ] Style dev login form
- [ ] Branded SSO redirect state
- [ ] Add app branding to login flow

---

## 14. Stub Pages & Dead Routes

### Current Problems
- **Recipes.jsx**: 21 lines, just says "coming soon" — registered in router
- **Goals.jsx**: 464 lines of legacy code, uses old `#6098CC` color, `Grid` without `item` prop (MUI v7 issue). The route was removed from nav but the file and route still exist
- **AITest.jsx**: Test page in production router
- **BarcodeTest.jsx**: Test page in production router (exists in both `/pages/` and `/src/`)
- **Food.jsx**: 3KB file, unclear if used
- **FoodLog.jsx** and **FoodSearch.jsx** exist in both `/src/` root AND `/src/pages/` — the root versions are likely legacy

### Proposed Changes
- [ ] **Delete** `Recipes.jsx` — remove route, remove from any nav
- [ ] **Delete** `Goals.jsx` — functionality moved to calorie wizard + settings
- [ ] **Delete** `AITest.jsx` — remove route
- [ ] **Delete** `BarcodeTest.jsx` (both copies) — remove route
- [ ] **Delete** `/src/FoodLog.jsx` and `/src/FoodSearch.jsx` (root-level legacy copies)
- [ ] **Delete** `/src/BarcodeScanner.jsx` and `/src/BarcodeTest.jsx` (root-level)
- [ ] **Delete** `/src/useBarcodeScanner.js` (root-level, duplicate of hooks version)
- [ ] **Audit** `Food.jsx` — delete if unused
- [ ] Clean up `App.jsx` routes for all removed pages

---

## 15. Architecture & Code Quality

### Current Problems
- **No TypeScript**: The project has `@types/react` installed but no `.tsx` files
- **Duplicate charting libraries**: Both `chart.js` + `react-chartjs-2` AND `recharts` AND `@nivo/*` are installed. Three charting libraries.
- **State management**: Mix of React Context (`AuthContext`, `SettingsContext`, `ThemeContext`) and Zustand (installed but unclear where used). Pick one.
- **15 service files**: Good separation, but `fitnessGeekService.js` (11KB) is a god-service doing too much
- **No error boundaries**: App will white-screen on any unhandled error
- **Inconsistent exports**: Some services use named exports, some default exports

### Proposed Changes

#### Charting
- **Pick one**: Nivo is already used for BP charts and is the most capable. Migrate everything to Nivo.
- Remove `chart.js`, `react-chartjs-2`, and `recharts` from dependencies
- This saves ~150KB from the bundle

#### State Management
- **Audit Zustand usage** — if it's not used, remove it. If it is, migrate contexts to Zustand stores.
- Consider Zustand for `SettingsContext` (it's fetched once and read everywhere — perfect Zustand use case)

#### Error Handling
- Add `<ErrorBoundary>` component wrapping each route
- Add a friendly error page instead of white screen

#### ~~Service Layer~~ — DEFERRED
> Splitting `fitnessGeekService.js` is correct in theory but invisible work.
> Danger of killing momentum during a UI sprint. Revisit post-overhaul.

#### ~~TypeScript Migration~~ — DEFERRED
> Months-long payoff, not a weekend payoff. Not wrong, just not aligned with the current mission.

#### Action Items
- [ ] Consolidate to Nivo for all charts, remove chart.js + recharts
- [ ] Audit and resolve Zustand vs Context
- [ ] Add ErrorBoundary component

---

## 16. Performance & PWA

### Current Problems
- Lazy loading is good (all pages are lazy)
- PWA manifest references SVG icons — some devices don't support SVG for PWA icons
- `theme-color` in `index.html` is `#6098CC` — doesn't match actual theme
- No service worker caching strategy visible
- `vite-plugin-pwa` is installed but config not audited

### Proposed Changes
- [ ] Generate proper PNG icons (192x192, 512x512) from SVG
- [ ] Update `theme-color` meta tag to match new primary color
- [ ] Audit `vite.config.js` PWA configuration
- [ ] Add route-level code splitting for heavy components (Nivo charts, jsPDF)
- [ ] Lazy load `jsPDF` and `html2canvas` only when export is triggered
- [ ] Add `loading="lazy"` to any images

---

## 17. Dependency Audit

### Current State
```
@dnd-kit/*        — Used for dashboard reordering. Keep.
@emotion/*        — Required by MUI. Keep.
@fontsource/inter — REPLACE with DM Serif Display + DM Sans
@fontsource/roboto — REMOVE (not used in theme)
@mui/*            — Core UI. Keep. (v7.2 — latest, good)
@nivo/*           — Charts. Keep, expand usage.
axios             — HTTP. Keep.
chart.js          — REMOVE (consolidate to Nivo)
chartjs-adapter-date-fns — REMOVE (goes with chart.js)
date-fns          — Date utils. Keep.
framer-motion     — Animations. Keep, use more.
html2canvas       — PDF export. Keep but lazy-load.
html5-qrcode      — Barcode scanning. Keep.
jspdf             — PDF export. Keep but lazy-load.
react-chartjs-2   — REMOVE (consolidate to Nivo)
recharts          — REMOVE (consolidate to Nivo)
zustand           — State management. Audit usage, keep or remove.
```

### New Dependencies to Add
```
@fontsource/dm-serif-display  — Display font
@fontsource/dm-sans           — Body font
@fontsource/jetbrains-mono    — Data/number font
@nivo/bar                     — Bar charts for reports
react-markdown (optional)     — AI content rendering
```

### Net Result
- **Remove 4 packages** (chart.js, chartjs-adapter-date-fns, react-chartjs-2, recharts, @fontsource/roboto)
- **Add 3 packages** (3 fonts)
- **Bundle size reduction**: ~150-200KB estimated

#### Action Items
- [ ] Remove unused charting dependencies
- [ ] Remove @fontsource/roboto
- [ ] Add new font packages
- [ ] Lazy-load jsPDF + html2canvas
- [ ] Audit Zustand usage

---

## 18. Animations & Motion

### Current State
- `framer-motion` is installed but barely used
- Theme has CSS transitions on cards/buttons (0.2s ease) — fine but generic
- No page transitions
- No loading skeletons (just CircularProgress spinners everywhere)

### Proposed Changes

#### Page Transitions
- Wrap `<Outlet>` in `<AnimatePresence>` with a subtle fade+slide (opacity 0→1, y: 8→0, 200ms)

#### Loading States
- Replace all `<CircularProgress>` full-page spinners with **skeleton screens**
- Dashboard: Show skeleton cards in the grid layout
- Food Log: Show skeleton meal sections
- Use MUI's built-in `<Skeleton>` component

#### Micro-interactions
- **Calorie ring**: Animate on load (count up from 0)
- **Macro bars**: Animate width on load
- **Stat cards**: Stagger entrance (50ms delay between each)
- **Adding food**: Brief scale pulse on the meal section when food is added
- **Deleting food**: Slide-out animation

#### Action Items
- [ ] Add AnimatePresence page transitions
- [ ] Replace CircularProgress with Skeleton screens
- [ ] Animate calorie ring and macro bars on load
- [ ] Stagger stat card entrance
- [ ] Add food add/delete animations

---

## 19. Mobile Experience

### Current Problems
- Bottom nav only has 4 items — many pages unreachable
- No pull-to-refresh on any page
- Touch targets on some buttons are too small (< 44px)
- Date navigation in Food Log uses small arrow buttons
- No haptic feedback on actions
- Calorie ring is too large on mobile (200px)

### Proposed Changes
- [ ] Add 5th "More" tab to bottom nav
- [ ] Add pull-to-refresh on Dashboard and Food Log
- [ ] Audit all touch targets — minimum 44x44px
- [ ] Date navigation: Add swipe gesture support
- [ ] Reduce calorie ring to 140px on mobile (or replace with bar)
- [ ] Add subtle haptic feedback on food log/weight add (if supported)
- [ ] Test and fix safe-area-inset handling on all pages

---

## Implementation Phases

### Phase 0: Cleanup (1 day)
- Delete dead files and routes
- Fix the BP `logger` bug
- Remove non-functional Settings placeholders
- Unify hardcoded colors → theme references

### Phase 1: Design Foundation (2-3 days)
- New color palette + design tokens
- New typography (font swap)
- Updated theme.jsx
- PageContainer component
- Navigation restructure (sidebar groups, mobile "More" tab)

### Phase 2: Core Pages (3-4 days)
- Dashboard rebuild
- Food Log refinements
- Weight page consolidation
- Profile + Settings merge

### Phase 3: Polish Pages (2-3 days)
- Blood Pressure fixes
- Medications decomposition + adherence
- Activity date navigation
- Reports charts + styling

### Phase 4: Motion & Performance (1-2 days)
- Page transitions
- Skeleton loading states
- Chart library consolidation
- Lazy loading optimizations
- PWA fixes

### Phase 5: Mobile Excellence (1-2 days)
- Touch target audit
- Pull-to-refresh
- Swipe gestures
- Bottom nav "More" sheet
- Safe area testing

---

## Success Criteria

- [ ] Zero hardcoded color values in any component
- [ ] Consistent page structure via PageContainer
- [ ] No duplicate functionality between pages
- [ ] No dead routes or stub pages
- [ ] Single charting library (Nivo)
- [ ] Distinctive typography (not Inter/Roboto)
- [ ] All pages respect dark mode
- [ ] Mobile touch targets ≥ 44px
- [ ] Page load shows skeletons, not spinners
- [ ] Bundle size reduced by ≥100KB

---

*"Chef builds the fire. Sage keeps it burning."*
*Let's make this thing unforgettable.*
