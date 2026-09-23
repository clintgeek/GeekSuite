# FitnessGeek — Using the body data

Status: **in progress** (started 2026-09-22 overnight). Chef's brief, verbatim intent:

> 1–4 [lean-mass BMR, lean-mass protein, fat-vs-lean change, AI coach context]; look at
> the UI/UX especially surrounding weight and other measurements; make parts of the system
> more accurate with this new data. Give me all the useful data and just store the things
> that might be useful in several months but would look like noise right now. Don't toss
> any data that isn't pure noise, but only expose the useful stuff in the UI. Keep the
> smoothing rule in mind.

Chef delegated the decisions below. Each is marked so it can be overruled.

**Intake** (how scans arrive) is `DOCS/BODY_COMPOSITION_INTAKE.md`. This file is what we do
with them.

---

## 0. The smoothing rule — applies to every number below

Bioimpedance swings 1–2 % body fat day to day with hydration alone; scale weight swings
2–3 lb with water and food. So:

- **Never show a day-over-day or scan-over-scan delta** of weight or body composition.
- "Current" body composition = the **mean of the scans in the 14 days ending at the latest
  scan**, with its scan count and date span shown.
- A change is shown only as **7-day mean vs 7-day mean, with the window centres at least 14
  days apart**. Before that exists, say when it will ("available from 29 Sep"), never a
  number.
- Weight charts show a **7-day trailing mean as the line**; raw readings are dots.

## 1. What we found (2026-09-22)

| # | Finding | Effect |
|---|---|---|
| F1 | Chef's saved plan (09-14) predates the 09-20 BMR unit fix: BMR 3314, TDEE 3977, weekday target 2798, Fri/Sat 3424, no `bmr_calc_version`. | Target runs roughly 1,000 kcal/day high. The wizard's stale banner exists, but only inside the wizard. |
| F2 | BMR is Mifflin-St Jeor everywhere. Katch-McArdle from measured lean mass (the scale's own formula, verified exact) is ~2,100 for Chef. | Mifflin can't tell fat from lean; at 44 % body fat it overestimates. |
| F3 | Protein/fat = g per lb of **goal** weight (0.8 / 0.35); carbs the remainder. Copy-pasted in three places (gateway `derivedMacros`, `nutritionGoalBridge`, REST `goalRoutes`). | One change must be made three times and can drift. |
| F4 | `derivedMacros` ignores `mode: 'keto'` entirely — a keto user is shown a carb target of hundreds of grams. Chef is `standard` today, so latent. | Wrong targets the day anyone switches to keto. |
| F5 | Nothing reads `BodyComposition`: no query, no UI, no AI context. | The import stores data nobody sees. |
| F6 | GraphQL `addFitnessWeight` has no same-day check (REST returns 409; REST is unreached). | Two weights on one day through the real UI → duplicate rows; every weight consumer double counts that day. |
| F7 | Weight log shows a per-row delta vs the previous entry; the chart connects raw points; projection uses the last 4 logs regardless of span. | Violates §0; teaches reacting to water weight. |
| F8 | AI context's weight "trend" is first-vs-last raw weight in the window. | "Gaining" on a water day. |
| F9 | `Weight.source` isn't shown; there is no edit for a past weight (delete + re-add only). | Can't tell a scale reading from a typed one. |
| F10 | Dead, barrel-exported `ChartSelector`, `WeightProgressRing`, `ProgressTracker`; hardcoded hex colours in `WeightProgress` and the dashboard stat cards. | Maintenance hazard; contrast drift in dark mode. |

## 2. Decisions (Sage, on Chef's behalf — overrule freely)

- **D1. BMR source.** Katch-McArdle from the 14-day mean lean mass when the latest scan is
  ≤ 30 days old; otherwise Mifflin-St Jeor. The source, lean mass and scan count are shown
  in the wizard and saved on the plan (`bmr_source`, `lean_mass_lb`).
- **D2. Chef's plan is not rewritten automatically.** A 1,000-kcal change to the target you
  eat to is your decision. The dashboard now shows a banner when the saved plan is stale
  (buggy formula) or when a scan-based BMR is available and the plan doesn't use it; one
  tap re-runs the wizard, which shows old vs new.
- **D3. Protein from lean mass**: `protein_g_per_lb_lean`, default **1.0 g/lb of lean mass**
  (≈ 2.2 g/kg FFM — the conservative end of the evidence for preserving lean mass in a
  deficit), used whenever a recent scan exists; otherwise the existing goal-weight rule.
  For Chef this is ~177 g vs 176 g today — the change matters when calories drop or goal
  weight is set oddly, not today. Fat stays per lb of goal weight; carbs the remainder.
- **D4. Keto mode respected** (F4): with lean mass, protein = lean rule, carbs = the split's
  carb %, fat = the remainder; without lean mass, the saved % split, exactly what the keto
  step already displays.
- **D5. One macro implementation** in `@geeksuite/utils` (`deriveMacroTargets`), called by
  all three sites.
- **D6. Weight & body live on one page** (`/weight`, titled "Weight & body"), not a new
  route: body comp joins weight by day, and the nav already puts Import Scan beside Weight.
- **D7. Shown in the UI:** 14-day means of body fat %, fat mass, lean mass, skeletal muscle,
  body water %, visceral fat index, scan BMR; fat-vs-lean change (§0 rule); a smoothed
  fat/lean trend. **Stored, not shown:** the ten segmental values, protein mass, bone
  mass, subcutaneous fat, device. Revisit segments after ~3 months of scans or when lifting
  starts — they need a stability baseline before a left/right difference means anything.
- **D8. One weight per day through every writer** (F6): `addFitnessWeight` on a day that
  already has a weight updates that day's row. The importer's "import wins" rule still
  applies whenever an export containing that day is imported.
- **D9. Imported weights are not pushed to Garmin.** The folder import runs server-side
  with no user timezone, and Garmin's push resolver falls back to America/Los_Angeles.
  Revisit when a timezone lives in `UserSettings`.

## 3. The contract

### 3.1 `@geeksuite/utils` (pure, ESM, shared by the frontend and both backends)

`energy.js`
- `katchMcArdleBMR({ leanMassLb })` → kcal or null.
- `resolveBmr({ leanMassLb, latestScanAt, now, maxScanAgeDays = 30, mifflin })` →
  `{ bmr, source: 'scan' | 'mifflin', lean_mass_lb, scan_age_days }`.

`bodyComp.js`
- `leanMassLb(scan)`; `bodyCompWindow(scans, { endDate, windowDays })` → means over the
  window; `bodyCompCurrent(scans)` → 14-day window ending at the latest scan;
  `bodyCompChange(scans, { windowDays: 7, minGapDays: 14 })` → available/deltas or
  `available_from`; `rollingMean(points, { windowDays: 7 })` for charts.

`macros.js`
- `deriveMacroTargets(ng, { leanMassLb })` → `{ rules, fixed, calories, weekly }` in the
  exact shape `derivedMacros` returns today, plus `rules.protein_basis`
  (`lean_mass` / `goal_weight` / `percent`), `rules.lean_mass_lb`,
  `rules.protein_g_per_lb_lean`, `rules.keto`.

### 3.2 GraphQL (gateway)

```graphql
type BodyCompSegment { muscle_lb: Float, fat_lb: Float }
type BodyCompDerived { fat_free_mass_lb: Float, body_fat_pct: Float, body_water_pct: Float,
  skeletal_muscle_pct: Float, bmr_kcal: Float, bmi: Float, smi: Float }
type BodyComposition { id: ID!, measured_at: Date!, log_date: Date!, source: String!,
  weight_value: Float!, body_fat_mass_lb: Float, body_water_l: Float, protein_lb: Float,
  bone_mass_lb: Float, skeletal_muscle_lb: Float, subcutaneous_fat_lb: Float,
  visceral_fat_index: Float, height_cm: Float, left_arm: BodyCompSegment, right_arm: ...,
  trunk: ..., left_leg: ..., right_leg: ..., device_name: String, derived: BodyCompDerived }
type BodyCompWindow { from: Date!, to: Date!, scans: Int!, weight_lb: Float,
  fat_mass_lb: Float, lean_mass_lb: Float, body_fat_pct: Float, skeletal_muscle_lb: Float,
  body_water_pct: Float, visceral_fat_index: Float, bmr_kcal: Float }
type BodyCompChange { available: Boolean!, available_from: Date, gap_days: Int,
  baseline: BodyCompWindow, latest: BodyCompWindow, weight_change_lb: Float,
  fat_change_lb: Float, lean_change_lb: Float }
type BodyCompSummary { total_scans: Int!, first_scan_at: Date, latest_scan_at: Date,
  current: BodyCompWindow, change: BodyCompChange, bmr: BodyCompBmr }
type BodyCompBmr { bmr: Float, source: String!, lean_mass_lb: Float, scan_age_days: Int }

bodyCompositions(startDate: Date, endDate: Date): [BodyComposition!]!
bodyCompositionSummary(date: String): BodyCompSummary!   # date = caller's local YYYY-MM-DD
```

`DerivedMacroRules` gains `protein_basis`, `lean_mass_lb`, `protein_g_per_lb_lean`, `keto`.
`FitnessUserSettings.nutrition_goal` gains `bmr_source`, `lean_mass_lb`,
`protein_g_per_lb_lean`.

## 4. Work, in order

| # | Piece | Status |
|---|---|---|
| W1 | Shared math: `katchMcArdleBMR`, `resolveBmr`, `bodyComp.js`, `deriveMacroTargets` + tests | done `97d7f68c` |
| W2 | Settings schema fields (`bmr_source`, `lean_mass_lb`, `protein_g_per_lb_lean`) through shared schema, zod, GraphQL input/type, parity tests | done |
| W3 | Gateway: BodyComposition type + two queries; `derivedMacros` + bridge on `deriveMacroTargets` with lean mass; `addFitnessWeight` one-per-day; AI context gains body comp + smoothed weight; `GRAPHQL.md` | done (also: trend-report highlights smoothed) |
| W4 | REST `goalRoutes /nutrition/macros` on `deriveMacroTargets` | done |
| W5 | Frontend service layer: GraphQL docs + `bodyCompService` | done `7bac1840` |
| W6 | Weight & body page: summary, change, smoothed trend; log list without deltas, source chip, edit; chart trend line + projection guard; palette colours; dead code removed | |
| W7 | Wizard: `resolveBmr`, source shown, old-vs-new; plan saves provenance; dashboard stale/scan banner; dashboard weight stat on 7-day means | |
| W8 | Harness fixtures + scenes for the new UI; run `--enforce-a11y` | |

## 5. Deferred — wanted, not tonight

- Segmental view (after ~3 months of scans or when lifting starts; D7).
- A "Body" section in Reports (7/30-day, mirroring BP insights).
- StartGeek glance card: weight trend.
- Garmin push of scale weights (D9).
- Weight on the mobile bottom nav; "Health Dashboard" is Garmin-only and its name invites
  confusion with body data.
- The REST `aiInsightsService.js` duplicates the gateway's context builder and is
  unreached by any client — delete or reconcile.
- Household `share_weight` exists but nothing shares weight.
