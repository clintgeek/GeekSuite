# FitnessGeek — The Keto Plan

> Author: Sage × Chef

---

## Context

FitnessGeek tracks one thing today: **calories**. The goal wizard (`AIGoalPlanner.jsx`) calculates a daily calorie target with optional weekly schedule variation. Macros exist as side numbers (`protein_g_per_lb_goal`, `fat_g_per_lb_goal`) but they don't drive the UI.

Keto users have a different primary signal: **net carbs**. Calories matter, but if net carbs exceed ~20g, the day is a write-off regardless of calorie count. Surfacing net carbs as secondary defeats the whole strategy.

This plan introduces a **"mode"** system — a top-level choice that reshapes the goal wizard, dashboard, and food log around the user's tracking philosophy. Standard (calorie-first) and Keto (net-carb-first) ship now. The architecture leaves room for IF, Macro-based, Carnivore, etc. without further refactor.

---

## Design Direction

Matches the existing **"Clinical Precision meets Warm Data"** aesthetic already locked in `theme.jsx` (Teal `#0D9488` primary, Amber `#F59E0B` accent, DM Serif Display + DM Sans + JetBrains Mono).

**Standard mode** owns the Teal identity — calm, measured, calorie-forward.
**Keto mode** adopts an **Amber/Ember** identity — the existing accent color earns its keep as the signature of a distinct tracking philosophy. Net-carb bars burn amber → red as the cap approaches. Feels like an instrument, not a toy.

One conceptual anchor: **the Meter**. Standard mode's hero is a calorie meter. Keto mode's hero is a net-carb meter. Swapping the hero metric is the whole visible payoff of switching modes.

---

## Data Model

### Extend `UserSettings.nutrition_goal`

Add one field and one subdocument to [backend/src/models/UserSettings.js:131-156](backend/src/models/UserSettings.js):

```js
nutrition_goal: {
  // ... existing fields ...
  mode: {
    type: String,
    enum: ['standard', 'keto'],
    default: 'standard'
  },
  keto: {
    net_carb_limit_g: { type: Number, default: 20 },
    track_net_carbs: { type: Boolean, default: true },  // false = total carbs
    macro_split: {
      preset: {
        type: String,
        enum: ['classic', 'high_protein', 'lazy'],
        default: 'classic'
      },
      fat_pct: { type: Number, default: 70 },
      protein_pct: { type: Number, default: 25 },
      carb_pct: { type: Number, default: 5 }
    }
  }
}
```

**Existing users**: default `mode: 'standard'`. No migration script needed — Mongoose defaults fill in on read.

**Why not reuse `plan_type`?** `plan_type` describes *scheduling* (daily vs weekly vs fixed). `mode` describes *tracking philosophy*. Orthogonal concerns. Keep them separate.

---

## UI Integration

### 1. Mode Selector — new Step 0 in `AIGoalPlanner.jsx`

File: [frontend/src/components/FitnessGoals/AIGoalPlanner.jsx](frontend/src/components/FitnessGoals/AIGoalPlanner.jsx)

Insert a new first step: **"Choose your approach"**. Two full-height cards, side-by-side (desktop) or stacked (mobile):

```
┌──────────────────────┐  ┌──────────────────────┐
│   ◯ STANDARD         │  │   ◉ KETO             │
│                      │  │                      │
│   Count Calories     │  │   Low Carb Reset     │
│                      │  │                      │
│   Daily targets.     │  │   Hard carb cap.     │
│   Flexible macros.   │  │   Fat as fuel.       │
│                      │  │                      │
│   ─────────────      │  │   ─────────────      │
│   2,100 kcal/day     │  │   20g net carbs      │
│   typical            │  │   typical            │
└──────────────────────┘  └──────────────────────┘
    Teal accent              Amber accent
```

**Design specifics:**
- Card title: DM Serif Display, 1.5rem
- Description: DM Sans, 0.9375rem, muted
- Typical value: JetBrains Mono, tabular
- Unselected: 1px border, `surface` background
- Selected: 2px accent border (teal or amber), inset shadow in accent color at 8% opacity, subtle glow
- Motion: 180ms `ease-out` transform+border transition on selection

### 2. Conditional Wizard Steps

Wizard becomes:
```
Step 0: Mode         (new — always)
Step 1: Profile      (existing, unchanged)
Step 2: Goal         (existing — weight-loss/maintain/gain)
Step 3a: Calorie Plan (existing — shown if mode=standard)
Step 3b: Keto Plan    (new — shown if mode=keto)
```

### 3. Keto Plan Step (new component)

File: `frontend/src/components/FitnessGoals/KetoPlanStep.jsx` (new)

Three controls:

**A. Net Carb Limit**
- Slider 10g → 50g, step 5g, default 20g
- Live value shown in JetBrains Mono
- Small caption: "Most keto dieters target 20g net carbs or less"

**B. Macro Split — preset picker**
- Three pill buttons:
  - **Classic** — 70 / 25 / 5 (fat/protein/carb)
  - **High Protein** — 60 / 35 / 5
  - **Lazy Keto** — "just watch the carb cap" (hides split display)
- Below: horizontal stacked bar showing the split, colors matching existing macro palette (fat=red/error, protein=green/success, carb=amber/warning)

**C. Track Net or Total Carbs**
- Toggle: "Net carbs (carbs − fiber)" vs "Total carbs"
- Default: net carbs
- Caption: "Net carbs is standard. Total is stricter."

Calorie target for keto mode is still calculated from BMR/TDEE/goal (reuse existing `calculateBMR`, `calculateTDEE` at [AIGoalPlanner.jsx:120-160](frontend/src/components/FitnessGoals/AIGoalPlanner.jsx)). Grams derived from `calories × split%`.

### 4. Dashboard — Mode-Aware Hero

When `mode === 'keto'`, swap the primary metric on the dashboard and food log.

**Standard mode (unchanged):**
- Hero: calorie bar (`CompactCalorieBar.jsx` from upgrade plan)
- Macro pills: Protein | Carbs | Fat

**Keto mode:**
- Hero: **NetCarbMeter** (new, `frontend/src/components/Dashboard/NetCarbMeter.jsx`)
  - Large horizontal bar: `4g / 20g net carbs`
  - Fill color ramps: teal → amber at 70% → red at 100%
  - Label above in DM Sans uppercase tracking: `NET CARBS TODAY`
  - Number in JetBrains Mono, tabular, 2rem
- Secondary row: calorie pill (compact) + macro pills reordered as **Fat | Protein | Net Carbs**
- Status chip: "In range ✓" (teal), "Approaching cap" (amber), "Over" (red)

### 5. Food Log — Net Carb Column

File: [frontend/src/pages/FoodLog.jsx](frontend/src/pages/FoodLog.jsx)

When mode=keto:
- Each food row shows a small net-carb badge next to calories: `140 kcal · 3g nc`
- Day total shows net carbs prominently
- Foods with no fiber data fall back to total carbs and badge with a subtle asterisk

---

## Component Inventory

### New
| Path | Purpose |
|---|---|
| `frontend/src/components/FitnessGoals/ModeSelector.jsx` | Step 0 card picker |
| `frontend/src/components/FitnessGoals/KetoPlanStep.jsx` | Keto config step |
| `frontend/src/components/Dashboard/NetCarbMeter.jsx` | Keto-mode dashboard hero |
| `frontend/src/components/Dashboard/KetoStatusChip.jsx` | In-range/approaching/over pill |
| `frontend/src/utils/ketoMath.js` | `netCarbs(food)`, `ketoMacroGrams(cals, split)` |

### Extended
| Path | Change |
|---|---|
| [backend/src/models/UserSettings.js](backend/src/models/UserSettings.js) | Add `mode` + `keto` subdoc |
| [backend/src/routes/goalRoutes.js](backend/src/routes/goalRoutes.js) | Persist mode + keto fields on POST `/goals` |
| [frontend/src/components/FitnessGoals/AIGoalPlanner.jsx](frontend/src/components/FitnessGoals/AIGoalPlanner.jsx) | Insert Step 0, branch Step 3 on mode |
| [frontend/src/pages/Dashboard.jsx / DashboardNew.jsx](frontend/src/pages/) | Read `nutrition_goal.mode`, swap hero |
| [frontend/src/pages/FoodLog.jsx](frontend/src/pages/FoodLog.jsx) | Show net-carb badges when keto |
| [frontend/src/components/Dashboard/NutritionSummaryCard.jsx](frontend/src/components/Dashboard/NutritionSummaryCard.jsx) | Mode-aware macro ordering |

### Reused (do not duplicate)
- `calculateBMR`, `calculateTDEE`, `computeWeeklySchedule` — [AIGoalPlanner.jsx:120-200](frontend/src/components/FitnessGoals/AIGoalPlanner.jsx)
- `MacroBar.jsx` — already theme-aware via `color` prop
- Theme macro colors: protein=`success.main`, carbs=`warning.main`, fat=`error.main` ([theme.jsx](frontend/src/theme/theme.jsx))
- `settingsService` save/load pattern ([AIGoalPlanner.jsx:660-677](frontend/src/components/FitnessGoals/AIGoalPlanner.jsx))

---

## Open Questions

Surfacing these before building, not after.

1. **Carb source of truth** — food API responses are inconsistent on fiber. Should "no fiber data" foods count as *total* carbs (safe) or display ambiguous with the asterisk (honest)? **Decision: honest + asterisk.**
2. **Dashboard hero in keto mode** — **Decision: Net carbs replaces calories as the hero; calories demote to a secondary pill.**
3. **Mode-switch behavior** — if a user flips Keto → Standard mid-week, do we preserve the keto config subdoc for next time, or wipe it? Default: preserve (cheap, lets them toggle).
4. **History** — does switching modes retroactively recolor past days' dashboards? Default: no. Past days render in the mode that was active when logged (requires storing `mode` on each day's log rollup, OR just rendering historicals as plain calorie data).

---

## Verification

1. **Goal flow** — `npm run dev` in `/frontend`, walk through wizard: Standard path, Keto path, mode-switch mid-wizard.
2. **DB roundtrip** — save Keto goal, check MongoDB `usersettings` collection has `nutrition_goal.mode: 'keto'` and keto subdoc.
3. **Dashboard swap** — log a food with 5g carbs/2g fiber, confirm net-carb meter shows `3g / 20g` in keto mode and unchanged calorie bar in standard mode.
4. **Food log badges** — mixed foods with/without fiber data, verify asterisk rendering.
5. **Defaults** — log in as an existing user (no mode field in their doc), confirm they land on standard mode with no UI change.
6. **Theme** — toggle dark mode in both modes, confirm no hardcoded colors leaked.

---

## Phased Implementation

| Phase | Scope | ~Effort |
|---|---|---|
| **1. Data** | UserSettings schema, goalRoutes, ketoMath utils | 0.5 day |
| **2. Wizard** | ModeSelector + KetoPlanStep, wire into AIGoalPlanner | 1 day |
| **3. Dashboard** | NetCarbMeter, KetoStatusChip, mode-aware hero swap | 1 day |
| **4. Food Log** | Net-carb badges, day totals | 0.5 day |
| **5. Polish** | Dark mode pass, motion tuning, empty/edge states | 0.5 day |

**Total: ~3.5 days** to a shippable Keto mode.

---

*"Calm code, clear mind. Chaos is for staging branches."*
