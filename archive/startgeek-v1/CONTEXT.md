# GeekSuite Launcher

## Project Identity

This project is the **GeekSuite Launcher** — the OS-like desktop and entry point for the entire GeekSuite app ecosystem. It evolved from the StartGeek browser start page codebase.

## What This Is

- A calm personal desktop that opens when the browser starts
- The launcher / home screen for all GeekSuite apps
- Answers the question: "What am I doing today?"

## What This Is NOT

- Not an admin dashboard
- Not a SaaS homepage
- Not a card grid of apps
- No analytics, charts, KPIs, or dense widgets

## Mental Model

Think: Mac desktop + tablet home screen + calm focus workspace

## Core Apps (Primary — in Dock)

| App | Purpose |
|-----|---------|
| NoteGeek | Thinking / notes / workbench |
| BujoGeek | Planning / daily tasks / bullet journal |
| FitnessGeek | Health + tracking dashboard |
| FlockGeek | Chicken / flock management |

## Secondary Apps (Hidden by Default)

| App | Purpose |
|-----|---------|
| BookGeek | Reading / books |
| PhotoGeek | Photos |
| MusicGeek | Music |
| BabelGeek | Language |
| StoryGeek | Writing / stories |

## Layout Structure

1. **Hero Section** — Large time/date display, ambient weather (top)
2. **Resume Surface** — "Continue where you left off" recent activity tiles (center, below time)
3. **App Dock** — macOS-style floating dock with primary apps (fixed bottom)
4. **Secondary Apps Panel** — Hidden by default, expandable from dock "All Apps" button

## Tone

Calm, minimal, intentional, slightly warm and human.

Keywords: calm, focused, intentional, warm, personal, minimal.

## Tech Stack

- React 18 + Vite 5
- Tailwind CSS 3
- Framer Motion 10
- Geist font family
- Open-Meteo weather API (free, no key)
- picsum.photos for backgrounds (free, no key)

## File Structure

```
src/
  App.jsx                    — Main layout (hero + resume + dock)
  main.jsx                   — React entry point
  index.css                  — Global styles (Tailwind)
  constants.js               — Timing, animation, forecast constants
  components/
    BackgroundManager.jsx    — Full-bleed background image
    DateTime.jsx             — Large centered time + date
    WeatherStrip.jsx         — Ambient weather (simplified)
    AppDock.jsx              — Primary apps dock (fixed bottom)
    DockItem.jsx             — Individual dock icon + label
    ResumeSection.jsx        — Recent activity tiles
    SecondaryAppsPanel.jsx   — Hidden secondary apps panel
    WorldClocks.jsx          — (Legacy, no longer used in layout)
  context/
    WeatherContext.jsx       — Weather data provider
    weatherContextValue.js   — Context creation
  hooks/
    useTime.js               — Shared time hook
    useWeather.js            — Weather context consumer
  services/
    weatherService.js        — Open-Meteo weather service
```
