# FitnessGeek — one app, built around logging

*2026-11-27. Chef: "I think I've over-complicated this thing to the point that I'm not even sure how
it works anymore. Let's clean this up. Make it easy to use. Logging is obviously the most common
interaction so let's focus that and put the rest within reach but not demanding attention every time
you open the app." He approved the whole proposal below. This document is the spec for that work.*

## The rule

**There is one app.** No Simple mode, no Full mode, no setting that picks between them. Where the two
did the same job differently, the easier one wins and the extra detail goes behind a tap. Nothing a
person can do today is removed; it may move.

**Logging comes first.** Opening the app shows today, what is left, and one obvious way to add food.
Everything else is one tap away and never in front.

## What changes

### 1. Today: Home and Food log become one page

- Route `/dashboard`, called **Today** in the navigation. `/food-log` redirects to it and keeps its
  query string (`?date=`, `?meal=`, `?add=`), so old links and the PWA shortcut still land.
- It shows one day, today by default, with previous / next and a way back to today.
- Top to bottom on a phone:
  1. The day, and on today a one-line greeting.
  2. **What is left**: the calorie ring and the sentence ("You have 660 calories left today").
     Macros (protein, carbs, fat, keto net carbs, the full nutrition totals, the activity add-back
     panel) sit behind one **"Macros and details"** disclosure in that card, closed by default; the
     open/closed choice is remembered on that device (localStorage, wrapped in try/catch).
  3. **"What did you eat?"**: the page's one filled button; opens the add sheet on this hour's meal
     (or on the shown day's meal when looking at another day).
  4. **Today's check-ins** (today only): the Weighed / BP / Meds pills.
  5. **The meals**: one card, a row per meal, its foods under it. A food row shows its name, amount
     and calories; tapping it opens the edit dialog (which holds delete, favourite, servings and
     nutrition). Each meal has "Add" and a small "more" menu holding Copy from another day and Save
     as a meal.
  6. **"Did you take your meds?"** (today only, for anyone with medications).
  7. **Your numbers** (weight, blood pressure, steps, streak tiles) and **Notes from the AI**, last.
- From `md` up: two columns. Left: what is left, then the meals. Right: the composer inline ("Tell me
  what you ate", Same-as rows, Again chips, barcode), then check-ins, meds, numbers, notes. The header
  button is not needed where the composer is inline.
- Household view stays reachable from this page (a quiet link or the day's "more" menu).
- A failed read is still never an empty day (the existing `loadProblem` behaviour on both pages).
- The three-step first run shows to a person for whom `useExperience().needsFirstRun` is true.

### 2. One of everything else

- **Medications:** ticks on Today and at the top of the Medications page for everyone. One "Add a
  medication" button opening one dialog; the database search and the extra fields (type, what it is
  for) are in that dialog, behind "More details" if they are not needed to save. Export stays.
- **Edit a food:** total calories first; "per serving and nutrition" behind a disclosure.
- **After describing a meal:** the sheet closes and the meal shows a "Just added" strip with Fix and
  Undo, for everyone.
- **Weight:** one page: the quick weigh-in and the number first, then goal, trend, body composition
  and the log. Nothing hidden by a mode.
- **Settings:** the Simple / Full chooser is removed. Larger text stays.

### 3. Fewer places

- **Trends** (`/trends`): one page with tabs: Food (was Reports), Activity, Health (was Health
  dashboard). `/reports`, `/activity`, `/health` redirect to the matching tab.
- **Saved foods** (`/saved-foods`): one page with tabs: Meals (was My meals), Foods (was My foods).
  `/my-meals`, `/my-foods` redirect to the matching tab. "Look up a specific food" lives in the add
  sheet ("Or pick an exact food"); `/food-search` stays as a route but leaves the navigation.
- **Navigation, sidebar:** Today · Weight · Blood pressure · Medications · Trends · Saved foods.
  Settings stays in the account menu. Calorie plan is reached from Settings and from the target on
  Today; Import a scan from the Weight page and Settings. Both keep their routes.
- **Navigation, phone tabs:** Today · Weight · Trends · More. The More page lists Blood pressure,
  Medications, Saved foods, Calorie plan, Import a scan, Settings.

## What does not change

Data, calculations, targets, API and GraphQL contracts. No backend change. The stored
`experience.mode` field is left alone and only read (to decide who needs the first run).

## How to work on it

- `useExperience()` no longer has `isSimple`, `effectiveMode`, `savedMode` or `setMode`. It has
  `needsFirstRun`, `largerText`, `firstRunDone`, `displayName`, `goal`, `completeFirstRun`, `update`.
- The look is "Daylight" (`DASHBOARD_REDESIGN_SPEC.md`): use the primitives in
  `frontend/src/components/primitives` (`Page`, `Surface`, `LabelPanel`, `Tag`, `LabelBar`, `Ring`,
  `MetricTile`). The suite's spacing unit is **4px** (`sx p: 4` is 16px).
- Phone first: 44px tap targets, 12px minimum text, no sideways scroll.
- Plain words. No "Simple" or "Full" anywhere a person can read.

## Found while building, not fixed

- **"Change today's target" may write the wrong weekday.** `components/Home/DayTargetEditor.jsx` picks
  the schedule slot with `new Date('YYYY-MM-DD').getDay()`, which reads the day at UTC midnight; in US
  time zones that is the evening before, so editing Friday would write Thursday's slot. Carried over
  unchanged from the old Food log gear. Not fixed here because which index the server reads was not
  confirmed. Worth its own look.

