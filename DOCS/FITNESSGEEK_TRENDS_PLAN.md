# FitnessGeek — Trends: recovery, fitness, measured burn, and body data in Reports

Status: **T1–T5 shipped 2026-09-23; T6 awaits a decision.** Follows `DOCS/FITNESSGEEK_BODY_DATA_PLAN.md`; the same
smoothing rule (§0 there) governs every number here.

## 1. Why

The Health Dashboard shows one day at a time; Reports shows food only. Meanwhile Garmin has
written daily resting HR, overnight HRV, sleep, activity and fitness age to Influx every
day, and FitnessGeek holds weight, scans and 80 blood-pressure readings — none of it shown
as a trend anywhere.

| Signal | Why it matters |
|---|---|
| Resting HR | The clearest cardiovascular payoff of weight loss; moves within weeks |
| Intensity minutes | Weekly total against the 150-minute guideline — often already met, and invisible |
| Overnight HRV | Recovery; rises with fitness and sleep |
| Sleep score and duration | Context for HRV and for hunger |
| Fitness age | A long-horizon motivator Garmin already computes (VO2-max based) |
| Garmin active burn | Measured activity, versus the plan's assumed activity multiplier |

(Personal figures are deliberately not recorded here: this repository is public.)

## 2. Decisions (Sage's recommendations, confirmed by Chef 2026-09-23)

- **D1. Trends live in Reports**, as a "Body & recovery" section above the food report. The
  Health Dashboard stays the single-day Garmin drill-down. Reports already owns ranges.
- **D2. Every trend follows the smoothing rule:** a 7-day mean now against a 7-day mean
  ~30 days earlier (windows ≥ 14 days apart), plus a sparkline of the 7-day rolling mean
  over 90 days. Reuses `@geeksuite/utils/bodyComp.js` (`bodyCompChange`, `rollingMean`).
- **D3. Metrics shown:** resting HR, overnight HRV, sleep score and duration, weekly
  intensity minutes (against 150), steps, fitness age, weight (7-day), body composition
  (the existing summary), blood pressure (7- and 30-day averages, as BP Insights does),
  daily stress and Body Battery as daily means. **Not shown:** SpO2 / breathing (wrist SpO2 is
  noisy with movement and position; Chef's call).
- **D4. Measured burn informs the calorie target, but doesn't replace it** (Chef agreed
  2026-09-23). Garmin's own total burn uses Garmin's weight-only BMR — the same kind of
  estimate the scans correct — so it would inflate the target. The honest measure is
  **scan BMR + Garmin active kcal (30-day mean)**. The wizard offers it in place of the
  activity multiplier, labelled with its source; nothing changes without a re-run (the D2
  rule from the body-data plan).
- **D5. Adaptive TDEE is deferred** (Chef agreed). Burn from logged intake against the
  smoothed weight trend is the most accurate, and tolerates gaps (a missed weigh-in is a
  missing point; an unlogged day is unknown, not zero), but needs most days logged over a
  rolling 3–4 weeks alongside a continuous weight run. Revisit mid-October.
- **D6. Sodium and net carbs join the Reports averages** (both already on every log).
- **D7. The AI coach context gains the same smoothed trends** (resting HR, HRV, intensity
  minutes) — averages only, with the noise note.

## 3. The contract

- fitnessgeek REST (Influx lives behind the fitnessgeek backend):
  `GET /api/influx/trends?days=90` → one point per calendar day:
  `{ date, restingHR, overnightHRV, sleepScore, sleepHours, steps, moderateMin, vigorousMin,
  activeKcal, stressMean, bodyBatteryHigh, bodyBatteryLow, fitnessAge }` plus
  `{ fitnessAge: { current, chronological, achievable } }`. Calendar days from Influx's
  daily points; no server "today" guess (the client sends its local day).
- Reports frontend: a `BodyRecoverySection` fed by that endpoint + `bodyCompositionSummary`
  + BP + weights; each metric a small card: current 7-day mean, change vs ~30 days ago or
  "change from <date>", sparkline.
- Wizard: `activeKcalMean30` from the same endpoint; `TDEE = BMR + active` as an option.
- Reports averages: `sodium_mg`, `net_carbs_grams` added to the overview `METRICS` (REST
  and gateway copies).

## 4. Work

| # | Piece |
|---|---|
| T1 | Influx trends endpoint + tests (fixture Influx responses) — done `82a1bb87` |
| T2 | Reports "Body & recovery" section: cards + sparklines, harness scene — done |
| T3 | Weight / body comp / BP cards in the same section — done |
| T4 | Sodium + net carbs in Reports averages — done `e55c93c8` |
| T5 | Wizard: measured-activity TDEE option — done `3d021200` |
| T6 | AI coach context: smoothed recovery trends — **waiting on Chef:** the coach runs in basegeek, which can't reach the Garmin Influx; copy fitnessgeek's read settings to basegeek, or have basegeek call fitnessgeek's endpoint |

## 5. Still open elsewhere

- Medication dose logging: 9 medications on file, zero doses ever logged — the endpoint
  exists, no screen calls it.
- The sleep-apnea screening card is now a per-user setting (default on).
