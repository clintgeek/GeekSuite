# Health Dashboard — are the numbers real?

*Investigation, 2026-09-22. Answers a direct question from Chef: "the numbers
it shows on overview and sleep analysis seem invented rather than data from
influx." Read-only — no code was changed to produce this document. Every
number below came from the live `datageek_influxdb` and from running the real
`sleepAnalysisService` inside the running `fitnessgeek` container.*

## The short answer

**The data is real. The interpretation is wrong.**

Nothing is fabricated and nothing is random. The Influx queries are correct,
the measurement and field names all exist, and real Garmin data comes back.
But Sleep Analysis decodes Garmin's sleep-stage codes **with the wrong
mapping**, so it reports your deep sleep as time awake and your REM as deep.
And three of its HRV figures are literal constants that can never change.

Chef's instinct was right. The cause just isn't the one it looks like.

---

## Finding 1 — the sleep stage codes are decoded wrong (confirmed)

`sleepAnalysisService.js:6` declares:

```js
const SLEEP_STAGES = { AWAKE: 0, LIGHT: 1, DEEP: 2, REM: 3 };
```

Garmin's actual encoding is **0 = deep, 1 = light, 2 = REM, 3 = awake**.

### The proof

Minutes per raw `SleepStageLevel` in Influx for the night of 2026-09-22, set
against Garmin's own `SleepSummary` for the same night:

| Raw level | Minutes in `SleepIntraday` | Garmin `SleepSummary` says | So level N really means |
|---|---|---|---|
| 0 | 71 | `deepSleepSeconds` = 71 min | **deep** |
| 1 | 325 | `lightSleepSeconds` = 325 min | light |
| 2 | 131 | `remSleepSeconds` = 131 min | **REM** |
| 3 | 39 | `awakeSleepSeconds` = 39 min | **awake** |

Four of four match exactly. There is no ambiguity here.

### What the dashboard shows as a result

Running the real service against the real data for that night:

| What the dashboard says | What it actually is | Garmin's figure |
|---|---|---|
| awake **71 min** | deep sleep | deep 71 |
| light **325 min** | light sleep ✓ | light 325 |
| deep **132 min** | REM | REM 131 |
| REM **39 min** | awake | awake 39 |

Only "light" is right, and only because level 1 happens to mean light in both
schemes.

### What it drags down with it

This is not a labelling cosmetic. Every downstream metric reads the mislabelled
stages:

- **Sleep efficiency** — 87% reported, because 71 minutes of *deep sleep* are
  counted as time awake. Garmin's own numbers give 93%.
- **Sleep quality score** — **55, "POOR"**. Garmin scored the same night **82**.
  The night before: 45 "POOR" against Garmin's 83.
- **`avgDeepSleepHR`** — samples level 2, which is REM. Heart rate in REM runs
  higher than in deep sleep, so this is biased upward by design.
- **`hrDipPercent`** — 0% and 3% on two nights, derived from the same wrong
  windows.
- **Awakenings / wake-after-sleep-onset** — counts entries into level 0, which
  is falling into *deep sleep*. On 2026-09-21 it reported 4 awakenings against
  Garmin's 2. (It matched on 09-22 by coincidence.)
- **The recommendations and warnings** are generated from all of the above, so
  the advice is not merely imprecise — it can be the opposite of correct. A
  night with 131 minutes of REM can be told it is short of REM.

### Fix

One constant. `{ DEEP: 0, LIGHT: 1, REM: 2, AWAKE: 3 }`. Every consumer already
refers to the stages by name, so nothing else needs to move — but the quality
score's thresholds were tuned against the wrong inputs and should be re-checked
once the stages are right, and there is a ready oracle: `SleepSummary.sleepScore`
is Garmin's own answer for the same night, sitting in the same database.

---

## Finding 2 — three HRV numbers are constants (confirmed)

`analyzeHRVRecovery(hrvValues, weeklyBaseline)` only computes a deviation when
a baseline exists:

```js
let hrvDeviation = 0;
let hrvStatus = 'BALANCED';
let recoveryScore = 50;          // Neutral
if (weeklyBaseline && weeklyBaseline > 0) { /* the real calculation */ }
```

The baseline comes from `UserSettings.healthBaselines.weeklyHRV`. In the live
database, **every user row is either `null` or `{weeklyHRV: null, restingHR:
null, lastUpdated: null}`**. Nothing computes it; the only writer is a PUT
endpoint (`userRoutes.js:243`) that nothing in the UI appears to call.

So for every user, on every night, the dashboard reports:

- `hrvDeviation: 0`
- `hrvStatus: "BALANCED"`
- `recoveryScore: 50`

These are the numbers that read as invented, because they are. `avgHRV` beside
them *is* real (22 and 20 on the two nights measured, against Garmin's
`avgOvernightHrv` of 26 and 23 — close, and the difference is a separate
question about which samples are averaged).

### Fix

The baseline is computable from data already present: a rolling 7-day mean of
`SleepSummary.avgOvernightHrv`, which Influx already holds. Until then, the
honest display is to say the baseline is not set rather than to print
"BALANCED / 50" as though it were a measurement.

---

## Finding 3 — the Overview "trend" chips measure minutes, not days (confirmed)

`IntradayDashboard.jsx:114` computes a trend when the caller passes none:

```js
const recent = data.slice(-10);
const older  = data.slice(-20, -10);
return recentAvg - olderAvg;
```

The series is **intraday** — one point per minute. So the chip compares the
last ten minutes against the ten minutes before them, and shows the difference
as a bare number with an arrow. Next to a daily metric card, that reads as
"your heart rate is up 4 today". It is not; it is the tail of the current hour,
and on a past date it is whatever the last twenty samples of that day happened
to do.

There is a second, smaller fault in the same block:

```js
color={calculatedTrend > 0 ? 'error' : 'success'}
```

Rising is red for every metric. For **body battery** — where rising is the good
direction — the colour is exactly backwards.

### Fix

Either compare like-for-like across days (Influx has the history), or drop the
chip. A number with no stated window is worse than no number.

---

## What is NOT wrong

Worth stating plainly, because the investigation started from "is any of this
real?":

- **The Influx connection and queries are sound.** `SleepIntraday`,
  `SleepSummary`, `HRV_Intraday`, `BreathingRateIntraday` and the rest all
  exist, and every field the queries name exists on the measurement it is
  selected from. No typos, no missing fields, no silent empty result sets.
- **The data is flowing.** 218–315 sleep heart-rate samples a night for every
  one of the last eight nights, from a Forerunner 965.
- **`parseSleepData` reads real fields.** Nothing is synthesised, defaulted or
  randomised on the way in.
- **Respiration, SpO2, stress and body battery** are averaged from real
  samples and are not affected by the stage bug.

---

## Suggested order

1. **The stage constant.** One line, and it is the difference between a
   dashboard that contradicts the watch and one that agrees with it. Validate
   against `SleepSummary.sleepScore` for a handful of nights afterwards.
2. **The trend chips.** Either fix the window or remove them; the colour
   inversion on body battery comes out with it.
3. **The HRV baseline.** Real work — needs a rolling calculation and somewhere
   to store it. Until it exists, stop printing "BALANCED / 50".

## Unexamined

Meal Impact and Recovery Coach were not looked at. Recovery Coach consumes the
same sleep metrics, so it inherits Finding 1 whatever else it does.
