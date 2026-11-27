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
- **Navigation, phone tabs (revised 2026-11-28):** Today · Weight · Pressure · Meds · More, so each daily
  job has a tab. More lists Trends, Saved foods, Calorie plan, Import a scan, Settings and the other Geek
  apps. The phone header has no hamburger and no app grid. *Originally:* Today · Weight · Trends · More. The More page lists Blood pressure,
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


## Wanted next (Chef, 2026-11-27: "put that on a list")

Aim: an ordinary person fares as well here as in MyFitnessPal or FatSecret. Two users, one iOS and one
Android. Android can take a sideloaded wrapper; iOS has to stay a PWA. Nothing here is started.

**Fitness, simpler and more of it**
- A plain "I exercised" entry ("walked 30 minutes"): AI reads the sentence, a fixed MET table does the maths.
- Withings (official OAuth API): scale and blood-pressure cuff readings straight in.
- Strava (official OAuth API and webhooks): workouts from most watches and phones.
- Health data from the phones is NOT wanted (Chef, 2026-11-27): the server reads Garmin directly. No
  Health Connect wrapper, no Apple Shortcut.
- Garmin today is an unofficial library with a stored password. Works; fragile.

**Barcode scanning on iOS (first: Heather is on an iPhone, and Chef calls it "a trying experience")**
*Built 2026-11-27, not yet tried on a phone.* One camera stream that we own; native detector on Android,
bundled WebAssembly zxing-cpp elsewhere (no CDN, precached); only the guide box is decoded; a read must have
a valid check digit and repeat once; codes fold to 12-digit UPC-A; "Take a photo instead" on both tabs; the
chosen camera is remembered. Still open: "photograph the label" on a miss. The diagnosis below is what it
replaced.
Read from `components/BarcodeScanner/BarcodeScanner.jsx`, not yet confirmed on a device:
- iOS has no native detector, so it takes the fallback path, and that path opens the camera twice. We open
  a 1080p stream on a chosen camera; then ZXing's `decodeFromVideoDevice(null, ...)` opens its own stream
  with default settings and replaces ours. The resolution, the camera choice and the torch all apply to a
  stream that is no longer on screen.
- The decoder is the pure-JavaScript ZXing (0.19.1), which is weak on slightly blurred 1D codes, and it is
  fetched from unpkg each time, so a weak signal in a shop means no scanner at all.
- The camera filter drops any label containing "wide", which excludes iOS's "Back Dual Wide Camera", the
  one that switches lens to focus up close. Newer iPhones cannot focus the main lens nearer than ~15cm.
- `html5-qrcode` is in package.json and nothing imports it.
Fix, in order: one stream that we own; a WebAssembly build of zxing-cpp bundled with the app (same detect
loop as Android, no CDN); decode only the centre band; a "Take a photo instead" button (the native camera
focuses properly, then we decode the still); and on a miss, "photograph the label".

**Food data**
- Photo of a nutrition label -> an exact entry, for when a barcode misses.
- Chain-restaurant items (MenuStat is a public dataset).
- Measure the barcode hit rate on a real pantry shelf before adding sources.
- Recipe from a URL -> a saved meal.

**PWA**
- Web push (iOS 16.4+ once installed to the home screen, and Android): "log dinner", "meds", weigh-in.
- App icon badge for unticked meds.
- Manifest shortcuts (Android long-press): Log food, Log weight.
- Offline logging queue (log with no signal, send later).

**Still complex**
- Goal setup (the calorie plan flow). Plain-words pass on Trends > Health and Settings.
- Hide Garmin, home-data-server and scan-import surfaces from anyone who has not connected them.

## To try on the real phones (nothing here has been checked on a device)

**Heather's iPhone (installed app). Open it twice first: the old build draws once, then reloads.**
1. Scan a small barcode from about 10 cm, then 20 cm. Does it stay sharp and read?
2. If a 1x / 2x switch shows, is 1x a normal view (not fisheye)?
3. "Take a photo" on a pack the live view struggles with.
4. Scan, lock the phone, unlock: the camera should come back by itself.
5. Deny the camera: a plain message, the number box, and a working photo button.
6. The Change sheet and the amount sheet with the keyboard up: is Save reachable?
7. Hand her the phone with no help: log lunch; fix it to 400 calories; log weight; log blood pressure; tick a
   medication; add a medication. Where she hesitates is the next list.

**Chef's Android.**
1. Scan a UPC-A pack and a small UPC-E pack: buzz, "Got it", then the add flow.
2. Light and 1x / 2x act on the picture you can see; the main lens is picked, not the ultra-wide.
3. Closing the scanner turns the camera indicator off at once.
4. Trends shows three tabs (you have a watch); More has "Your other Geek apps".
