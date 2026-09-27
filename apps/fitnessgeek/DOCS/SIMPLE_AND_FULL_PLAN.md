# FitnessGeek — Simple and Full: a proposal

*Written 2026-09-27. **Status: approved and building** (Chef: "Let's do the fitnessgeek stuff in a single commit by itself so we can easily reverse it if we need to."). The first draft was a proposal only ("Don't fix yet, but propose"). Chef:
"This is a constant use app and one of the parties isn't terribly technical anymore." The
Simple face is designed around **Heather** (Chef, 2026-09-27).*

## What the data says (production, last 30 days)

- **Only Chef logs.** 328 food logs, 58 weights (scale import), 9 medication entries,
  1 blood pressure, 12 body-composition scans. Heather has settings but has **never logged
  anything**.
- So, for Heather, the job isn't simplifying an app she uses; it's making an app she will
  **start** using.

## What's in the way today (harness screenshots, 2026-09-25)

- **Home:**
  - A day-of-year counter ("NO. 268/365") and a truncated date ("Friday, Septem…").
  - All-caps monospace labels.
  - A warning banner explaining "a formula error fixed on Sep 20", which has been up since
    the 22nd.
- **Log:**
  - "Food Log" three times (top bar, eyebrow, title) before the date.
  - Copy Meal and Household buttons ahead of the date.
  - "Goal: 2340 cal (2100 +240)".
  - A floating + that covers the empty-state text.
- **Navigation:** Weight, blood pressure and meds are buttons on Home, not places in the
  navigation. Activity and Profile hold the nav slots.
- **The look:** teal, a serif display face and monospace labels. That sits too close to
  NoteGeek (Lab Notebook) and BookGeek (serif) now that every app has its own identity.

## The proposal: two faces, one app

A per-person setting: **Simple** or **Full**. Same data, same app. Most changes below help
both.

1. **Home answers one question, in words:** "You have 660 calories left today", with one big
   ring. Today's meals are four big cards (Breakfast, Lunch, Dinner, Snacks), each with its
   own **+ Add**, so there's no separate meal picker.
2. **One-tap logging:** "Again" chips for the most-logged foods and meals, and **"Same as
   yesterday's breakfast"**. Copy Meal folds into this.
3. **Speak it:** a microphone in the add box. Say "two eggs and toast" and it goes through
   the existing describe-and-log path.
4. **Plain language:** no formula talk and no arithmetic in labels. Anything worth raising
   is one sentence and one button. After adding, a clear "Added to lunch ✓" with Undo.
5. **Bigger and calmer:** body text at 18px or more on phones, 56px main buttons, a
   per-person **Larger text** switch, high contrast.
6. **Check-ins as navigation:** Home · Log · Weight · More. A Today strip reads "Weighed ✓ ·
   BP — · Meds 2 of 3". In Simple mode, meds become **"Did you take your meds?"** with big
   ticks.
7. **Its own identity:** two or three directions shown with screenshots before any build.
   The candidate is a friendly market-morning feel (rounded type, produce colours,
   food-first), distinct from the other eight.
8. **Rough edges:** the + covering text, the triplicated titles, the truncated dates, and
   the stacked button rows.

## Simple mode, specifically for Heather

- **First run:** three plain steps (what to call you, your goal, and "try logging your
  breakfast"), with nothing to configure.
- **The screen:** Home, the add box (with a microphone), and the Weight / BP / Meds
  check-ins. Reports, macros, body composition, Garmin and settings stay out of the way.
- **Nothing surprising:** see the service worker below.

## Service worker: a note from the PWA pass (2026-09-27, `bf684173`)

FitnessGeek's updates used to wait until every tab was closed. The PWA pass turned on
`skipWaiting` and `clientsClaim` to match the other apps.

- **Risk:** in `autoUpdate` mode the page reloads when a new version activates, and every
  push to main redeploys the fleet. A reload in the middle of typing a food is exactly
  wrong for Heather.
- **Proposal:** only switch to the new version when the app has been hidden (backgrounded)
  or on the next launch, never mid-entry. The dead `PWAUpdatePrompt` either goes, or becomes
  this.

## Decisions (Chef, 2026-09-27)

- **Go.** The redesign ships as **one self-contained commit**, so a single `git revert`
  undoes it. The service-worker fix is **separate** (`daffe548`), so a revert can't bring
  back the mid-entry reloads.
- **Identity: "Market Morning."** Warm and food-first:
  - a sunny cream background (about `#FFF8EC`);
  - rounded friendly type (Nunito, self-hosted);
  - produce colours per meal: tomato for Breakfast, leaf for Lunch, lemon for Dinner,
    plum for Snacks;
  - big soft cards, and the calorie ring drawn as a plate, not a gauge.
  The dark mode is the same kitchen at night, not the cream inverted.
- **Simple mode is designed around Heather.**
- **The default mode** when a person has never chosen: **Full** if they've logged anything
  in the last 90 days, otherwise **Simple**. No user ids are hard-coded. Chef lands in Full
  and Heather in Simple.

## As built (2026-09-27)

Decisions the plan did not make, made while building. Each is reversible with the one commit.

### Where the settings live, and how the default is decided

- **Storage:** a new `experience` sub-document on the fitnessgeek `usersettings` document
  (`packages/schemas/fitnessgeek/userSettings.js`): `mode` (`simple` | `full`, **no default**),
  `larger_text` (default false), `first_run_done` (default false), `preferred_name` (≤40),
  `goal` (`lose` | `maintain` | `track`). Both writers build from the shared schema, so the
  REST twin's model has the paths too; only the gateway writes them (the frontend's settings
  traffic is all GraphQL).
- **Gateway, additive:** `FitnessUserSettings.experience: FitnessExperienceSettings`, and
  `experience: FitnessJSON` on `FitnessUserSettingsInput` (a scalar field on an existing input,
  so the input-object parity count is unchanged). `updateFitnessUserSettings` validates it with
  a strict zod schema before the write (`validateExperienceInput`): the rest of the input is
  free-form JSON into a strict-mode model that silently drops unknown keys and runs no
  validators on update, so a typo or an out-of-enum mode would otherwise be lost or stored.
  Writes are partial — `flattenSettingsUpdate` dots them as it does every other sub-document.
- **Its own query.** The frontend reads it with `GetFitnessExperience`, not four more fields on
  `GetFitnessUserSettings`: the two apps deploy separately, and one unknown field fails
  validation for the whole query. A frontend that lands first loses only this and falls back to
  the default rule.
- **The default rule** (`utils/experience.js`, `contexts/ExperienceContext.jsx`): a saved `mode`
  wins. Otherwise Full if the person has a food log, a weight or a blood pressure dated within
  the last 90 calendar days (inclusive), else Simple. Asked as cheaply as possible: the newest 50
  food logs first (`foodLogs` with no arguments — dates only); weights and BP only if that says
  nothing. Chef answers on the first call.
- **Finishing the first run saves `mode: 'simple'`.** Without it, Heather's first breakfast would
  flip her to Full on the next load, because the default rule would then see a log. The first run
  only shows to a person who never chose, is Simple, and has not finished it.
- The last answer is cached in `localStorage` (`fg.experience.v1`) purely so a reload paints the
  right face before the network answers; every access is wrapped.

### Home, logging, voice

- **The banner stays, rewritten.** Chef's saved plan still predates the 20 Sep BMR fix (the
  body-comp memory: ~1,000 kcal high, deliberately not rewritten for him), so its job is not
  done. It is now one sentence and one button — "Your daily calorie target is probably too
  high." / **Check my target** — and the scan-BMR offer the same shape. Full only.
- **Plate ring:** the rim fills in the four meal colours in meal order; over target the rim is full
  and a plum edge says so. Nothing turns red.
- **Meal cards:** Simple shows a 2×2 grid with the first two foods and a count; Full shows every
  food with its calories and a remove button (with Undo), one card per row on a phone.
- **Again chips** are computed client-side from four weeks of the person's own logs
  (`utils/againChips.js`; one `foodLogs(startDate, endDate)` read, cached two minutes). A food in
  this meal counts twice what it does elsewhere; a food logged once is not a habit and gets no
  chip; a saved meal counts once per (day, meal) where all its foods appear together. A chip
  re-logs at the servings and nutrition used last time. No new query was needed.
- **Copy Meal** stays (any day to any day, household included), moved from the stacked row above
  the date to a text button under the meals; "Same as yesterday's …" covers the common case in
  one tap. Household is Full-only on the Log page.
- **Describe-and-log takes the meal.** Additive backend change: `POST /api/logs/describe` accepts
  an optional `mealType`, used instead of the hour; a meal named in the text still wins. Without
  it, "two eggs" said into Lunch's sheet at 8am would have landed in breakfast. Voice goes through
  exactly this path.
- **Voice:** `hooks/useSpeechInput.js`, one utterance per tap (`continuous = false`), `en-US`.
  The mic shows only when `SpeechRecognition`/`webkitSpeechRecognition` exists; in the add sheet
  there is also a big "Say what you ate" button. Refusal reads "FitnessGeek needs your microphone
  to hear you…". The transcript is shown while listening and put in the box, then logged.
- **Toasts** say "Added to lunch ✓ · Greek yogurt", with the existing Undo.
- **First run's goal** is stored in her words and does not invent a calorie target; the plan
  wizard stays one tap away under More. Step 3 offers the meal for the current hour ("Try logging
  your lunch" at noon) rather than always breakfast.

### Check-ins and navigation

- **Meds:** the dose log already existed on the backend with no UI. A tick writes
  `taken: true`, an untick `taken: false`; the newest answer per (medication, time of day) wins,
  so no delete endpoint was needed. A medication with no times set is one daily dose, stored
  under `morning`. The checklist is on Simple's Home and at the top of the Medications page in
  both modes (so Chef's strip count is something he can act on).
- **Today strip:** Weighed / BP are ✓ when a row is dated today; Meds reads "2 of 3", or ✓ when
  all are taken, and is absent when there are no medications. Each is a link to its page.
- **Bottom bar:** Home · Log · Weight · More. `/more` is a new page listing every other route;
  anything reached through it lights More. The desktop sidebar keeps the full list in Full and
  a short one in Simple. Nothing was removed.
- **Simple hides:** macros, the stat cards and insights (Home), the nutrition summary and keto
  panels and Household (Log), and body composition (Weight). All still reachable by switching.

### Identity: Market Morning

- **Type:** Nunito (`@fontsource/nunito`, 400/600/700/800), one family everywhere, tabular
  figures from the body rule. The old DM Sans / DM Serif / JetBrains imports are gone from
  `main.jsx`; the three packages are still in `package.json` so the lockfile diff is the font
  only — removing them is a separate, trivial cleanup.
- **Palette (light):** cream `#FFF8EC`, paper `#FFFEFB`, espresso ink `#2A2118` (14.96:1 on
  cream), secondary `#5C4B3B` (7.88:1), basil primary `#2F6B35` (white on it 6.41:1).
  **Night:** walnut `#1B1612`, paper `#262019`, warm cream ink `#F7EDE0` (15.51:1), basil
  `#8BCB7E` (8.40:1 on paper). Produce fills, ink on each: light tomato `#F07156` 5.42, leaf
  `#8BC34A` 7.53, lemon `#F6C945` 10.05, plum `#C184BE` 5.50; night tomato `#FF8A70` 7.80,
  leaf `#A5D46F` 10.47, lemon `#F7D26A` 12.29, plum `#D39ACF` 7.94. As text on paper lemon
  would be 1.63:1 and leaf 2.48:1 — so they are only ever fills and edges.
- **Sidebar:** a chalkboard (`#1F2A22`, chalk `#F4EFE4` 12.96:1, lemon accent 9.46:1) in both
  modes, replacing Studio Slate's near-black.
- **Larger text** scales the root font size to 118.75% (`:root[data-text-size='larger']`), so
  every rem in the app grows together.
- All-caps tracked labels, the serif display face and the monospace numbers are retired app-wide;
  page titles that repeated the top bar (eyebrow + heading + bar) now appear once.
- **Cost:** the first-load entry chunk grew 105.4 → 113.5 kB (gzip 32.1 → 35.5 kB): the
  experience provider, the mode-aware nav and the chalkboard chrome all load before any route.

### Left for real use

- Voice on Heather's actual phone (Chrome on Android): permission prompt, accent, and whether
  one utterance per tap feels right. The harness only photographs the mic idle, with a stub.
- The default rule on the real accounts: Chef should land in Full, Heather in Simple with the
  first run. Nothing is written until someone chooses or finishes the first run.
- Harness: 144 scenes (was 102), 0 / 0 / 0; new scenes 19–25 cover Simple home, the meds
  checklist, first run, both add sheets, Larger text, the Full home's meal cards, More (both
  modes) and the new Settings section.
