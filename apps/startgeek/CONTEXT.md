# StartGeek v2 — Console

## Identity

- **App**: `startgeek`
- **Image**: `ghcr.io/clintgeek/startgeek:latest`
- **Port**: `3000`
- **Domain**: `https://start.clintgeek.com`
- **Working name for the concept**: DashGeek (Day at a Glance). There is no separate `dashgeek` app, image, or domain.

## What This Is

- A browser start page for the GeekSuite ecosystem, styled as a quiet console:
  dark ground, dark-glass panels with hairlines, thin tabular numerals, one
  warm accent. Futuristic by precision, not by neon.
- Deliberately small. Six things, in this order: time and date, today's
  weather (click for a detail modal with the week), the command bar, then
  one block: Tasks on the left (overdue, today, upcoming; scrolls) sized to
  Fitness and Reading stacked on the right.
- Logged-out: rail (sign in, settings), clock, weather block, command bar
  (web search only), dock.
- Logged-in: the above plus quick capture, suite search, and the module row
  from basegeek.

## What This Is NOT

- Not an admin dashboard and not a SaaS homepage.
- No StoryGeek widgets. No StartGeek backend. No separate `dashgeek` deployment.
- **Revised 2026-09-03:** the original v2 brief forbade card grids, charts,
  and user-configurable widgets; the console redesign added a module grid,
  meters, and per-block switches on purpose. Later the same day Chef cut the
  grid back to one row (Tasks · Fitness · Reading) and moved weather into the
  hero. Habits, Notes, a 7-day Week module, a day track, and a summary line
  were built and then removed as "too much". Don't re-add them without asking.

## Design tokens

Every colour resolves to a CSS variable in `src/index.css` (`--ground`,
`--panel`, `--hair`, `--ink` … `--accent`, `--critical`, `--sky`).
`tailwind.config.js` maps them to utility names (`text-ink-2`, `border-hair`,
`bg-panel`). **Tailwind opacity modifiers do not work on these** (`text-ink/50`
silently compiles to nothing); use an arbitrary `rgba(...)` value instead.

Panels (`.mod`) are dark glass: `rgba(12,15,21,0.58)` + 18px backdrop blur.
Layout classes live in `index.css`: `.hero.with-weather` splits at 820px;
`.row.with-side` puts Tasks in a two-row span on the left so Fitness +
Reading set the height and the task list scrolls inside it. The command box
sits at `z-20` so its results dropdown paints over the row. Photo backdrop is
blurred 7px behind a graded scrim.

Type is Geist across its range: weight 200 for the clock and the big
temperature, 400/500 for content, Geist Mono for labels, counts, and streaks.

## Settings

`SettingsContext` persists `{ backdrop, clock, modules }` to
`localStorage['startgeek.settings']`. No backend. The sheet opens from the rail
control or the `,` key. Block list, defaults, and allowed values live in
`src/config/modules.js` (`weather`, `today` = Tasks, `fitness`, `reading`).
A block with no data stays hidden even when on. Logged out, only `weather`
and the backdrop/clock controls show.

- **Backdrop** `photo` (default): picsum wallpaper, blurred, behind a scrim.
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
  App.jsx              — Shell: rail, hero (clock + weather block), command box, module row, dock, sheets
  main.jsx             — React entry point
  index.css            — Tokens + component CSS (panel, dot, meter, range, switch, seg)
  constants.js         — Timing, animation, forecast constants
  config/
    apps.jsx              — Dock apps
    modules.js            — Switchable blocks, defaults, allowed setting values
  components/
    BackgroundManager.jsx — Photo / void backdrop
    DateTime.jsx          — Clock (12h/24h from settings)
    WeatherBlock.jsx      — Today's weather panel in the hero; click opens the modal
    WeatherModal.jsx      — Today's details + 7-day range bars; focus-trapped
    CommandBox.jsx        — Quick capture / search box
    HelpButton.jsx, HelpModal.jsx, SearchResults.jsx, Toast.jsx
    Module.jsx            — Panel wrapper: label, count, link, foot, span
    ModuleGrid.jsx        — Tasks (overdue / today / upcoming, scrolls) beside stacked Fitness + Reading
    TaskRow.jsx           — Task line with dot, tags, event time, overdue pill
    FitnessModule.jsx     — Calories meter, meals, streak
    ReadingModule.jsx     — One book: cover, title, author, progress
    SettingsSheet.jsx     — Blocks, backdrop, clock; focus-trapped
    AppDock.jsx, DockItem.jsx, SessionButton.jsx, icons.jsx
  context/
    SettingsContext.jsx   — localStorage-backed settings
    WeatherContext.jsx    — Local conditions + forecast (sunrise/sunset included)
    SessionContext.jsx    — Auth state
    GlanceContext.jsx     — glanceToday data (tasks incl. upcoming, reading, fitness)
  hooks/
    useSettings.js, useTime.js, useWeather.js, useSession.js, useGlance.js
  services/
    weatherService.js     — Open-Meteo / ipapi client
  lib/
    graphql.js, queries.js, basegeek.js, engines.js, commandMode.js, parseTaskInput.js
```

## Deferred

- Flock module. Data is still returned by the resolver; the frontend query
  no longer asks for it.
- Habits and Notes blocks: removed 2026-09-03 by request. The resolver still
  returns them; `GLANCE_TODAY` no longer requests them.
- Settings sync across browsers (would be a small JSON blob on the basegeek
  user record).
- Whether the Reading block should also consider the `on-reader` shelf
  (currently `reading` only, decided in basegeek's glance resolver).
