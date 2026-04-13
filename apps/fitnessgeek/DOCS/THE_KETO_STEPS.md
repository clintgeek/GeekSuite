# FitnessGeek — Keto Mode: Agent Execution Steps

> Companion to `THE_KETO_PLAN.md`
> Four agents run in parallel on isolated worktrees, then merge.

---

## Resolved Ambiguities (read before starting)

| Question | Answer |
|---|---|
| Active dashboard file | **DashboardNew.jsx** (App.jsx line 14 routes `/` → DashboardNew) — ignore Dashboard.jsx |
| CompactCalorieBar exists? | **No.** Calorie hero lives in `DailyTicket.jsx` via MUI LinearProgress |
| nutrition_goal in SettingsContext? | **No.** Pattern is per-component `settingsService.getSettings()` → extract `nutrition_goal` |
| Fiber field name | `fiber_grams` (top-level on food) or `nutrition.fiber_grams` (nested in log entries) |
| Carbs field name | `carbs_grams` (top-level) or `nutrition.carbs_grams` (nested) |
| Net carbs formula | `carbs - fiber` — if fiber missing, use total carbs and flag with `*` |

---

## Shared Context (all agents)

**Repo root:** `/mnt/media/Projects/GeekSuite/apps/fitnessgeek`

**Design tokens already in theme.jsx:**
- Primary teal: `theme.palette.primary.main` (#0D9488)
- Amber accent: `theme.palette.warning.main` (#F59E0B)
- Protein: `theme.palette.success.main`
- Fat: `theme.palette.error.main`
- Carbs: `theme.palette.warning.main`
- Display font: `"DM Serif Display", serif`
- Body font: `"DM Sans", sans-serif`
- Data/number font: `"JetBrains Mono", monospace`

**Mode values:** `'standard'` | `'keto'` — stored at `nutrition_goal.mode`

**Reading mode in a component:**
```js
const [nutritionGoal, setNutritionGoal] = useState(null);
useEffect(() => {
  settingsService.getSettings().then(data => {
    setNutritionGoal(data?.nutrition_goal || null);
  });
}, []);
const mode = nutritionGoal?.mode || 'standard';
```

---

## Agent A — Backend Schema + Utilities

**Branch name suggestion:** `keto/backend-schema`
**Files to modify/create:**
- `backend/src/models/UserSettings.js`
- `backend/src/routes/goalRoutes.js`
- `frontend/src/utils/ketoMath.js` ← frontend utility, lives here for convenience

---

### Task A1: Extend UserSettings schema

File: `backend/src/models/UserSettings.js`

Inside the `nutrition_goal` object definition (currently lines 131–156), add after the existing fields:

```js
mode: {
  type: String,
  enum: ['standard', 'keto'],
  default: 'standard'
},
keto: {
  net_carb_limit_g: { type: Number, default: 20 },
  track_net_carbs: { type: Boolean, default: true },
  macro_split: {
    preset: {
      type: String,
      enum: ['classic', 'high_protein', 'lazy'],
      default: 'classic'
    },
    fat_pct:     { type: Number, default: 70 },
    protein_pct: { type: Number, default: 25 },
    carb_pct:    { type: Number, default: 5  }
  }
}
```

No migration needed — Mongoose defaults handle existing users on next read.

---

### Task A2: Persist mode fields in goalRoutes

File: `backend/src/routes/goalRoutes.js`

Find the `POST /goals` handler (around line 53). Wherever `nutrition_goal` fields are extracted from `req.body` and written to the settings document, ensure `mode` and `keto` are included:

```js
// Add alongside existing field extractions:
if (body.nutrition_goal?.mode !== undefined) {
  updates['nutrition_goal.mode'] = body.nutrition_goal.mode;
}
if (body.nutrition_goal?.keto !== undefined) {
  updates['nutrition_goal.keto'] = body.nutrition_goal.keto;
}
```

If the route uses a full object replace (not dot-notation updates), simply include `mode` and `keto` in the object spread — follow whatever pattern the existing code uses for `plan_type`.

---

### Task A3: Create ketoMath.js utility

Create file: `frontend/src/utils/ketoMath.js`

```js
/**
 * ketoMath.js
 * Utility functions for keto mode calculations.
 * All functions are pure — no side effects, no imports needed.
 */

/**
 * Compute net carbs from a food object.
 * Handles both top-level fields and nested nutrition sub-objects.
 * Returns { netCarbs: number, isMissingFiber: boolean }
 */
export function netCarbs(food) {
  // Normalise — food items use top-level fields; log entries nest under nutrition
  const carbs =
    food?.carbs_grams ??
    food?.nutrition?.carbs_grams ??
    0;

  const fiberRaw =
    food?.fiber_grams ??
    food?.nutrition?.fiber_grams ??
    null;

  const isMissingFiber = fiberRaw === null || fiberRaw === undefined;
  const fiber = isMissingFiber ? 0 : fiberRaw;

  return {
    netCarbs: Math.max(0, carbs - fiber),
    isMissingFiber,
  };
}

/**
 * Given a calorie target and a macro split, return gram targets.
 * split: { fat_pct, protein_pct, carb_pct } — must sum to 100
 */
export function ketoMacroGrams(calories, split) {
  const { fat_pct = 70, protein_pct = 25, carb_pct = 5 } = split || {};
  return {
    fat_g:     Math.round((calories * (fat_pct     / 100)) / 9),
    protein_g: Math.round((calories * (protein_pct / 100)) / 4),
    carbs_g:   Math.round((calories * (carb_pct    / 100)) / 4),
  };
}

/**
 * Returns keto status based on net carbs vs limit.
 * Returns: 'in_range' | 'approaching' | 'over'
 */
export function ketoStatus(netCarbsConsumed, limitG = 20) {
  const pct = netCarbsConsumed / limitG;
  if (pct >= 1)   return 'over';
  if (pct >= 0.7) return 'approaching';
  return 'in_range';
}

/**
 * Preset macro splits
 */
export const KETO_PRESETS = {
  classic:      { fat_pct: 70, protein_pct: 25, carb_pct: 5 },
  high_protein: { fat_pct: 60, protein_pct: 35, carb_pct: 5 },
  lazy:         null, // lazy keto = just watch the carb cap, no split tracking
};
```

---

### Agent A — Verification
1. Start the backend: `npm run dev` in `backend/`
2. `POST /api/goals` with `{ nutrition_goal: { mode: 'keto', keto: { net_carb_limit_g: 25 } } }` — verify it saves
3. `GET /api/goals` — verify `mode` and `keto` fields are returned
4. Import `netCarbs` from ketoMath in browser console or a test file — verify `netCarbs({ carbs_grams: 10, fiber_grams: 3 })` returns `{ netCarbs: 7, isMissingFiber: false }`

---

## Agent B — Goal Wizard (Mode Selector + Keto Step)

**Branch name suggestion:** `keto/wizard`
**Files to modify/create:**
- `frontend/src/components/FitnessGoals/AIGoalPlanner.jsx` (700 lines — surgical edits only)
- `frontend/src/components/FitnessGoals/ModeSelector.jsx` (new)
- `frontend/src/components/FitnessGoals/KetoPlanStep.jsx` (new)

---

### Task B1: Create ModeSelector.jsx

Create file: `frontend/src/components/FitnessGoals/ModeSelector.jsx`

Two selectable cards (Standard and Keto) with the following behavior and design:

**Props:** `{ value, onChange }` — value is `'standard'` | `'keto'`

**Layout:** `Box` with `display: flex`, `gap: 2`, `flexDirection: { xs: 'column', sm: 'row' }`

**Each card is a `Box` (clickable) with:**
```
- onClick: () => onChange(mode)
- cursor: 'pointer'
- border: selected ? `2px solid accentColor` : `1px solid divider`
- borderRadius: 2 (8px)
- p: 3
- flex: 1
- background: selected ? alpha(accentColor, 0.06) : 'background.paper'
- boxShadow: selected ? `inset 0 0 0 1px ${alpha(accentColor, 0.3)}` : 'none'
- transition: 'all 180ms ease-out'
```

**Standard card:**
- Accent color: `theme.palette.primary.main` (teal)
- Title: "Standard" — DM Serif Display, 1.5rem
- Subtitle: "Count calories. Flexible macros."
- Typical: "~2,100 kcal / day" — JetBrains Mono, caption size, muted

**Keto card:**
- Accent color: `theme.palette.warning.main` (amber)
- Title: "Keto" — DM Serif Display, 1.5rem
- Subtitle: "Hard carb cap. Fat as fuel."
- Typical: "~20g net carbs / day" — JetBrains Mono, caption size, muted

Add a selection indicator: a small filled dot (8px circle) in the accent color at top-right of each card — visible only when selected.

---

### Task B2: Create KetoPlanStep.jsx

Create file: `frontend/src/components/FitnessGoals/KetoPlanStep.jsx`

**Props:** `{ ketoConfig, onChange, calorieTarget }` where `ketoConfig` is `{ net_carb_limit_g, track_net_carbs, macro_split }` and `onChange(updatedConfig)` is called on any change.

**Three sections:**

**A. Net Carb Limit**
- MUI `Slider`, min=10, max=50, step=5, defaultValue=20
- Current value displayed in JetBrains Mono, large (1.5rem), amber color
- Label: "Daily Net Carb Limit" (DM Sans, uppercase, small tracking)
- Caption below slider: "Most keto protocols target 20g or less"

**B. Macro Split Presets**
- Three MUI `Chip` components (pill buttons): "Classic 70/25/5", "High Protein 60/35/5", "Lazy Keto"
- Selected chip: `variant="filled"`, amber background
- Unselected: `variant="outlined"`
- When a preset is selected (not Lazy), show a horizontal stacked bar below using three colored `Box` segments:
  - Fat: `error.main`, `fat_pct`%
  - Protein: `success.main`, `protein_pct`%
  - Carbs: `warning.main`, `carb_pct`%
  - Height 8px, borderRadius 4px, total width 100%
- Lazy Keto: hide the split bar, show caption "Track only the carb cap — no macro split"
- Below bar (when not lazy): show gram equivalents if `calorieTarget` is provided — e.g. "Fat 156g · Protein 117g · Carbs 25g" in JetBrains Mono

**C. Net vs Total Carbs Toggle**
- MUI `ToggleButtonGroup`, exclusive, two options: "Net Carbs (carbs − fiber)" | "Total Carbs"
- Default: net carbs
- Caption: "Net is standard. Total is stricter."
- Controlled via `ketoConfig.track_net_carbs`

---

### Task B3: Insert Mode Selector into AIGoalPlanner.jsx

File: `frontend/src/components/FitnessGoals/AIGoalPlanner.jsx`

**IMPORTANT — read the file first and make surgical edits. Do not rewrite the component.**

Current structure (confirmed by audit):
- Line 17: `const [activeStep, setActiveStep] = useState(0);`
- Line 263: `steps` array — currently 3 items: `["Your Profile", "Set Your Goal", "Your Calorie Plan"]`
- Line 287–370: Step 0 content (Profile) — `{!hasExistingGoal && activeStep === 0 && (...)}`
- Line 373–467: Step 1 content (Goal) — `{!hasExistingGoal && activeStep === 1 && (...)}`
- Line 470–695: Step 2 content (Calorie Plan) — `{plan && activeStep >= 2 && (...)}`
- Line 654–686: Save call (`settingsService.updateSettings`)

**Changes to make:**

1. **Add state for mode and ketoConfig** (after line 17):
```js
const [mode, setMode] = useState('standard');
const [ketoConfig, setKetoConfig] = useState({
  net_carb_limit_g: 20,
  track_net_carbs: true,
  macro_split: { preset: 'classic', fat_pct: 70, protein_pct: 25, carb_pct: 5 }
});
```

2. **If loading existing goal** (around line 88 where it sets `setActiveStep`), also load existing mode:
```js
if (existingGoal.mode) setMode(existingGoal.mode);
if (existingGoal.keto) setKetoConfig(existingGoal.keto);
```

3. **Update `steps` array** (line 263) — add new first item:
```js
const steps = ['Your Approach', 'Your Profile', 'Set Your Goal', 'Your Calorie Plan'];
```

4. **Shift all `activeStep` comparisons** — because steps shift by 1:
   - `activeStep === 0` (Profile) → `activeStep === 1`
   - `activeStep === 1` (Goal) → `activeStep === 2`
   - `activeStep >= 2` (Calorie Plan) → `activeStep >= 3`
   - `setActiveStep(1)` in Next handlers → `setActiveStep(2)`
   - Back button `setActiveStep(0)` in Goal step → `setActiveStep(1)`
   - Any `setActiveStep(2)` that jumps to Calorie Plan → `setActiveStep(3)`

5. **Insert new Step 0 block** (before the existing Profile block, now at ~line 287):
```jsx
{!hasExistingGoal && activeStep === 0 && (
  <Box sx={{ mt: 2 }}>
    <Typography variant="h5" sx={{ fontFamily: '"DM Serif Display", serif', mb: 1 }}>
      Choose your approach
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
      This shapes how your goals and dashboard are displayed.
    </Typography>
    <ModeSelector value={mode} onChange={setMode} />
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
      <Button variant="contained" onClick={() => setActiveStep(1)}>
        Continue
      </Button>
    </Box>
  </Box>
)}
```

6. **Branch Step 3 for Keto mode.** The existing `{plan && activeStep >= 3 && (...)}` block stays for Standard. Add a parallel block for Keto:
```jsx
{mode === 'keto' && activeStep === 3 && (
  <Box sx={{ mt: 2 }}>
    <Typography variant="h5" sx={{ fontFamily: '"DM Serif Display", serif', mb: 3 }}>
      Configure Your Keto Plan
    </Typography>
    <KetoPlanStep
      ketoConfig={ketoConfig}
      onChange={setKetoConfig}
      calorieTarget={plan?.dailyCalorieTarget}
    />
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
      <Button onClick={() => setActiveStep(2)}>Back</Button>
      <Button variant="contained" onClick={handleSave}>
        Start Tracking
      </Button>
    </Box>
  </Box>
)}
```
Wrap existing Step 3 (Calorie Plan) with `{mode === 'standard' && plan && activeStep >= 3 && (...)}` to prevent it showing in keto mode.

7. **Update the save call** (lines 654–686) to include `mode` and `keto` fields:
```js
nutrition_goal: {
  // ... existing fields ...
  mode,
  keto: mode === 'keto' ? ketoConfig : undefined,
}
```

8. **Import new components** at the top of AIGoalPlanner.jsx:
```js
import ModeSelector from './ModeSelector';
import KetoPlanStep from './KetoPlanStep';
```

---

### Agent B — Verification
1. `npm run dev` in `frontend/`
2. Navigate to the goal wizard — confirm 4 steps in stepper
3. Step 0: Mode selector renders, Standard/Keto cards selectable
4. Select Standard → wizard flows through existing steps unchanged
5. Select Keto → after Profile + Goal steps, Keto Plan step appears instead of Calorie Plan
6. Complete Keto flow → save → check `nutrition_goal.mode === 'keto'` in response

---

## Agent C — Dashboard (Keto Mode Hero)

**Branch name suggestion:** `keto/dashboard`
**Files to modify/create:**
- `frontend/src/components/Dashboard/NetCarbMeter.jsx` (new)
- `frontend/src/components/Dashboard/KetoStatusChip.jsx` (new)
- `frontend/src/components/Dashboard/DailyTicket.jsx` (modify)
- `frontend/src/pages/DashboardNew.jsx` (modify — mode detection only)
- `frontend/src/components/Dashboard/NutritionSummaryCard.jsx` (modify — macro reorder)

---

### Task C1: Create KetoStatusChip.jsx

Create file: `frontend/src/components/Dashboard/KetoStatusChip.jsx`

**Props:** `{ netCarbsConsumed, limitG = 20 }`

Logic:
- `pct = netCarbsConsumed / limitG`
- `pct < 0.7` → label "In range", color `success`, icon ✓
- `0.7 ≤ pct < 1` → label "Approaching cap", color `warning`
- `pct ≥ 1` → label "Over limit", color `error`

Render: MUI `Chip` with `size="small"`, computed color and label. Use `variant="outlined"` when in range, `variant="filled"` when approaching/over.

---

### Task C2: Create NetCarbMeter.jsx

Create file: `frontend/src/components/Dashboard/NetCarbMeter.jsx`

**Props:** `{ consumed = 0, limitG = 20, sx }`

Design:
```
NET CARBS TODAY               ← DM Sans, 0.7rem, uppercase, letter-spacing 0.1em, muted
4g / 20g                      ← JetBrains Mono, 2rem, bold, amber color
████████░░░░░░░░░░░░          ← LinearProgress, height 10px, borderRadius 5px
✓ In range                    ← KetoStatusChip
```

**Color ramp on the progress bar:**
- Use MUI `LinearProgress` with `sx` override on `bar` class
- `pct < 0.7`: teal (`primary.main`)
- `0.7 ≤ pct < 1`: amber (`warning.main`)
- `pct ≥ 1`: red (`error.main`)

Calculate color via `ketoStatus()` from `frontend/src/utils/ketoMath.js`.

Full component:
```jsx
import { netCarbs as calcNetCarbs, ketoStatus } from '../../utils/ketoMath';
// consumed and limitG are already computed net-carb totals, not raw food objects
const pct = Math.min(consumed / limitG, 1) * 100;
const status = ketoStatus(consumed, limitG);
const barColor = status === 'over' ? 'error.main' : status === 'approaching' ? 'warning.main' : 'primary.main';
```

---

### Task C3: Modify DailyTicket.jsx

File: `frontend/src/components/Dashboard/DailyTicket.jsx`

**Current behavior (lines 273–289):** Renders a calorie LinearProgress bar.

**Add a `mode` prop** (default `'standard'`).

When `mode === 'keto'`:
- Replace the calorie LinearProgress with `<NetCarbMeter consumed={netCarbsConsumed} limitG={netCarbLimit} />`
- Show calories as a secondary line below: `Typography variant="caption"` — `{consumed} / {goal} kcal`
- Add required props: `netCarbsConsumed`, `netCarbLimit`

When `mode === 'standard'`:
- Render exactly as today (no change)

Updated prop signature:
```js
// DailyTicket({ consumed, goal, remaining, mode = 'standard', netCarbsConsumed = 0, netCarbLimit = 20 })
```

---

### Task C4: Mode detection in DashboardNew.jsx

File: `frontend/src/pages/DashboardNew.jsx`

**Add mode loading** using the existing settings pattern (see Shared Context above). Add this alongside the other `useEffect` data fetches already in the file.

**Pass `mode` (and keto values) down to `DailyTicket`** at line 380:
```jsx
<DailyTicket
  consumed={dashboardData.calories.consumed}
  goal={dashboardData.calories.goal}
  remaining={dashboardData.calories.remaining}
  mode={mode}
  netCarbsConsumed={dashboardData.netCarbs?.consumed ?? 0}
  netCarbLimit={nutritionGoal?.keto?.net_carb_limit_g ?? 20}
/>
```

Note: `dashboardData.netCarbs` may not exist yet — default to 0 if undefined. The food log service will need updating later (Agent D covers this) but the dashboard should render without crashing.

---

### Task C5: NutritionSummaryCard.jsx macro reorder

File: `frontend/src/components/Dashboard/NutritionSummaryCard.jsx`

**Add `mode` prop** (default `'standard'`).

When `mode === 'keto'`, reorder macros to: **Fat → Protein → Net Carbs** (instead of Protein → Carbs → Fat).

For Net Carbs row: display `netCarbsConsumed` (new prop) vs the carb goal from keto split. Label it "Net Carbs" not "Carbs". Keep the asterisk flag for missing fiber — pass an `hasMissingFiber` boolean prop.

When `mode === 'standard'`: render exactly as today.

---

### Agent C — Verification
1. With `mode = 'standard'`: dashboard unchanged
2. Manually set mode to `'keto'` in state: NetCarbMeter appears, calories become secondary
3. KetoStatusChip: test all three states by varying `consumed` prop
4. Dark mode toggle: no hardcoded colors visible — all use theme palette references
5. Mobile viewport: NetCarbMeter stays readable, no overflow

---

## Agent D — Food Log (Net Carb Badges)

**Branch name suggestion:** `keto/food-log`
**Files to modify/create:**
- `frontend/src/utils/ketoMath.js` — **check if Agent A created this; if yes, do not recreate, just import**
- `frontend/src/pages/FoodLog.jsx` (modify)

---

### Task D1: Check for ketoMath.js

Before writing anything, check if `frontend/src/utils/ketoMath.js` exists (Agent A may have created it). If it exists, import from it. If not, create it using the same code specified in Agent A → Task A3.

---

### Task D2: Modify FoodLog.jsx — mode detection

File: `frontend/src/pages/FoodLog.jsx`

**Add mode loading** using the pattern from Shared Context above. Extract `mode` and `keto` settings from the loaded `nutrition_goal`.

Store in state:
```js
const [mode, setMode] = useState('standard');
const [netCarbLimit, setNetCarbLimit] = useState(20);
const [trackNetCarbs, setTrackNetCarbs] = useState(true);
```

Load alongside the existing settings fetch in the component.

---

### Task D3: Net carb badges on food items

The food log renders individual food items in meal sections. Find where a food item's calorie count is displayed (likely in a component like `FoodLogItem.jsx` or inline in a meal section map).

**When `mode === 'keto'`**, show a small badge after the calorie count:
```
140 kcal  ·  3g nc
```
or if fiber is missing:
```
140 kcal  ·  12g nc*
```

Implementation:
```jsx
import { netCarbs } from '../../utils/ketoMath';

// Inside the food item render, when mode === 'keto':
const { netCarbs: nc, isMissingFiber } = netCarbs(foodItem);
// Render:
<Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: '"JetBrains Mono", monospace' }}>
  {foodItem.calories} kcal · {nc}g nc{isMissingFiber ? '*' : ''}
</Typography>
```

Pass `mode` down from FoodLog.jsx to whatever component renders individual food items.

---

### Task D4: Day total net carbs in food log

The food log shows a daily calorie summary (likely in `CalorieSummary` component or `DateNavigator`). Find where the daily totals are rendered.

**When `mode === 'keto'`**, add a net carb total row below the calorie total:
```
Net Carbs: 4g / 20g  ← amber color when approaching, red when over
```

Calculate by summing `netCarbs(item)` across all food items in `foodLog` state for the current day. Sum the `netCarbs` values (not the raw food objects).

---

### Task D5: Asterisk footnote

At the bottom of the food log, when `mode === 'keto'` and any item has `isMissingFiber === true`, show a small footnote:
```
* No fiber data available — shown as total carbs
```

`Typography variant="caption"`, `color="text.secondary"`, only rendered if at least one item has missing fiber.

---

### Agent D — Verification
1. Log in as a standard user — food log unchanged
2. Switch to keto mode via goal settings — food log shows `nc` badges on each item
3. Log a food known to have fiber (e.g. broccoli) → net carbs = carbs − fiber
4. Log a food with no fiber data → shows total carbs with `*` asterisk
5. Day total shows net carb bar in amber/red when approaching/over limit
6. Footer footnote appears only when at least one `*` item exists

---

## Merge Order

After all four agents complete:

1. **Merge A first** (backend schema + ketoMath utility) — no conflicts with anything
2. **Merge B** (wizard) — frontend-only, no overlap with C or D
3. **Merge C** (dashboard) — frontend-only, no overlap with B or D
4. **Merge D** (food log) — check if ketoMath.js already exists from A before merging
5. **Integration smoke test** — run full dev stack, complete keto onboarding, verify dashboard hero swap and food log badges end-to-end

---

## Agent Prompt Template

When dispatching each agent, include this instruction at the top of each prompt:

> Read `DOCS/THE_KETO_PLAN.md` and `DOCS/THE_KETO_STEPS.md` before starting.
> Implement only the tasks assigned to your agent section.
> Do not touch files owned by other agents.
> Follow the existing code patterns in the file before adding new ones.
> Use theme tokens — no hardcoded hex colors.

---

*"Chef builds the fire. Sage keeps it burning."*
