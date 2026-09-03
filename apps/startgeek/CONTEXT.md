# StartGeek v2

## Identity

- **App**: `startgeek`
- **Image**: `ghcr.io/clintgeek/startgeek:latest`
- **Port**: `3000`
- **Domain**: `https://start.clintgeek.com`
- **Working name for the concept**: DashGeek (Day at a Glance). There is no separate `dashgeek` app, image, or domain.

## What This Is

- A calm, minimal browser start page for the GeekSuite ecosystem.
- Logged-out: time, date, weather, web search, dock, and a login path.
- Logged-in: the above plus quick capture (tasks, notes, suite search) and a glance column of today's data pulled from basegeek.

## What This Is NOT

- Not an admin dashboard, not a SaaS homepage, not a dense card grid.
- No analytics, charts, KPIs, or StoryGeek widgets.
- No StartGeek backend and no separate `dashgeek` deployment.

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
  App.jsx              — Shell layout (weather strip, clock, command box slot, glance slot, dock)
  main.jsx             — React entry point
  index.css            — Tailwind + global styles
  constants.js         — Timing, animation, forecast constants
  components/
    BackgroundManager.jsx — Wallpaper
    DateTime.jsx          — Clock
    WeatherStrip.jsx      — Ambient weather
    AppDock.jsx           — Primary app dock
    DockItem.jsx          — Dock icon
    icons.jsx             — App icons
    CommandBox.jsx        — Quick capture / search box (Phase 3)
    GlanceColumn.jsx      — Today-at-a-glance column (Phase 4)
  context/
    WeatherContext.jsx    — Weather data provider
    weatherContextValue.js — Context token
    SessionContext.jsx    — Auth state
  hooks/
    useTime.js            — Shared clock timer
    useWeather.js         — Weather context consumer
  services/
    weatherService.js     — Open-Meteo / ipapi client
```
