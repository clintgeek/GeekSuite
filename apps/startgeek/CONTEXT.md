# StartGeek v2 — Console

## Identity

- **App**: `startgeek`
- **Image**: `ghcr.io/clintgeek/startgeek:latest`
- **Port**: `3000`
- **Domain**: `https://start.clintgeek.com`
- **Working name for the concept**: DashGeek (Day at a Glance). There is no separate `dashgeek` app, image, or domain.

## What This Is

- A browser start page for the GeekSuite ecosystem, styled as a quiet console:
  dark ground, hairlines instead of card chrome, thin tabular numerals, one
  warm accent. Futuristic by precision, not by neon.
- Logged-out: rail (weather, sign in, settings), clock and day track, web
  search, Week module, dock.
- Logged-in: the above plus quick capture (tasks, notes, suite search), a
  one-line summary, and the module grid pulled from basegeek.

## What This Is NOT

- Not an admin dashboard and not a SaaS homepage.
- No StoryGeek widgets. No StartGeek backend. No separate `dashgeek` deployment.
- **Revised 2026-09-03:** the original v2 brief forbade card grids, charts,
  and user-configurable widgets. The console redesign deliberately adds a
  module grid, thin meters and range bars, and per-module switches. Those
  rules no longer apply; the "calm, one click from the owning app" spirit does.

## Design tokens

Every colour resolves to a CSS variable in `src/index.css` (`--ground`,
`--panel`, `--hair`, `--ink` … `--accent`, `--critical`, `--sky`).
`tailwind.config.js` maps them to utility names (`text-ink-2`, `border-hair`,
`bg-panel`). **Tailwind opacity modifiers do not work on these** (`text-ink/50`
silently compiles to nothing); use an arbitrary `rgba(...)` value instead.

Type is Geist across its range: weight 200 for the clock, 400/500 for
content, Geist Mono for labels, counts, times, and streaks.

## Settings

`SettingsContext` persists `{ backdrop, clock, modules }` to
`localStorage['startgeek.settings']`. No backend. The sheet opens from the rail
control or the `,` key. Module list, defaults, and allowed values live in
`src/config/modules.js`. A module with no data stays hidden even when on.
Logged out, only non-auth modules (Week) and the backdrop/clock controls show.

- **Backdrop** `photo` (default): picsum wallpaper behind a graded scrim.
  `void`: no photo, flat ground with a faint grid.
- **Clock** `12` (default) or `24`.

## Tech Stack

- React 18 + Vite 5
- Tailwind CSS 3
- Framer Motion 10
- `serve` for static production
- ESLint 8 with its own `.eslintrc.cjs`
- Standalone `npm` app with its own `package-lock.json`; no pnpm workspace or `workspace:*` dependencies.

## File Map

```
src/
  App.jsx              — Shell: rail, hero (clock + day track + summary), command box, module grid, dock, settings sheet
  main.jsx             — React entry point
  index.css            — Tokens + component CSS (module, track, habit, meter, switch, seg)
  constants.js         — Timing, animation, forecast constants
  config/
    apps.jsx              — Dock apps
    modules.js            — Switchable modules, defaults, allowed setting values
  components/
    BackgroundManager.jsx — Photo / void backdrop
    DateTime.jsx          — Clock (12h/24h from settings)
    DayTrack.jsx          — 24-hour hairline with daylight and live marker
    GlanceSummary.jsx     — One-line summary under the track (signed in)
    WeatherStrip.jsx      — Rail conditions: city, temp, description, H/L, RH, wind
    CommandBox.jsx        — Quick capture / search box
    HelpButton.jsx, HelpModal.jsx, SearchResults.jsx, Toast.jsx
    Module.jsx            — Panel wrapper: label, count, link, foot, span
    ModuleGrid.jsx        — 12-column dense grid; decides which modules render
    TaskRow.jsx, HabitRow.jsx, NoteRow.jsx, BookRow.jsx — module rows
    FitnessModule.jsx     — Calories meter, meals, streak
    WeekModule.jsx        — 7-day forecast, hi/lo range bars
    SettingsSheet.jsx     — Modules, backdrop, clock; focus-trapped
    AppDock.jsx, DockItem.jsx, SessionButton.jsx, icons.jsx
  context/
    SettingsContext.jsx   — localStorage-backed settings
    WeatherContext.jsx    — Local conditions + forecast (world cities removed)
    SessionContext.jsx    — Auth state
    GlanceContext.jsx     — glanceToday data
  hooks/
    useSettings.js, useTime.js, useWeather.js, useSession.js, useGlance.js
  services/
    weatherService.js     — Open-Meteo / ipapi client (forecast includes sunrise/sunset)
  lib/
    graphql.js, queries.js, basegeek.js, engines.js, commandMode.js, parseTaskInput.js
```

## Deferred

- Flock module (three figures plus a seven-day egg bar). Needs a
  `weekByDay` field on `GlanceFlock`. The data is still fetched by
  `GLANCE_TODAY`; nothing renders it.
- Settings sync across browsers (would be a small JSON blob on the basegeek
  user record).
