# FlockGeek — Planning

## Vision
FlockGeek is a specialized flock management app for small to mid-sized poultry keepers. It tracks individual birds, genetics, breeding plans, infrastructure usage, and performance to guide data-driven decisions while preventing inbreeding and optimizing hatch outcomes.

## Core Features (v1–v2)
- Individual Bird Profiles
  - Name / ID tag (auto-generated if none provided)
  - Breed & strain (with cross-breed notation)
  - Hatch date & origin (own egg, purchased, traded, etc.)
  - Physical traits (weight checks, feather color/pattern, comb type, leg color)
  - Health history (illness, injury, treatments, outcome)
  - Laying performance (avg eggs/week, egg color/size/weight, seasonality)
  - Temperament notes (skittish, docile, aggressive, lap chicken, etc.)

- Genetics & Lineage Tracking
  - Automatic family tree; shared-ancestor “no‑go” inbreeding alerts
  - Sire & dam logged for every chick
  - Line health/expiration indicator when diversity drops
  - Tags for “foundation stock” vs “offspring”
  - Track improvement goals (egg size, hatch rate, friendliness, etc.)

- Hatch & Grow‑out Statistics
  - Hatch rate % per hen, rooster, pairing, and season
  - Cockerel/pullet ratios per pairing and flock averages
  - Grow‑out time tracking (egg → laying age / butcher weight)
  - Survivability rate to laying/butcher age
  - Seasonal hatch trends

- Breeding Planner
  - Suggest optimal pairings avoiding inbreeding and meeting goals
  - Calculate eggs to set to hit target pullet/meat counts using historical rates
  - Reserve breeding pens/tractors by time window

- Infrastructure Tracking
  - Assign birds to tractors, coops, pens, or brooders
  - Track space availability, occupancy, and cleaning cycles
  - Log feed type & consumption per group for performance comparisons

- Cull & Replacement Planning
  - Track productivity decline; plan culls and replacements
  - Flag when to introduce new rooster for diversity
  - Maintain Approved Breeder List and Cull List

- Reports & Insights
  - Yearly performance per bird and bloodline
  - Charts: hatch rate, egg production, temperament scores, etc.
  - Leaderboards: Top 5 hens, Top 3 roos
  - QR codes for quick profile pulls
  - Flock family tree visual

## Tech & Integration
- Stack: React (PWA), Node/Express API, MongoDB (shared instance via BaseGeek), Redis (optional), Docker for prod.
- Auth: Integrate BaseGeek centralized auth and user profiles.
- Mobile-first UI; offline-friendly reads with queued writes (later phase).

## Data Model (MongoDB) — Initial Draft

Note: Use ISO timestamps in UTC; soft-delete via `deletedAt` where appropriate. Add `ownerId`/`orgId` for multi-user support.

1) birds
- _id
- ownerId
- name (nullable)
- tagId (string; unique per owner; auto-generated when missing)
- species (default: chicken)
- breed (string)
- strain (string | nullable)
- cross (boolean; default false)
- sex (enum: pullet, hen, cockerel, rooster, unknown)
- hatchDate (date)
- origin (enum: own_egg | purchased | traded | rescued | unknown)
- foundationStock (boolean)
- sireId (ObjectId | null)
- damId (ObjectId | null)
- temperamentScore (number | null)
- status (enum: active | culled | deceased | sold)
- statusDate (date | null)
- statusReason (string | null)
- notes (string | null)
- createdAt, updatedAt, deletedAt
Indexes: { ownerId, tagId: 1, unique }, { ownerId, name: 1 }, { ownerId, sireId: 1 }, { ownerId, damId: 1 }

2) bird_traits (time-series style logs)
- _id
- ownerId, birdId
- loggedAt (date)
- weightGrams (number | null)
- featherColor (string | null)
- pattern (string | null)
- combType (string | null)
- legColor (string | null)
- notes (string | null)
Indexes: { ownerId, birdId, loggedAt: -1 }

3) health_records
- _id
- ownerId, birdId
- eventDate (date)
- type (enum: illness | injury | treatment | vaccination | checkup | cull)
- diagnosis (string | null)
- treatment (string | null)
- outcome (enum: recovered | ongoing | deceased | culled | NA)
- cullReason (string | null)
- vet (string | null)
- costCents (number | null)
Indexes: { ownerId, birdId, eventDate: -1 }, { ownerId, type: 1, eventDate: -1 }

4) egg_production (per-bird or per-group)
- _id
- ownerId
- birdId (nullable when group-level)
- groupId (nullable)
- date (date)
- eggsCount (number)
- avgEggWeightGrams (number | null)
- eggColor (string | null)
- eggSize (enum: peewee | small | medium | large | xl | jumbo | unknown | null)
Indexes: { ownerId, birdId, date: -1 }, { ownerId, groupId, date: -1 }

5) temperament_notes
- _id
- ownerId, birdId
- loggedAt (date)
- temperament (enum: skittish | docile | aggressive | lap | neutral)
- score (0–10 | null)
- notes (string | null)
Indexes: { ownerId, birdId, loggedAt: -1 }

6) hatch_events
- _id
- ownerId
- pairingId (ObjectId | null)
 - maternalGroupId (ObjectId | null)
- setDate (date)
- hatchDate (date | null)
- eggsSet (number)
- eggsFertile (number | null)
- chicksHatched (number | null)
- pullets (number | null)
- cockerels (number | null)
- mortalityByDay (array of { day:number, count:number } | null)
- notes (string | null)
Derived metrics: hatchRate, fertilityRate, survivability
Indexes: { ownerId, setDate: -1 }, { ownerId, pairingId: 1, setDate: -1 }

7) pairings (breeding pairs/triads/colonies)
- _id
- ownerId
- season (string: YYYY or YYYY-Qn | null)
- seasonYear (number | null)
- name (string)
- roosterIds (array<ObjectId>)
- henIds (array<ObjectId>)
- henGroupId (ObjectId | null)
- goals (array<enum: bigger_eggs | better_hatch | calmer_roos | color_project | meat_growth | other>)
- active (boolean)
- notes (string | null)
Indexes: { ownerId, name: 1 }, { ownerId, active: 1 }, { ownerId, seasonYear: -1 }, { ownerId, season: -1 }

8) lineage_cache (for fast inbreeding checks)
- _id
- ownerId, birdId
- ancestors (array<{ ancestorId: ObjectId, depth: number }>, bounded depth e.g., 5 gens)
- coefficientOfRelationship (number | null)
- updatedAt (date)
Indexes: { ownerId, birdId: 1 }

9) infrastructure_spaces
- _id
- ownerId
- type (enum: tractor | coop | breeding_pen | brooder)
- name (string)
- capacity (number)
- cleaningIntervalDays (number | null)
- lastCleanedAt (date | null)
- notes (string | null)
Indexes: { ownerId, type: 1 }, { ownerId, name: 1 }

10) assignments (bird/group → space over time)
- _id
- ownerId
- spaceId
- birdIds (array<ObjectId>)
- groupId (ObjectId | null)
- startDate (date), endDate (date | null)
- reservedByPairingId (ObjectId | null)
Indexes: { ownerId, spaceId: 1, startDate: -1 }

11) feed_logs (by space or group)
- _id
- ownerId
- date (date)
- spaceId (ObjectId | null)
- groupId (ObjectId | null)
- feedType (string)
- amountKg (number)
- costCents (number | null)
Indexes: { ownerId, date: -1 }, { ownerId, spaceId: 1, date: -1 }

12) watchlists
- _id
- ownerId
- approvedBreeders (array<birdId>)
- cullList (array<birdId>)
- replacementsNeeded (array<{ role:string, count:number, byDate:date }>)

Notes
- Use validation at API layer to ensure enumerations and reference integrity.
- Add compound indexes to support key reports; iterate as usage patterns emerge.

## Algorithms & Calculations
- Inbreeding “no‑go” alert
  - Detect shared ancestor within last N generations (default 4–5). Use `lineage_cache` to precompute ancestor sets; any intersection flags a no‑go, with severity scaled by depth/frequency.
- Eggs to set for target pullets
  - Formula: eggsNeeded = ceil(targetPullets / (pulletRatio × hatchRate × survivability))
  - Pull rates from historical stats for the pairing (fallback to flock avg or species avg).
- Pairing suggestions
  - Filter: exclude no‑go pairs; weight candidate scores by goal alignment (traits from hens/roos and progeny), genetic distance, space availability, and seasonality.

## UI Scope — Milestones
- v1 MVP
  - Create/edit birds; quick assign sire/dam; basic lineage view
  - Log health, trait checks, egg counts
  - Simple reports: hatch rate per pairing, eggs/week trends
  - QR code: bird profile deep link
- v2
  - Breeding planner with reservations
  - Infrastructure occupancy calendar and cleaning reminders
  - Family tree graph with pan/zoom
  - Top hens/roos leaderboards and goal tracking

## Reports & Visualizations
- Yearly performance: per bird and per bloodline
- Hatch trends by season; survivability curves
- Production trends: eggs/week per bird and per group
- Temperament distribution and trajectory
- Flock family tree: graph visualization
 - Genetic Diversity Clock (seasons left)
 - Egg yield forecast over date range

## Roadmap
- Phase 0: Planning (this doc) — complete data model, API surface, MVP scope
- Phase 1: Backend scaffolding
  - Collections, validation, seeds, lineage cache job, statistics aggregates
- Phase 2: Frontend MVP
  - Bird CRUD, logs, simple charts, QR deep links
- Phase 3: Breeding Planner
  - Pairing suggestions, eggs-needed calculator, reservations
- Phase 4: Infrastructure & Feed
  - Spaces, assignments, cleaning cycles, feed logs and comparisons
- Phase 5: Advanced Reports & Family Tree
  - Graph visualization, leaderboards, seasonal insights

## Open Questions
- Do we support multiple species in v1 (ducks/turkeys), or chicken-only initially?
- How many generations should we precompute for no‑go checks by default?
- Weight-tracking cadence: weekly vs custom?
- Any hardware constraints for QR codes on leg bands (size/readability)?

## Next Steps
1) Confirm data model assumptions above (species scope, generations depth).
2) Define API contracts per collection (CRUD + aggregates).
3) Draft UI wireframes for MVP (bird profile, logs, planner stub).
4) Create initial seed scripts and demo data for testing.


## Refinements and Additions

### Species, Units, IDs, Ownership
- Species-agnostic: Keep schema generic for v1. Default `species = "chicken"` but avoid chicken-only enums.
- Units: Lock to SI (grams, kilograms). Add optional display preferences per user later; store SI in DB.
- Tag IDs: Human-friendly `tagId` format: `FG-YY-####` (prefix + year + sequence per owner). QR-safe.
- Ownership: Support future multi-tenant/multi-site by standardizing identifiers across collections: `ownerId`, `orgId` (optional), `farmId` (optional).

### Data Model Additions
These are additive to the existing collections and power planning/reporting.

13) groups
- _id, ownerId, orgId?, farmId?
- name (string)
- purpose (enum: brood | breeding_pen | growout | layer_flock | meat_run | quarantine | other)
- startDate (date), endDate (date | null)
- notes (string | null)
Index: { ownerId, purpose: 1, startDate: -1 }

14) events (immutable, append-only)
- _id, ownerId, orgId?, farmId?
- entityType (enum: bird | group | space | pairing)
- entityId (ObjectId)
- eventType (enum: hatched | assigned | moved | treatment | culled | died | paired | unpaired | weighed | vaccination | inspection | eggs_set | eggs_hatched | cleaned | feed_added | note)
- eventDate (date)
- payload (object)
- createdAt (date)
Index: { ownerId, entityType: 1, entityId: 1, eventDate: -1 }

15) traits_catalog
- _id, ownerId
- key (e.g., egg_weight, temperament, growth_rate)
- name, description
- scale (enum: numeric | categorical | measured)
- unit (string | null)
- direction (higher_is_better: boolean)
Index: { ownerId, key: 1, unique: true }

16) bird_trait_scores
- _id, ownerId
- birdId (ObjectId)
- traitKey (string)
- scoredAt (date)
- value (number|string)
- notes (string | null)
Index: { ownerId, birdId: 1, traitKey: 1, scoredAt: -1 }

17) pairing_metrics (materialized)
- _id, ownerId
- pairingId (ObjectId)
- season (string: YYYY or YYYY-Qn)
- hatchRate (number)
- fertilityRate (number)
- pulletsRatio (number)
- survivability (number)
- eggsSet (number)
- chicksHatched (number)
Index: { ownerId, pairingId: 1, season: -1 }

Note: `lineage_cache` should store ancestors with depth for fast COI/COR calculations: `ancestors: [{ ancestorId, depth }]`.

### COI and COR Logic
- Cache depth: Precompute ancestors to 5 generations.
- Quick no-go: Any shared ancestor within 3 generations → block pairing.
- COI approximation (Wright): For rooster R and hen H via shared ancestors A:
  - F_offspring ≈ Σ ( (1/2)^(n1 + n2 + 1) * (1 + F_A) )
  - n1, n2 = generations from R/H to ancestor A; assume F_A = 0 if unknown.
- Thresholds (configurable):
  - F ≥ 0.0625 (6.25%, first cousins) → warn
  - F ≥ 0.125 (12.5%, half-sibs/uncle-niece) → block

### Planner Fallback Ladder (rates sourcing)
1) pairing-specific metrics (season-matched if available)
2) same-rooster averages
3) same-hen averages
4) flock seasonal average
5) global flock average

### API Contracts (v1)
Base: `/api/flockgeek/v1`

- Birds
  - POST `/birds`
  - GET `/birds` (filter by status, sex, breed, tagId)
  - GET `/birds/:id`
  - PATCH `/birds/:id`
  - DELETE `/birds/:id` (soft)
  - POST `/birds/:id/parents` { sireId, damId }
  - GET `/birds/:id/lineage?depth=5`
  - GET `/birds/:id/metrics`

- Hatch
  - POST `/hatch-events` { pairingId?, setDate, eggsSet, incubatorId?, notes }
  - PATCH `/hatch-events/:id/outcome` { hatchDate, eggsFertile?, chicksHatched?, pullets?, cockerels?, mortalityByDay? }
  - GET `/hatch-events` (filter by pairingId, season)

- Pairings
  - POST `/pairings` { roosterIds[], henIds[], goals[] }
  - GET `/pairings/:id/summary` (latest metrics, COI ranges for internal combos)
  - POST `/planner/suggest-pairings` { candidateRoosterIds?, candidateHenIds?, goals[], season? } → [ { roosterId, henId, score, coi, reasons[] } ]

- Planner
  - POST `/planner/eggs-needed` { targetPullets, pairingId?, season?, survivabilityHorizonDays? } → { eggsNeeded, usedRates: { hatchRate, pulletRatio, survivability }, sources }

- Spaces & Assignments
  - POST `/spaces`
  - GET `/spaces/occupancy?from=&to=`
  - POST `/assignments` { spaceId, birdIds[], groupId?, startDate, endDate? }

- Feeds & Reporting
  - POST `/feed-logs`
  - GET `/reports/seasonal-hatch?year=YYYY`
  - GET `/reports/top-birds?metric=egg_count&window=365d&limit=5`
  - GET `/reports/line-health?lineId=`

- Events
  - POST `/events`
  - GET `/events?entityType=bird&entityId=...`

- QR
  - GET `/qr/birds/:id.svg` (signed URL)

- Auth/Multitenancy
  - All requests require BaseGeek token
  - Headers: `X-Org-Id`, `X-Farm-Id` (optional)

### Aggregates & Background Jobs
- Nightly
  - Rebuild `lineage_cache` for touched birds
  - Recompute `pairing_metrics` for modified hatches
  - Update production seasonality profiles from rolling history
  - Recompute diversity metrics and cache “seasons left” per owner
- Hourly
  - Space cleaning reminders: `lastCleanedAt + cleaningIntervalDays`
- On-write triggers
  - Hatch outcome updates → update pairing/season aggregates
  - Updating sireId/damId → mark caches dirty for offspring

### Index & Query Notes
- Birds: { ownerId: 1, status: 1, sex: 1, breed: 1 }
- Hatches by season: denorm `seasonYear`, `seasonQuarter`; index { ownerId: 1, seasonYear: -1, pairingId: 1 }
- Events timeline: { ownerId, entityType, entityId, eventDate }
- Egg production: consider monthly rollups later if volume grows

## Egg Count Inference from Group Data

### Overview
Log egg counts at the group/pen level with the set of birds present for the observation window. Start with equal split per bird; as group compositions change over time, infer per‑bird eggs/day via least‑squares regression.

### Schema Updates
- 4) egg_production
  - Add `startDate` (date, optional) and `endDate` (date, optional). If only `date` is set, treat as 1 day.
  - Add `birdIdsSnapshot` (array<ObjectId>) of birds present for the window (auditable, not derived at read time).
  - Add `daysObserved` (number, default 1). Materialize for fast math.
  - Add `source` (enum: manual | import | auto) and `quality` (enum: ok | estimated | questionable).
  - Indexes: { ownerId, groupId, date: -1 }, { ownerId, groupId, startDate: -1 }.
- New: inferred_bird_production
  - _id, ownerId, birdId, period (overall | season | rolling90d), season (YYYY or YYYY-Qn | null)
  - rateEggsPerDay (number), confidence (0–1), observationsUsed (number), groupDiversityScore (number)
  - lastComputedAt (date), modelVersion (string), explain (object | optional)
  - Indexes: { ownerId, birdId: 1, period: 1, season: -1 }
- Optional: inference_runs (audit)
  - _id, ownerId, startedAt, finishedAt, scope (group | bird | org), parameters (object), stats (object), warnings (string[])

### Algorithm (v1)
1) Normalize observations to eggs/day: y_i = eggsCount_i / daysObserved_i
2) Build design matrix X: rows = observations, columns = birds; X[i,j] = 1 if bird j ∈ birdIdsSnapshot_i
3) Solve ridge-regularized least squares with non-negativity clamp:
   - r* = argmin ||Xr − y||^2 + λ||r||^2, then clamp r to [0, 1.5]
   - If rank deficient or obs < birds, blend r = α·ridge + (1−α)·equalSplit (e.g., α=0.6)
4) Confidence from obs/bird ratio, condition number, and residual RMSE
5) Recompute incrementally on new egg logs or membership changes; nightly batch for touched birds/groups

### API
- GET `/metrics/production?birdId=&period=rolling90d|season|overall&season=YYYY-Qn`
  - → { birdId, rateEggsPerDay, confidence, period, season?, observationsUsed, lastComputedAt }
- POST `/inference/rebuild` { scope: "bird"|"group"|"org", id?, period? }
  - Triggers recomputation; returns run stats
- GET `/groups/:id/inference-debug` (optional) → summaries of X/y and residuals

### UI
- Bird profile: inferred eggs/day with confidence chip; rolling sparkline
- Groups: expected vs actual eggs for anomaly spotting
- Clear “inferred” labels and tooltips linking to debug

### Notes
- Use SI units and per-day normalization; clamp to [0, 1.5]
- Seasonality/molt regressors are v2; ensure `birdIdsSnapshot` is required for each group entry

## Genetic Diversity Clock

### Goal
Provide a forecast like: “Seasons left before genetic diversity drops below safe threshold for your flock size,” and recommend interventions (introduce new rooster, swap hens, outcross).

### Minimal Schema
- New: `diversity_metrics`
  - _id, ownerId
  - seasonYear (number), season (YYYY-Qn | null)
  - effectivePopulationNe (number)
  - avgCOI (number) // average current inbreeding across active breeders
  - heterozygosityRelative (number) // H_t/H_0 estimate
  - seasonsLeftAtThreshold (number)
  - assumptions (object) // M/F breeders, threshold, baseline method
  - lastComputedAt (date)
  - Index: { ownerId, seasonYear: -1 }

### Algorithm (v1)
1) Determine active breeding population per upcoming season from `pairings` (roosterIds, henIds). Compute breeders: M = distinct roosters; F = distinct hens.
2) Effective population size: N_e = (4 × M × F) / (M + F)
3) Genetic drift decay: H_t = H_0 × (1 − 1/(2N_e))^t
   - Choose threshold for H_t/H_0 (e.g., 0.9 or 0.85) configurable per owner
   - Solve for t (seasons) until H_t/H_0 < threshold
4) Adjust using current avg COI among breeders as proxy for reduced H_0: H_0' = H_0 × (1 − avgCOI)
5) Output `seasonsLeftAtThreshold` and “next step” suggestions:
   - Introduce unrelated rooster (increase M and reduce avgCOI)
   - Swap hens across lines to reduce relatedness
   - Pause line and outcross to foundation stock

### API
- GET `/forecasts/diversity-clock`
  - → { seasonsLeft, effectivePopulationNe, avgCOI, threshold, assumptions, lastComputedAt }
- POST `/forecasts/diversity-clock/rebuild` { threshold? }

### UI
- Reports: card showing seasons left with color states (safe/warn/danger)
- Planner: banner when proposed pairings reduce seasonsLeft significantly; suggest outcross options

## Egg Yield Forecast

### Goal
Forecast total eggs for a future date range using historical seasonality, inferred per-bird rates, flock size, and planned pairings/assignments.

### Minimal Schema
- New: `production_profiles`
  - _id, ownerId
  - granularity (enum: weekly | monthly)
  - factors (array) // e.g., weekOfYear → factor
  - window (string) // e.g., last 2 years
  - lastComputedAt (date)
  - Index: { ownerId }

### Algorithm (v1)
1) Baseline per-bird rate: use `inferred_bird_production` (rolling90d), fallback to equal split.
2) Seasonality factor: compute weekly factors = (observed eggs per hen per day) / (overall mean) using last N seasons; smooth with moving average and clamp to [0.6, 1.2] initially.
3) Future flock composition: simulate days in [from, to], using `assignments` and `pairings` schedules; include grow-out delay for pullets before laying (configurable, e.g., 24 weeks).
4) Daily forecast: eggs_d = (sum of active-laying birds’ base rate) × seasonalityFactor(weekOfYear(d)).
5) Sum over range; provide bands using ± residual RMSE from historical fit.

### API
- GET `/forecasts/egg-yield?from=YYYY-MM-DD&to=YYYY-MM-DD&includePlanned=true`
  - → { totalEggs, daily: [{ date, expected, lower, upper }], assumptions: { baseRateSource, seasonalityWindow, includePlanned } }
- POST `/forecasts/seasonality/rebuild` { window?: "2y", granularity?: "weekly" }

### UI
- Reports: date-range picker → forecast line with confidence band; summary total
- Planner: when reserving pens/pairings, show expected eggs impact for the window

## AI & ML Features (Optional, Modular)

### 1) Egg Production & Behavior Predictions
- Purpose: Weekly egg count forecasting per group/flock; flag anomalies; identify underperforming hens.
- v1 Approach: Classical seasonal models (Holt‑Winters) using `production_profiles` factors and inferred per‑bird rates; robust anomaly detection via median absolute deviation (MAD) or STL residuals.
- v2 Option: Prophet‑style or lightweight LSTM once data volume justifies.
- API:
  - POST `/ai/forecast/eggs-weekly` { scope: "flock"|"group", id?, horizonWeeks: number } → { weekly:[{ weekStart, expected, lower, upper }], anomalies:[{ date, deltaStd, severity }] }
  - GET `/ai/anomalies?entityType=group|bird&id=&window=30d` → { items:[{ ts, metric, value, expected, score }] }

### 2) Genetic & Breeding Suggestions (Multi‑Objective)
- Purpose: Optimize multi‑season breeding balancing goals (egg size, temperament, color, survivability) with COI constraints.
- v1 Approach: Scored search with constraints (COI thresholds, capacity, season windows) + multi‑objective weighted sum; feasible via heuristic/greedy with backtracking.
- v2 Option: ILP/CP‑SAT for exact optimization when scale grows.
- Inputs: `pairings`, `traits_catalog`, `bird_trait_scores`, `pairing_metrics`, COI via `lineage_cache`.
- API:
  - POST `/ai/breeding/schedule` { seasons: 1-5, goals:[{ key, weight }], maxCOI: number, capacity:{ pens:number, hensPerPen:number }, candidates?:{ roosters[], hens[] } } → { plan:[{ season, roosterId, henGroupId|henIds[], score, coi, expectedHatch }], rationale: string[] }

### 3) Health & Anomaly Detection
- Purpose: Early alerts for weight loss, egg drops, unusual temperament.
- v1 Approach: Rolling z‑scores and change‑point detection (CUSUM/BOCPD‑lite) on `bird_traits.weightGrams`, `inferred_bird_production`, and `temperament_notes.score`.
- API: GET `/ai/health/alerts?window=30d&severity=min|med|max` → { alerts:[{ birdId, type, ts, value, expected, score, actionHint }] }

### 4) Natural Language Summaries
- Purpose: Human‑readable weekly insights for flocks/groups.
- Inputs: Aggregated metrics + anomalies; never expose raw PII.
- API: GET `/ai/summary/weekly?entity=flock|group&id?` → { text }

### 5) Smart Seed / Demo Data Generation
- Purpose: Realistic datasets for testing and demos.
- API: POST `/ai/seed/generate` { seasons:2, hens:20, roosters:3, spaces:4, variability:"medium" } → { summary, files:[...] }

### 6) Optional Vision (v3+)
- Purpose: Classify feather color/pattern, detect injuries, count eggs from images.
- API: POST `/ai/vision/classify` (image) → { labels:[...], confidence:[...] } (behind feature flag)

### Providers & Config
- Pluggable providers with per‑owner settings; start with server‑side inference.
- Env vars (server): `GROQ_API_KEY`, `GEMINI_API_KEY`, `TOGETHER_API_KEY` (optional, mutually independent).
- Settings collection (per owner): `ai_settings` → { provider, model, timeoutMs, costCapPerDay, features:{ summaries:true, optimization:false, vision:false } }

### Background Jobs
- Nightly: refresh forecasts and summaries for active groups; roll anomalies.
- Weekly: recompute breeding schedules if goals or inventory changed.
- On‑event: recompute affected forecasts on significant group membership or production changes.

### Guardrails
- Cost controls: per‑owner caps and cache summaries.
- Privacy: redact identifiers in prompts; avoid sending raw lineage graphs off‑box.
- Fallbacks: if provider unavailable, return deterministic summaries from templates.

### UI — MVP Screens
- Bird Profile
  - Header: name/tag, sex, breed, age, QR icon
  - Tabs: Overview | Lineage | Logs (traits/health/eggs) | Assignments
  - Sidebar: COI with any same-pen hens (live “danger” chip)
- Hatch Log Wizard
  - Step 1: choose pairing/cohort, set date, eggs set
  - Step 2 (later): candle results
  - Step 3: hatch outcome, sexing, auto-create group
- Planner
  - Goals picklist → suggested pairings with COI, expected hatch, eggs to set, space badges
  - One-click “Reserve Pen” creates assignment with date window
- Spaces Calendar
  - Grid by day; color by type; cleaning due badges
- Reports
  - Seasonal hatch trend (line), eggs/week per bird (sparklines), temperament histogram, top hens/roos

### Seed & Demo Data
- Birds: ~12 hens, 3 roos; mixed breeds; realistic hatch dates
- Pairings: 2 active projects (e.g., bigger eggs; calmer roos)
- Hatch events: 3 seasons with varied outcomes
- Spaces: 2 tractors, 1 breeder pen, 1 brooder
- Feed logs: 60 days across two groups

### Default Decisions
- Multi-species: schema-ready; UI chicken-first
- Generations to precompute: 5
- Weight cadence: weekly for growers, monthly for layers (configurable)
- QR length: 20–25 chars; print 12–16 mm; error correction “M”

### Immediate Next Steps (Actionable)
1) Finalize enums & validation as a shared JSON schema for API/UI
2) Implement COI calculator using `lineage_cache` (thresholds above)
3) Implement planner endpoints: suggest pairings, eggs-needed, reserve space
4) Prepare seed JSON to stand up DB for MVP screens

