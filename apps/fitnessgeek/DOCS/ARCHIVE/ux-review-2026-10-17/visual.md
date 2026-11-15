# FitnessGeek: visual design review (2026-10-16)

Scope: colour, type, hierarchy, spacing, component consistency, iconography, charts, desktop versus phone, light and dark.
Evidence: all 200 harness PNGs in `tools/mobile-harness/out/ci/fitnessgeek/`. I viewed every phone-light scene, the dark versions of the key scenes (01, 02, 05, 05a, 07, 19, 23, 29, 31, 32a), and the desktop versions of 01, 02, 05, 07r, 09, 19, 23, 37 and 01-dark. Theme: `apps/fitnessgeek/frontend/src/theme/theme.jsx`. Contrast numbers come from a node script (`scratchpad/ux2/scripts/c*.js`). Where the code didn't give me the hex, I sampled it from the PNG pixels (marked "measured").

Phone PNGs are 3x (390 × 664 CSS px). Coordinates below are PNG pixels, so divide by 3 for CSS px.

**The headline:** Market Morning lands well on the surfaces rebuilt in this redesign: Home, the meal cards, Simple mode, the composer, More, Settings and the sidebar. The rest of the app still carries **three older colour systems**:
- Studio Slate's teal/emerald/amber Tailwind gradients and emoji on the Full-mode Food log meal sections.
- Tailwind traffic-light colours in BP and Reports.
- MUI's cold greys for tracks, disabled buttons, switches and outlines.

The produce colours are also starting to do jobs other than "which meal": macros, warnings, progress, "done" and "selected". Basil green has become the default colour for every button, so in places it no longer tells you which button is the main one.

---

## Top 10

| # | Finding | Severity | Size |
|---|---|---|---|
| 1 | Food log (Full) meal sections still use the retired Studio Slate palette: amber/emerald/teal/violet gradients, white icons, emoji. The same meal is a different colour on Home and on Log. | Inconsistent + Hurts accessibility (white on amber 2.15:1) | S |
| 2 | The composer results list is a wall of filled basil: Log it plus 6–8 filled "+ Add" pills, and in dark mode 7 bright pale-green blocks. The primary action is lost. | Inconsistent / hierarchy | S |
| 3 | Real food names are truncated to about 16 characters in the composer results, on phone and on desktop. "Fage Total 0% Greek …" loses the words that tell foods apart. | Hurts legibility | S–M |
| 4 | The calorie progress track uses MUI `grey[300]`/`grey[200]` in both modes. In dark mode a #E0E0E0 track is the brightest thing on the screen (12.2:1 against the paper), and the basil fill on it measures only 1.45:1. | Hurts legibility (dark) | XS |
| 5 | Produce colours do several jobs. Leaf means Lunch, Protein, done, selected and info. Lemon means Dinner, Carbs and warning. Tomato means Breakfast, Fat, over-target and first-run progress. On Home the macro bars sit directly under a ring whose segments are meals in the same three colours. | Inconsistent | M |
| 6 | Chart tooltips are broken on phone. On Weight trend the tooltip is pinned open and clipped off the left edge ("3, 2026", "y average"). On Body-comp trend it collapses to one word per line and covers the legend. | Looks unfinished | S |
| 7 | The retired all-caps tracked label style is still in about 15 places: chart legends, "AVG / DAY", "AI INSIGHTS", "EDIT", "LB" and "MMHG". Separately, the household code is shown in the retired monospace face. | Inconsistent | S |
| 8 | Status messages (thinking, offline, failure) all look the same: bold espresso text, no icon, no colour. The thinking spinner shows as a 1-px white dot. Focus on the Log it button shows only as a darker fill (1.41:1 against the normal fill), with no ring. | Hurts accessibility | S |
| 9 | Shapes drift. I count 5 chip/tag shapes, 4 button radii (pill, 16 px, 8 px, 4 px), 3 treatments for delete, 2 places dialog actions live, and 2 different FAB shapes. ThumbFab is a 16-px rounded rectangle in an all-pill app. | Inconsistent | M (spread out) |
| 10 | FABs cover content with no bottom padding to clear them. "Log weight" hides "…your trend since startin[g]". "Add BP" covers the Healthy Range card. The Log "+" covers the meal chips. The Profile cards start at x=0 on phone. | Polish / legibility | XS–S |

---

## Findings in detail

### A. Hurts legibility or accessibility

**A1. Food log meal sections: the legacy palette, white on light gradients**
- Evidence: `fitnessgeek-11-describe-and-log-light.png` (bottom: orange avatar, 🌅, orange "+"); `32a-log-just-added-light.png` (Lunch: emerald avatar #0CAD79 (measured), mint header band #ECF9F1 (measured), ☀️, emerald square "+"); `02-log-light-desktop.png` (Breakfast amber); `32a-…-dark.png` (emerald band on walnut).
- Code: `components/FoodLog/MealSection.jsx:20-50`. The comment there still says "Meal type configuration with modern cyan theme". Dinner is **teal** (#0D9488), snacks are **violet**. The avatar and add button use `background: config.gradient; color: '#ffffff'` (lines 149-150 and 214-215).
- Contrast of the white icon on each gradient start: amber #f59e0b **2.15:1**, emerald #10b981 **2.54:1**, teal #0D9488 3.74:1, violet #8b5cf6 4.23:1. The amber and emerald pairs fail the 3:1 non-text minimum.
- Why it matters: Home tells you Lunch is leaf and Dinner is lemon. Log then tells you Lunch is emerald and Dinner is teal. The meal-to-colour mapping is the identity's main device, and here it contradicts itself on the busiest Full screen. The colour emoji also clash with the flat icon set.
- Fix: replace `MEAL_CONFIG` with `mealColors(mealType, theme.palette.mode)` (theme.jsx:102):
  - Avatar: `bgcolor: produce.fill, color: produce.ink`, no box-shadow, the same as `Home/MealCards.jsx:64`.
  - Header band: `bgcolor: produce.tint`, plus a 6-px `produce.fill` top edge like the Home cards.
  - Add button: `bgcolor: produce.fill, color: produce.ink, borderRadius: 999`.
  - Remove the `emoji` field.
  - Size: S (one file, about 40 lines). This is the most visible fix in the review.

**A2. The calorie track is cold grey, and glaring in dark mode**
- Evidence: `02-log-light.png` and `02-log-dark.png`. The track measures #E0E0E0 in **both** modes. In dark, the track is lighter than the bar.
- Code: `components/FoodLog/CalorieSummary.jsx:155` (`grey[300]` / `grey[200]`). The same grey tracks appear in `NutritionSummary.jsx:237`, `MetricCard.jsx:127`, `FoodLog.jsx:691` and the weight-goal bar (`05-weight-light.png`, #F2F1ED measured).
- Contrast: dark track against the night paper is **12.21:1** (the brightest element on the screen). The dark basil fill #8BCB7E against that track is **1.45:1**, so the filled part reads as the empty part. In light mode, grey[200] against paper is 1.15:1 and reads as cold.
- Fix: add a token `palette.track = isDark ? '#3D3228' : '#EADFCB'` in `buildFitnessOverrides` and use it everywhere a track is drawn. Basil against #EADFCB is 4.86:1. Dark basil against #3D3228 is 6.49:1. Size: XS for the token, S to sweep about 6 call sites.

**A3. Status messages have no semantic treatment, the spinner is invisible, and focus has no ring**
- Evidence:
  - `30-composer-thinking-light.png`: the button reads "· Working it out…" and the spinner is a single white pixel-dot at about x=290.
  - `33-composer-offline-light.png` and `34-composer-failure-light.png`: the message under the button is bold espresso in both, with the same weight and no icon. "No signal" and "That didn't go through" look like neutral help text.
  - `34-…`: the focused Log it button is #24522A against the normal #2F6B35, a 1.41:1 difference, with **no outline**.
- Code: `FoodSearch/ComposerBox.jsx:133` (`CircularProgress size={20}`. Its thin default stroke on a basil fill disappears in a 3x capture.)
- Fix:
  - Spinner: `CircularProgress size={20} thickness={5}`, colour `primary.contrastText`.
  - Status line: render as a row with a 20-px icon.
    - Thinking: an hourglass icon, `text.secondary`.
    - Offline: a CloudOff icon in `warning.main` #9A5B00 (5.38:1).
    - Failure: an ErrorOutline icon in `error.main` #B3261E (6.48:1).
    - Keep the text in ink.
  - Focus: add a theme-level `MuiButtonBase` override, `'&.Mui-focusVisible': { outline: `2px solid ${primary}`, outlineOffset: 2 }`. Basil on paper is 6.36:1. In dark mode use lemon #F7D26A on night paper (11.04:1), or the night basil.
  - Size: S.
  - Caveat: the darker fill might be MUI's hover state rather than focus. Either way, a focus ring is missing from all the button scenes.

**A4. Food names truncate too early (real names are long)**
- Evidence: `29-composer-short-query-light.png`: "Greek Yogurt, Plai…", "Fage Total 2% Greek…", "Fage Total 0% Greek …" (note the stray space before the ellipsis), "Fage Total Split Cup,…". `37-desktop-add-dialog-stable-light-desktop.png`: even in a 600-px dialog, "Greek Yogurt, Plain Who…" and "Fage Total 2% Greek Yo…".
  - Space per name on phone: about 170 CSS px. The row's other columns take the rest: calories (60), an 84-px Add pill, and a 44-px tune icon. On desktop the row adds macros and a source tag.
  - With strings like "Breaded Southern Fried Chicken Breast" or "CHOCOLATE PEANUT BUTTER protein bar", the ending (the flavour, the cut, the % fat) is exactly the part that distinguishes one food from another.
- Code: `FoodSearch/FoodResultRow.jsx:186-192` (`whiteSpace: 'nowrap'`). The subtitle at line 203 is **13 px** (`0.8125rem`), below the 14-px phone floor.
- Fix:
  - Name: `display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', whiteSpace: 'normal'`.
  - Move calories into the subtitle line ("Fage · 6 oz · 190 cal") on xs, which frees about 60 px.
  - Subtitle to `0.875rem`.
  - On desktop, hide P/C/F below `lg` or put them in the subtitle.
  - Size: S.

**A5. The produce-colour progress bars and ring segments are faint against paper**
- Evidence: `01-home-light-desktop.png` macro bars; `01-home-light.png` ring.
- Contrast: lemon bar on paper 1.56:1, leaf 2.08:1, tomato 2.89:1. The lemon ring segment against the cream track is about 1.30:1. Each bar has its number printed beside it, so information isn't lost; this is a legibility nuisance, not a failure.
- Fix: draw the empty track in the new `track` token (A2) and give the fills a 1-px inset edge in `produce.text` (`boxShadow: inset 0 0 0 1px ${p.text}`). Or accept it as is and rely on the numbers. Size: XS. (A cleaner fix is the macro recolour in B2.)

**A6. Weight-trend readings dots nearly vanish, especially in dark**
- Evidence: `05a-weight-trend-light.png` and `-dark.png`.
- Contrast: in light, basil at about 40% alpha gives #ACC3AC against paper, **1.87:1**. In dark, the dots measure about #495C3C against the night paper, **2.21:1**.
- Fix: draw readings at 70% (light #6D9670, 3.33:1; dark #6E9C64, 5.07:1), radius 3.5 px. Size: XS (`Weight/WeightTimeline.jsx`).

**A7. The start weight is greyed to 3.18:1 at display size**
- Evidence: `05-weight-light.png`. "232" measures #948F89 against paper, 3.18:1. Code: `Weight/WeightProgress.jsx:258` (`alpha(text.primary, 0.5)`). It passes the large-text minimum, but it's the only alpha-greyed number in the app, and it reads as "disabled".
- Fix: `color: theme.palette.text.muted` (#6B5847, 6.69:1). It stays visibly secondary next to basil 195. Size: XS.

**A8. Disabled primary buttons are MUI cold grey, and Log it sits disabled at rest**
- Evidence: `02-log-light.png`, `03-food-dialog-light.png`, `06-weight-dialog-light.png`, `31a-composer-fix-sheet-light.png`, and dark `02-log-dark.png`. Background #E0DFDC with text about #A6A6A4 measures 1.84:1. Disabled controls are exempt from contrast rules, but the composer's main button is in this state every time it opens. To Heather it reads as "broken", and it's the coldest grey in a warm palette.
- Fix: theme override `MuiButton.styleOverrides.root['&.Mui-disabled']`:
  - Light: `bgcolor: '#EFE6D6', color: '#8C7A67'` (3.33:1).
  - Dark: `bgcolor: '#2E261E', color: '#A08E7A'`.
  - Size: XS. Consider also keeping Log it enabled-looking and validating on tap (that's for the flow reviewers).

**A9. Dark mode: the snackbar sinks, and Fix pills lose their edge**
- Evidence: `32a-log-just-added-dark.png`. The snackbar measures #10150F, darker than the walnut page (1.01:1 against #1B1612), so it reads as a hole rather than a raised layer. `31-composer-result-simple-dark.png`: the "Fix" pill border (divider #3D3228) against the result tint measures **1.07:1**, so the pill is invisible and only its text shows.
- Fix:
  - Snackbar in dark: `bgcolor: '#3A3026'` (cream ink on it 11.13:1).
  - Outlined pills in dark: `borderColor: '#554636'` (1.48:1). That's decorative, so it's fine; the text carries the meaning.
  - Size: XS.

**A10. Dark cards barely separate from the page**
- Evidence: every dark scene. Night paper #262019 against walnut is **1.11:1**, and the 1-px divider border against walnut is 1.44:1. The soft shadow is invisible on dark. Hierarchy holds on Home, because the tinted meal cards carry it. It flattens on Weight (`05-weight-dark.png`), where a card nests inside a card inside the page, three near-identical browns.
- Fix: in dark mode raise the card border to #4A3D30 (1.54:1 against paper, 1.71:1 against walnut). Or lift `background.paper` one step to #2A231C. Keep the nested stat tiles at `alpha(cream, 0.04)` rather than `background.default`. Size: XS (theme.jsx:62 and 171).

### B. Inconsistent

**B1. Basil overload: too many filled green buttons**
- Evidence:
  - `29-…-light.png` and `-dark.png`: Log it plus 6 filled "+ Add" pills.
  - `37-…-desktop.png`: 9 filled.
  - `07s-reports-body-recovery-light.png`: "Export CSV" is a filled primary on a reading page.
  - `04-copy-meal-dialog-light.png`: "Copy Meal" in the header, plus green-outlined quick buttons.
  - `26-my-foods-recipe-light.png`: filled "New recipe" next to outlined "New food".
  - In dark mode the problem gets worse: pale basil #8BCB7E is the lightest fill in the palette.
- Fix: one filled basil per view. The rest go tonal:
  - Light: `bgcolor: '#E3EEDC', color: primary.main` (5.35:1).
  - Dark: `bgcolor: '#2E3B29', color: '#A9DA9E'` (7.45:1).
  - Apply to the "+ Add" pill (`FoodResultRow.jsx:117-138`, `bgcolor: primary` becomes the tonal pair) and to Export CSV, Copy Meal and New recipe.
  - Define it once as a `tonal` Button variant in the theme.
  - Size: S. Keep filled basil for: What did you eat?, Log it, Save/Done, Check my target.

**B2. One colour per job: stop reusing the produce colours**
- Evidence and code:
  - **Macros**: `Home/MacroStrip.jsx:49-55`. Protein is `lunch.fill`, Carbs is `dinner.fill`, Fat is `breakfast.fill`, directly under the PlateRing (`Home/PlateRing.jsx:71`), whose arcs are meals in the same colours (`01-home-light-desktop.png`). A reader will try to connect "Fat" to Breakfast.
  - **Warning and info banners**: `Dashboard/PlanAccuracyBanner.jsx:81`. Lemon is the warning edge (`01-home-light.png`); leaf is the info edge (`14-home-scan-bmr-banner-light.png`).
  - **Progress**: `Home/FirstRun.jsx:62`. Tomato is the first-run step bar (`20-first-run-light.png`).
  - **Selected**: `FirstRun.jsx:105` and the Settings radio card (`25-settings-experience-light.png`) use `lunch.tint`.
  - **Done**: `Home/TodayStrip.jsx:67` uses the leaf check (`23-full-home-meals-light.png`). The meds checklist also uses leaf.
  - **A third macro colour system**: Reports `DayRibbon.jsx:21-24` uses Tailwind emerald/amber/red/violet for P/C/F/Fi (`07r-reports-light-desktop.png`). The same macros are leaf/lemon/tomato on Home.
- Fix (inside the identity):
  - Keep produce colours for meals only.
  - Give macros a separate neutral-warm ramp built from ink and basil: Protein basil #2F6B35, Carbs `secondary` #8A5A3C, Fat `text.muted` #6B5847, Fibre basil-light #4E8A2A. In dark: #8BCB7E, #D9A77F, #C4B29D, #A9DA9E.
  - Use the same `macroColors(mode)` helper in MacroStrip, DayRibbon and NutritionSummary.
  - Banners: use `warning.main` for the warning edge and `info.main` (or basil) for the info edge.
  - Selected/done states: basil at 8% plus a basil border (Settings already uses the basil border, so only the tint changes).
  - First-run bar: basil.
  - Size: M (about 6 files), but it's mechanical once the helper exists.

**B3. Off-palette semantic colours in BP and Reports**
- Evidence:
  - `07-bp-light.png`: "Normal" chip is emerald text #0A7853 (measured) on mint. That passes at 5.03:1, but it's an emerald, not basil or `success`.
  - The check icon is #2EC190 (measured).
  - The heart tile has a **cyan glow** (`BloodPressure/BPInsights.jsx:189`, `rgba(6,182,212,0.3)`, a Studio Slate leftover). It's visible as a blue halo in both modes.
  - The BP-HR chart stroke is teal (`BPHRChart.jsx:18`, `#0D9488`).
  - `bpUtils.js:84-96` uses Tailwind emerald/amber/orange/red.
  - `07r-reports-light.png`: the "Elevated" dot is #F59E0B at 2.13:1.
  - `FoodLogItem.jsx:241,548`: delete is #EF4444 (3.73:1 on paper, 3.36:1 on its pink tile).
  - `FoodLogItem.jsx:514`: the favourite star is #F59E0B.
  - `MyFoods/FoodSourceUtils.jsx`: MUI green/blue/orange, with a purple source dot in `26-…`.
  - `BPReport.jsx`, `Activity.jsx` and `WeightGoalWizard.jsx:#059669` have their own hexes.
- Fix: map everything to the theme's semantic set (theme.jsx:70-73).
  - BP stages: Normal = success #2F7D32, Elevated = warning #9A5B00, Stage 1 = `tomato.text` #B23A22, Stage 2 and Crisis = error #B3261E. Dark: the matching dark semantic tones.
  - Remove the glow.
  - BP-HR stroke: basil.
  - Favourite star: `dinner.text` #8A6100 (5.49:1).
  - Delete: `error.main`.
  - Size: S–M. A grep for `#[0-9a-f]{6}` in components finds about 35 hexes in about 12 files.

**B4. The retired all-caps tracked labels and monospace are still here**
- Evidence:
  - `05a-weight-trend-light.png` legend "7-DAY AVERAGE · READINGS · GOAL · PROJECTION · OFF TRACK", and its tooltip date "JUN 18, 2026".
  - `07r-…`: "AVG / DAY" on 6 cards, "Sat OCT 10" (small caps mixed into Title Case), "GOAL:" legend.
  - `23-…-desktop.png`: "AI INSIGHTS".
  - `15-home-weight-stat-light.png`: units "LB" and "MMHG". The correct unit is mmHg; capitalising it is a units error, not just a style one.
  - `05-weight-light.png`: "EDIT".
  - `09-profile-light.png`: the household code "h1" is in monospace.
- Code: `textTransform: 'uppercase'` at WeightTimeline.jsx:174,297,309; WeightProgress.jsx:277; DayRibbon.jsx:127,346; Reports.jsx:301; StatCard.jsx:141; AIInsightsCard.jsx:235; Settings.jsx:468,483; Activity.jsx:78,132,145; NetCarbMeter.jsx:40; CalorieSummary.jsx:48; BPChartNivo.jsx:151,255; HouseholdSettings.jsx:432 (`fontFamily: 'monospace'`).
- Fix: remove the uppercase and letter-spacing. Labels become Nunito 700, sentence case, `text.secondary`, 0.875rem. Show units as written ("lb", "mmHg"). The household code: Nunito 800 with `letterSpacing: '0.04em'` and tabular numbers. Size: S (about 15 one-line edits).

**B5. Chip and pill shapes: pick 2**
- Evidence, by shape:
  - (a) Meal toggle pills with a cold grey outline (rgba(0,0,0,.23), 1.73:1): `02`, `28`.
  - (b) "Again" food pills with a cream outline (divider #EFE3CF, 1.26:1). These sit right next to (a) in `03-food-dialog-light.png`.
  - (c) Weight-log "Scale" tags at about 8-px radius: `05d`.
  - (d) "estimate" tag at about 6-px radius with a grey outline: `27`; and source tags "Yours/Catalog/USDA" at 4-px radius: `37`.
  - (e) Wizard summary chips "23.7 lbs to lose" / "24 weeks" as 8-px rectangles: `17`. Household member tags "Food Logs"/"Meals" as 4-px rectangles with an espresso border: `09-…-desktop`.
  - Plus the BP "Normal" chip and the "88 days behind" chip, each with its own tint.
- Fix: two shapes only.
  - **Action pill**: radius 999, minimum height 44 on phone.
  - **Info tag**: radius 999, height 28, `bgcolor: alpha(ink, 0.06)`, no border, 0.875rem, 700 weight.
  - Outlined actions use a warm outline #CDBBA0 (1.86:1, decorative; the text carries the meaning). For a true 3:1 boundary use #9C8A76 (3.30:1).
  - Put `MuiChip.styleOverrides.outlined: { borderColor }` and a `variant: 'tag'` in the theme.
  - Size: S.

**B6. Button and container radii drift**
- Evidence:
  - Pills are the norm.
  - ThumbFab "Log weight" / "Add BP" / the Log "+" are 16-px rounded rectangles (`primitives/ThumbFab.jsx:41`): `05`, `07`, `02`.
  - The Mic button is a 24-px rounded rectangle next to the pill-shaped Log it: `02`, `28`.
  - The Copy-meal quick buttons are 8-px rectangles (`04`).
  - Fix-sheet options and Save are 16 px (`FoodSearch/FixSheet.jsx:78,117,142`), and "Smaller ·/~150" wraps with a dangling dot (`31a`).
  - The 7d/14d/30d segmented control is a 24-px group (`07s`).
  - Nested stat tiles use a 24-px radius inside 24-px cards (`05`, `07`), which looks swollen. The inner radius should be smaller.
- Fix:
  - ThumbFab to `borderRadius: 999`.
  - Mic to a 56 × 56 circle (radius 999).
  - Copy-meal and Fix-sheet buttons to pills. For Fix-sheet, stack the label and number on two lines on purpose ("Smaller" / "~150") instead of letting them wrap.
  - Nested tiles to `tokens.radius.md` (16).
  - Size: S.

**B7. Delete, edit and close: three treatments each**
- Evidence:
  - Delete: espresso outlined trash (`05d`), red filled trash in a pink tile (`32a`, #EF4444), error-red filled trash (`26`).
  - Edit: espresso outlined (`05d`), cold grey #757575 filled (`26`), basil in a sage tile (`32a`).
  - Close X: cold grey (`03`, `27`, `10`) versus espresso (`23`).
- Fix: a single icon set (MUI *Outlined* variants), coloured `text.secondary` (#5C4B3B, 8.25:1). Destructive actions turn `error.main` on hover/press only, not at rest. Close is always `text.secondary`. Size: S.

**B8. Dialog anatomy varies**
- Evidence:
  - The primary action sits in the header ("Copy Meal" `04`, "Save Changes" `10`, "Save recipe" `27`) or in a full-width footer ("Save" in `05e`, `06`).
  - The eyebrow above the title is sometimes context ("Tracking", "Account", "My Foods", "Food Log") and sometimes a date (`05e`).
  - The Fix sheet is a centred dialog with a radius of about 16 (`31a`) while the other dialogs are full-screen.
- Fix: phone dialogs put the primary action in the sticky footer (the thumb zone, as `05e` already does); desktop dialogs put it bottom-right. Use eyebrows only for dates. Size: S.

**B9. Title Case versus sentence case**
- Evidence: "Copy Entire Day", "Quick Copy", "Copy From" (`04`); "Blood Pressure Insights", "7-Day Average", "Healthy Range" (`07`); "Active Weight Goal", "Current Rate", "Time Remaining" (`05`); "Your Metabolism", "Basal Metabolic Rate", "Safety Check" (`16`); "Household Sharing", "Household Name" (`09`, `25`); "Saved Foods" (`26`); "Your Personalized Calorie Plan" (`17`). The redesigned surfaces (Home, More, composer) are sentence case.
- Fix: sentence case everywhere (the copy reviewer may own the wording). Size: S.

**B10. Heading weights vary within one level**
- Evidence: on `16-wizard-scan-source-light.png`, card titles "Your Metabolism" and "Your Deficit" are weight 400. Other card titles are 800 (`05`) or brown `text.secondary` 800 (`07t`, `26`). Some sections use eyebrow plus heading ("Weight trend / Your curve", "Body composition / What it's made of"); others use a single heading ("Activity", "Body").
- Fix: card title = h6 (17 px), 800, `text.primary`. Section eyebrow = 0.875rem, 700, `text.secondary`, used only where the heading is a phrase. Size: S.

**B11. MUI Switch is untouched**
- Evidence: `25-settings-experience-light.png`. The off track is #9E9D9B (measured, 2.68:1), with a white thumb at the default 58 × 38. It's the only stock-MUI control on the Settings page that Heather uses.
- Fix: theme `MuiSwitch`. Track `alpha(ink, 0.25)` when off and basil when on. Thumb paper with `boxShadow: softShadow`. Size `width: 52, height: 32, padding: 0` on a 44-px hit area. Size: XS.

### C. Polish

- **C1. FABs cover content.** `05` hides "…since startin[g]", `07` covers the Healthy Range card, `13` covers the Change text, `02` covers the "Or tap" row. Fix: `pb: 'calc(88px + env(safe-area-inset-bottom))'` on pages that mount a ThumbFab, or hide the FAB once the in-page action is visible. Size: XS.
- **C2. The snackbar covers the Just-added strip's primary button.** `32`, `32a`: the "Added to lunch… Undo" toast sits on top of the strip, and both show the same news. Fix: move the toast above the bottom nav, or suppress it when the strip is visible. The toast text also wraps to 4 lines; trim it to "Added 2 to lunch · Undo". Size: XS.
- **C3. Profile cards bleed off the left edge.** On phone `09-profile-light.png` the Profile and Household cards start at x=0, while the right side keeps a 24-px gutter. On desktop (`09-…-desktop`) the profile card starts 12 px left of the subtitle. A negative margin or Grid spacing is probably leaking. Size: XS.
- **C4. The Calorie plan page sits in an extra paper column.** `16`, `17`: the page sits in a paper box with about a 12-px inset inside the cream, showing a visible strip edge at x≈36, with cards nested inside it. The wizard stepper labels wrap one word per line and clip at the right edge ("Calori"). Fix: remove the wrapper Paper. On xs use a compact "Step 4 of 4" with a basil bar, the same as First run. Size: S.
- **C5. Ring on desktop.** The centre number is about 16 px on desktop (`01-…-desktop`) against the phone's hero size, so the plate looks empty. Fix: `fontSize: { xs: '3rem', md: '2.25rem' }`, minimum 28 px. Size: XS.
- **C6. Duplicated date on desktop.** The top bar shows "Friday, October 16" and the greeting line shows it again (`01-…-desktop`). Drop one. Size: XS.
- **C7. "0days".** `23-…-desktop`: the unit has no space before it. "Steps" has a basil border while its sibling tiles have cream borders. Size: XS.
- **C8. Empty Simple meal tiles.** `19a`: "Nothing yet" tiles leave about 200 px of empty tint because the grid stretches their height. Fix: `alignItems: 'start'` on the grid, or a faint plate icon to fill the space. Size: XS.
- **C9. Small desktop text.** Weight stat tile subtitles and Profile helper text are about 11–12 px on desktop (`05-…-desktop`, `09-…-desktop`); `caption` is 0.75rem. Fix: set a 13-px minimum for captions on md. Size: XS.
- **C10. Reports.** It shows ISO dates ("2026-10-10 → 2026-10-16", and "2026-10-15" in `04`). The daily-totals strip clips its first card on phone (`07r`). The day-status top borders use red and a dashed ochre with no legend nearby on phone. The dark espresso tooltip doesn't match the paper-card chart tooltips. Size: S.
- **C11. Glyph check versus icon check.** "Done ✓" uses a text glyph (`31`) while "Log it" uses an icon. "Added ✓" is the same. Use `CheckIcon` at 18 px. Size: XS.
- **C12. Duplicate icons.** "My meals" and "My foods" use the same crossed-cutlery icon (`24`). Suggest `MenuBook` for meals or `Kitchen` for foods. The Weight nav icon is a filled scale block that's heavier than its neighbours (`02`, nav). Size: XS.
- **C13. Composer input clear "X" overlaps the field border on desktop.** `37`, at x≈905, y≈143. Size: XS.
- **C14. Ochre doing two jobs.** Body-comp trend fat mass is ochre (`05c`), which is also `warning.main`, the colour of "OFF TRACK" and the projection line. Fat isn't a warning. Use the macro Fat colour from B2. Size: XS.
- **C15. Deficit shown in error red.** `16`: "500 calories/day" is in error red, but a deficit is the plan, not a problem. Use ink or basil. Size: XS.
- **C16. Weight log dates.** They show the full year on every row ("Oct 13, 2026"). Show the year only when it isn't the current year. Size: XS.

---

## Palette and type audit

| Token | Value (light / dark) | Where it's used | Doing two jobs? |
|---|---|---|---|
| `primary.main` (basil) | #2F6B35 / #8BCB7E | every filled CTA, selected chips, links, the "190 cal" chip, avatars, dialog header icons, text links, Weight trend line, sparklines, Profile avatar | **Yes.** It's both "the primary action" and "anything interactive", so the primary action stops standing out (B1). |
| `success.main` | #2F7D32 / #8BCB7E | calorie bar (`CalorieSummary.jsx:156`), "Safe", "Stable" | It's 1.25:1 from basil, so effectively the same green; dark is identical. Either merge it into basil or shift it. |
| `warning.main` | #9A5B00 / #F2B45A | OFF TRACK, projection line, **fat-mass line**, streak tile icon | **Yes:** warning and a body metric (C14). |
| `error.main` | #B3261E / #FF9A8A | 88 days behind, deficit value, Leave household, red trash | Deficit is a misuse (C15). |
| `info.main` | #2A5F8F / #8CC4F0 | barely used; the banner uses leaf instead | Under-used. |
| `secondary.main` | #8A5A3C / #D9A77F | almost unused | A good candidate for the Carbs macro colour. |
| `text.primary` (espresso) | #2A2118 / #F7EDE0 | body, headings, ink on produce | Fine. |
| `text.secondary` | #5C4B3B / #D6C6B3 | sub-text, eyebrows, card titles (sometimes) | Fine. It's also used as a heading colour in some places (B10). |
| `text.muted` | #6B5847 / #C4B29D | captions | Fine. |
| `divider` | #EFE3CF / #3D3228 | card borders, outlined-button edges, chip edges, dashed rules | **Yes.** It's a structural divider and also the boundary of tappable outlines, where it measures 1.26:1 (B5). |
| tomato `fill` | #F07156 / #FF8A70 | Breakfast; **Fat macro**; **first-run progress**; over-target bar | **Yes** (B2). |
| leaf `fill` | #8BC34A / #A5D46F | Lunch; **Protein**; **done checks**; **info banner edge**; meds taken | **Yes** (B2). |
| leaf `tint` | #EDF5E0 / #27301E | Lunch card; **Settings selected**; **First-run chosen**; same-as-yesterday card | **Yes.** |
| lemon `fill` | #F6C945 / #F7D26A | Dinner; **Carbs**; **warning banner edge**; sidebar accent | **Yes.** The sidebar accent use is fine (it's chrome); the macro and warning uses are not. |
| plum `fill` | #C184BE / #D39ACF | Snacks only | Clean. |
| produce `text` | #B23A22 / #3F7A25 / #8A6100 / #7E3F7B | defined, almost unused | Available for the favourite star and for stage colours. |
| *(missing)* `track` | (none) | grey[200]/[300], #F2F1ED, cream ring track | Add one (A2). |
| *(missing)* tonal button | (none) | (none) | Add one (B1). |
| *(missing)* `macro.*` | (none) | produce colours (Home), Tailwind (Reports) | Add one (B2). |
| *(stray)* Tailwind/MUI hexes | ~35 values | MealSection, BP, DayRibbon, FoodLogItem, FoodSourceUtils, Activity, BPReport | Remove them (A1, B3). |

**Type scale (phone):**
- h1 36 / h2 30 / h3 24 / h4 20 / h5 18 / h6 17, body1 18, body2 16, button 16/800, chip 14/700, caption 12.
- The 18-px body text is right for Heather, and Larger text (`22-…`) scales cleanly: chips wrap and nothing clips.
- Below 14 px on phone:
  - result subtitles 13 px (`FoodResultRow.jsx:203`)
  - chart axis labels about 13 px
  - captions 12 px (helper text under fields, `06`)
- Everything else is 14 px or more.
- Desktop drops body1 to 16 and body2 to 15. Some captions land at 11–12 px (C9).
- One family (Nunito) everywhere except the monospace household code. Tabular numbers are applied; I saw no number misalignment.

**Spacing:** card padding is consistently 24 px (sx 6) on phone. The page gutter is 24 px, except Calorie plan (about 36 px, C4) and Profile (0 px left, C3). The Household card's inner content is inset 26 px more than its siblings on Settings (`25`: icon at x=78 against x=52 on the card above). Vertical rhythm between cards is a consistent 24 px.

---

## Contrast measurements (selected)

| Pair | Ratio | Result |
|---|---|---|
| white on MealSection amber #f59e0b | 2.15 | fails 3:1 (icon) |
| white on MealSection emerald #10b981 | 2.54 | fails 3:1 |
| dark calorie track #E0E0E0 vs night paper | 12.21 | glare: the track outshines the content |
| dark basil bar vs #E0E0E0 track | 1.45 | fill and track can't be told apart |
| readings dots, light / dark | 1.87 / 2.21 | weak |
| start weight #948F89 (measured) | 3.18 | large text only |
| divider as pill outline | 1.26 | decorative only |
| MUI outlined chip edge | 1.73 | decorative only |
| Log it focus (fill change only) | 1.41 | no visible ring |
| dark snackbar #10150F vs walnut | 1.01 | sinks |
| dark Fix-pill border vs result tint | 1.07 | invisible |
| night paper vs walnut | 1.11 | flat |
| "Normal" emerald text (measured #0A7853) on mint | 5.03 | passes, but off-palette |
| delete #EF4444 on its pink tile | 3.36 | icon passes, but off-palette |
| Switch off track #9E9D9B | 2.68 | below 3:1 |
| ink on all produce fills (light / dark) | 5.42–10.05 / 7.80–12.29 | all good |
| text.secondary on all four meal tints (light / dark) | 7.0–7.6 / 8.2–8.5 | all good |

**Test gap:**
- `packages/ui/src/__tests__/themeContrast.test.js:310-313` still describes the FitnessGeek sidebar as "#0C0A09".
- The active-row assertion uses `rgba(45, 212, 191, 0.12)`, which is Studio Slate teal, not `chrome.ACTIVE_BG` (lemon 14%). The hover assertion uses 0.04, not `HOVER_BG` 0.06.
- The real pairs pass (I estimate about 9.4:1), but the test is checking colours the app no longer uses.
- The produce ink-on-fill pairs that theme.jsx:17 says the test "holds" aren't in the test at all.
- Fix: import `ACTIVE_BG`, `HOVER_BG` and `mealColors` and assert the real values. Size: XS.

---

## What already looks good (keep)

- **Home meal cards** (`23`, `19`, `19a`, dark `23`): produce top edge, soft tint body, a filled "+ Add" pill with ink text (5.4–10:1), and calories in tabular numbers. This is the identity working. Every other meal surface should copy it, especially Food log.
- **The plate ring:** a cream track and inner rim that look like a plate, with produce arcs. It holds up in dark (`01-dark`).
- **Simple Home** (`19`, `19-desktop`): one big basil "What did you eat?", then the plate summary, then meal tiles. The clearest hierarchy in the app. It works on desktop too.
- **The composer's base styling:** a basil focus border with a soft halo (`03`, `28`), an 18-px placeholder in readable `text.secondary` (8.25:1), the "Same as yesterday's lunch" card tinted with that meal's own colour (`21`, `36`), and the "Make it 2" outlined state change (`29a`).
- **The chalkboard sidebar** (desktop): chalk at 12.96:1, a lemon active pill, clear grouping. It works in both modes.
- **Dark mode** as "the same kitchen at night": the walnut and warm-cream ink, meal tints that stay recognisable (tomato #3A2620, leaf #27301E), and the dark-label pale-basil CTA (8.82:1).
- **The Meds checklist** (`19a`): a leaf check with ink tick, a tinted row, and big 48-px boxes.
- **More list** (`24`): sage icon tiles, 2-line rows, chevrons, consistent rhythm.
- **Dashed empty states** (`12`, `18`): a dashed cream border, a centred icon, an outlined pill. Consistent and calm.
- **Larger text** (`22`): the root-rem scaling holds everything together; chips wrap and nothing overflows.
- **Body-composition card** (`05b`): a big tabular figure, small bold unit, a dashed rule, a 2-column stat grid. The cleanest data card in the app.
- **Nunito with tabular numbers throughout:** the numbers line up with no monospace face.

---

## Suggested order (smallest effort, biggest visual win)

1. A1 MealSection to produce colours (S).
2. A2 add a `track` token and sweep (XS–S).
3. B1 tonal "+ Add" and a tonal variant (S).
4. A4 two-line names, 14-px subtitle (S).
5. Chart tooltip fixes (Top 10 #6): `WeightTimeline.jsx` and `BodyCompTrend.jsx`. The tooltip shouldn't render on load, needs a `minWidth: 180` and should flip at the edges (S).
6. A3 status icons, spinner thickness, global focus ring (S).
7. B4 remove the uppercase and monospace (S).
8. B2 `macroColors` helper and the banner/selected/progress recolour (M).
9. B3 the stray-hex sweep in BP, Reports and FoodLogItem (S–M).
10. B5–B8 shape and anatomy consolidation (M, spread out).
