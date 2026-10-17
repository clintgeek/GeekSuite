# FitnessGeek: information architecture, copy, and data presentation review

*2026-10-16, read-only. This reviews the state after today's REVIEW_2026-10 build. It builds on
SIMPLE_AND_FULL_PLAN's decisions (four tabs, nothing removed, Simple hides detail rather than
deleting it) and does not reopen them.*

**Evidence:** the harness PNGs in `tools/mobile-harness/out/ci/fitnessgeek/` (phone light
unless marked "desktop") and code under `apps/fitnessgeek/frontend/src`. All file:line
references are relative to that directory.

**Severity:**
- **Confusing**: someone will misread it or get stuck.
- **Inconsistent**: the same thing is said or done two ways.
- **Polish**: worth doing, low harm.

**Sizes:** S is under half a day, M is about a day, L is multi-day.

**Who it hits:** **H** is Heather (Simple, phone). **C** is Chef (Full, phone and desktop).

**Caveat on the desktop PNGs:** some desktop captures are older than today's commits. For
example, the sidebar in `01-home-light-desktop` still says "Find a food", but `a64c02f3`
changed it to "Look up a specific food". Findings below are checked against the code wherever
they depend on a label.

---

## 0. The top 10

| # | Finding | Sev | Who | Size |
|---|---|---|---|---|
| 1 | Both of Simple's "set a goal" buttons drop Heather into the most technical screen in the app (Standard vs Keto, BMR, TDEE, Katch-McArdle, "Weekender") | Confusing | H | M |
| 2 | Blood pressure's headline says **Normal** (the last single reading), while the 7-day average is Elevated and 13 of 14 readings are out of range. Reports says "Elevated" | Confusing | C (H if she starts BP) | S |
| 3 | The weight goal card contradicts itself: "Goal: 1.0 lbs/week", you're doing 1.3, and yet you're "88 days behind" in red. The goal line actually needs about 1.5 lb/week | Confusing | C, H | S |
| 4 | Two "to go" numbers for one goal: Weight says 24.9 lb (7-day average), the plan wizard says 23.7 lb (latest weigh-in), and neither says which basis it uses | Inconsistent | C, H | S |
| 5 | Settings and Profile overlap: Household appears on **both**; the name and goal from the first run can't be edited anywhere; and Settings mixes three save models on one page | Confusing | H, C | M |
| 6 | Units are a mix: cal / kcal / calories / calories/day for one quantity; lb vs lbs on the same page; numbers with and without thousands commas | Inconsistent | both | S–M |
| 7 | Verbs and toasts for the same act vary: Remove vs Delete, Undone ✓ vs Put back. vs "is back", Could not / Couldn't / Failed to, "successfully!" | Inconsistent | both | S |
| 8 | Reports: the page's range toggle doesn't control the first section. Comparison windows differ card to card. The day ribbon uses ISO dates and unscaled mini-bars. Meal breakdown doesn't say total or per day | Confusing | C | M |
| 9 | Garmin data lives in four places (Activity, Health dashboard with its own Settings tab, Reports "Body & recovery", the Home steps card). Sleep and HRV each appear three times | Inconsistent | C | M–L |
| 10 | Title Case and doubled "eyebrow + title" headings survive on the older screens (weight goal, BP, Reports, wizard, Copy meal, Profile, Health dashboard), against the sentence-case voice of the new ones | Inconsistent | both | M |

---

## 1. Information architecture and navigation

### 1.1 The map as built

```
Bottom bar (phone):   Home(title "Today") · Log(title "Food log") · Weight · More
Sidebar (desktop):    Full  → Today / Check-ins / Food / Body and activity / Looking back, Settings in footer
                      Simple→ Today / Check-ins / Everything else → More

More (Full):          Check-ins [BP, Meds] · Food [Look up a specific food, My meals, My foods, Calorie plan]
                      Body and activity [Activity, Health dashboard, Import a scan]
                      Looking back [Reports, Profile] · You [Settings]
More (Simple):        Check-ins [BP, Meds] · You [Settings] · Everything else [all 9 of the above]
```

### 1.2 Findings

**IA-1. Simple's two goal entry points lead into the Full-grade wizard.** Confusing · H · M
- **Evidence:**
  - Home: `pages/DashboardNew.jsx:304, 452` "Set your daily target" goes to `/calorie-wizard`.
  - Weight: `components/Weight/WeightProgress.jsx:131-150` "Set your goal" goes to `onEditGoal`, which `pages/Weight.jsx:130` points at `/calorie-wizard`.
  - The wizard (`components/FitnessGoals/AIGoalPlanner.jsx`) runs four steps:
    - Step 1 is **Standard vs Keto** ("Hard carb cap. Fat as fuel.", `ModeSelector.jsx:20-31`).
    - It re-asks age, height and sex (which Profile already holds).
    - It offers "Weekender (Fri/Sat higher)" and a disabled "Step/workout flex (coming soon)".
    - It ends on a page of "Basal Metabolic Rate (BMR)", "Total Daily Energy Expenditure (TDEE)", "(Katch-McArdle)", "Your Deficit / Safety Check" (screenshots 16, 17).
  - Simple's plan says reports, macros and settings "stay out of the way", but these two buttons are the most likely things she'll tap.
- **Fix:**
  - When `isSimple`, the wizard opens in a one-screen "quick target" form:
    - **"How fast?"** with three choices: "Slowly (½ lb a week)", "Steady (1 lb a week)", "Faster (1½ lb a week)".
    - Age, height and sex are prefilled from Profile, and only asked for when missing.
  - The result reads: **"Your daily target: 1,800 calories. That should lose about 1 lb a week."** It has a **Save** button and a collapsed link, "How this was worked out", which holds the BMR/TDEE card.
  - Skip the Approach step (Standard is implied).
  - Hide plan types: Weekender, and anything marked coming soon.
  - Full is unchanged.

**IA-2. Settings and Profile overlap, and the Simple-face settings have dead ends.** Confusing · H, C · M
- **Evidence:**
  - `pages/Profile.jsx:178` and `pages/Settings.jsx:217` both render `<HouseholdSettings />`. Same card, two pages (screenshots 09-desktop, 25).
  - Profile says "Your identity and account. App preferences live in Settings." Its pointer card says "Theme, units, notifications, and Garmin integration". Notifications were removed (`Settings.jsx`, removal comment).
  - **Name:** the first run's "What should I call you?" (`preferred_name`) is used in "Good afternoon, Heather" but is written only by `FirstRun.jsx:43`. No screen edits it afterwards. Profile edits First/Last Name, which the greeting doesn't use.
  - **Goal:** the first-run goal (Lose a little / Keep steady / Just keep track) has the same problem: no way to change it. If she picked "Just keep track", nothing offers a target again.
  - Profile sits under "Looking back" on More (`navConfig.jsx:89`). It isn't a look back.
- **Fix:**
  - Fold Profile into Settings as one "You" page, with these sections:
    1. **How it looks**: Simple/Full, Larger text, Theme.
    2. **About you**: "What should I call you?", "Your goal", age, height, sex ("used to work out your calorie target").
    3. **Household**.
    4. **Garmin**.
    5. **Health alerts**.
    6. **Account**: email, change password, sign out.
  - `/profile` redirects to `/settings#you`.
  - More loses a row, and "Looking back" becomes just Reports.

**IA-3. Settings saves three different ways on one page.** Inconsistent · H, C · S–M
- **Evidence (`pages/Settings.jsx`):**
  - The experience card says "Saved as soon as you choose."
  - Household has its own per-field **Save** buttons (screenshot 25).
  - Theme, units, Garmin and health alerts wait for a sticky "Unsaved changes · Save Changes" bar (lines 470-488).
  - A person who changes the theme and leaves loses it. Someone who has just read "saved as soon as you choose" will expect otherwise.
- **Fix:**
  - Every select and switch saves on change, with a "Saved" toast.
  - Only the Garmin email and password keep an explicit button, labelled **Connect Garmin** / **Update Garmin login**.
  - Drop the sticky bar.

**IA-4. Garmin and recovery data is scattered over four places.** Inconsistent · C · M (merge), L (rebuild)
- **Evidence:**
  - **Activity** (`pages/Activity.jsx`): Today's Summary, Heart Rate, Sleep Details, Health Metrics, Recent Activities.
  - **Health dashboard** (`pages/HealthDashboard.jsx:215-219`): tabs Overview / Sleep Analysis / Meal Impact / Recovery Coach / **Settings**, a second settings page for InfluxDB. Its empty state is "InfluxDB Integration Required… requires InfluxDB integration to display advanced analytics."
  - **Reports**: "Body & recovery · 90-day trends", with resting HR, HRV, sleep, stress/Body Battery, intensity minutes, steps and fitness age (07s, 07t, 07u).
  - **Home (Full)**: a Steps stat card.
  - **Overlap:** sleep appears three times, HRV three times, resting HR three times.
  - **Not in the harness:** Activity and Health dashboard have no scene, so they're unaudited.
- **Fix (M):** merge the two pages into one, under three tabs. On More, put it under one heading, "Garmin", with the description "Steps, sleep, heart and recovery from your watch".

  | Tab | Contents |
  |---|---|
  | **Today** | Activity's summary plus Recent activities |
  | **Last night** | One sleep view, Health dashboard's SleepAnalysis |
  | **Trends** | Link to Reports' body section, or move it here |

  - Move InfluxDB to Settings → Garmin as an "Advanced" row with plain copy: "Live heart rate and stress (needs the home data server)".
  - Reports keeps one compact "Body & recovery" summary that links into it.
- **Fix (L):** retire Meal Impact and Recovery Coach unless Chef actually uses them.

**IA-5. Body composition: the import button isn't where the data is.** Polish · C · S
- **Evidence:**
  - Import a scan sits under More → Body and activity.
  - The Weight page's body-composition section links to `/scan-import` only in its empty state (`BodyCompositionSection.jsx:60`).
- **Fix:**
  - Add a small "Add a scan" text button in the body-composition header on Weight (Full).
  - Keep the More row for share-target users.

**IA-6. Two editors for one meal list, with different grammar.** Inconsistent · C · S (copy), M (unify)
- **Evidence:**
  - **Home (Full)**: meal cards with an **✕** per row; the toast says "Removed X" (`DashboardNew.jsx:272`).
  - **Log**: the older `MealSection` with:
    - emoji titles (🌅 ☀️ 🌙 🍎, `MealSection.jsx:25-49`);
    - an emerald/orange header that isn't Market Morning;
    - a save-meal 💾 icon with no label;
    - star / pencil / trash on each row;
    - a "Deleted X" toast (`FoodLog.jsx:410`);
    - an empty state of "No foods logged yet" + "Add Food". Home says "Nothing yet" + "+ Add".
  - Screenshots 23 vs 32a.
- **Fix:**
  - Same words on both: "Remove", "Removed X · Undo", "Nothing yet", "+ Add".
  - Drop the emoji. Label the save icon "Save as a meal".
  - Longer term, Log reuses the Home `MealCards` with an "edit" affordance (M).

**IA-7. Many paths lead to "the target".** Confusing · C, H · S (copy)
- **Evidence:**
  - Home banner: "Your daily calorie target is probably too high" with button **Check my target**. The scan banner says "your plan uses 1,980" with button **Update my plan** (01, 14).
  - Log's ⚙ opens "Calorie Goal Today / Adjust today" (`FoodLog.jsx:508-512`).
  - More: "Calorie plan — Work out a daily calorie target".
  - The weight goal's **EDIT** opens the same wizard.
  - The words target, goal, plan, Daily Target and Calorie Goal Today all name one number.
- **Fix:** the glossary in §4.
  - Both banners' buttons say **Review my plan**.
  - Log's panel becomes **"Today's target"**, with field "Change it for today only".
  - The weight card's button becomes **Change goal**.

**IA-8. The tab label and the page title don't match.** Polish · H · S
- **Evidence:**
  - The **Home** tab is titled "Today", then greets "Good afternoon, Heather · Friday, October 16" right below.
  - The **Log** tab is titled "Food log".
  - In Simple, the sidebar's "More" row is built from `D.home` with its fields overridden (`navConfig.jsx:69`). Harmless, but brittle.
- **Fix:**
  - Top-bar title "Home" on the Home tab. The greeting already carries the day.
  - Keep "Food log", since it reads as the page's name.

**IA-9. Simple's "Everything else" is honest, but unordered for her.** Polish · H · S
- **Evidence:** 24a lists, in order: Look up a specific food, My meals, My foods, Calorie plan, Activity, Health dashboard, Import a scan, Reports, Profile.
  - For Heather:
    - Activity is a dead end ("Garmin isn't connected").
    - Health dashboard is a dead end ("InfluxDB Integration Required").
    - Import a scan has no scale behind it.
    - Calorie plan is IA-1.
- **Fix (no removals):**
  - Order by her use: My meals, My foods, Look up a specific food, Reports, then the rest.
  - Make the descriptions say what each needs:
    - "Steps and sleep — needs a Garmin watch".
    - "Body-composition scans — needs the smart scale".
    - Health dashboard: "Live heart and stress — needs Chef's data server" (or just "needs setup").

**IA-10. Orphans and leftovers.** Polish · nobody (code)
- **Evidence:**
  - `components/Weight/WeightGoalWizard.jsx` and `components/Dashboard/GarminSummaryCard.jsx` are imported nowhere. `PWAUpdatePrompt` was already called dead in the plan.
  - Screens with no harness scene, and so unaudited:
    - Activity;
    - Health dashboard (all 5 tabs);
    - Medications page (only the checklist has a scene);
    - My meals;
    - Look up a specific food;
    - Household view;
    - Edit log;
    - Save meal.
- **Fix:** delete the orphans, and add scenes for the screens listed.

### 1.3 Proposed nav map

Bottom bar unchanged. Changes are in **bold**.

```
Bottom:  Home · Log · Weight · More                    (title on Home → "Home")

More — Full                                More — Simple
  Check-ins                                  Check-ins
    Blood pressure  · Log a reading            Blood pressure · Log a reading
    Medications     · Your meds and today's    Medications    · Your meds and today's doses
                      doses
  Food                                       You
    Look up a specific food                    Settings · Simple or Full, your name and goal, larger text
    My foods     · Foods and recipes you made
    My meals     · Meals you saved            Everything else  (ordered for her, honest descriptions)
  **Your plan**                                My meals · My foods · Look up a specific food · Reports
    **Calorie plan · Your daily target and     Calorie plan (opens the quick form, IA-1)
      weight goal**                            Garmin · needs a Garmin watch
  **Garmin**                                   Import a scan · needs the smart scale
    **Activity & recovery · Steps, sleep,
      heart (one page, 3 tabs)**
  Looking back
    Reports · How the week and the month went
    **Import a scan → also a button on Weight**
  You
    **Settings (Profile folded in)**

Sidebar Full: Today [Home, Food log] · Check-ins [Weight, BP, Meds] · Food [Look up, My foods, My meals]
              · **Your plan [Calorie plan]** · **Garmin [Activity & recovery]** · Looking back [Reports, Import a scan]
              · footer Settings
```

---

## 2. Copy and microcopy

### 2.1 Voice

**V-1. Pronouns drift.** Inconsistent · both · S
- **"I"** (good, and the most-loved lines):
  - "Say it like you'd tell a friend. I'll work out the calories." (`ComposerBox.jsx:185`)
  - "I heard: …"
  - "I couldn't work out 'crackers'."
  - "Add what you ate and I'll keep count." (`plainWords.js:26`)
- **"we"**:
  - "…log something from the Food Log — we'll remember it" (`pages/MyFoods.jsx:271`).
  - "We couldn't calculate your plan…" (`AIGoalPlanner.jsx:728`).
- **Product name in third person**: "FitnessGeek needs your microphone…" and "FitnessGeek is restarting." Both fine: they're system voices.
- **Fix:** "I" when the app does thinking for you; "you" everywhere else; never "we". The two replacements:
  - My foods empty state: "Foods you create, and foods you log often, show up here. **+ New food** makes one now."
  - Planner: "Your plan can't be worked out without your height. Add it in Settings → About you."

**V-2. Sentence case vs Title Case.** Inconsistent · both · M (many files, all mechanical)
- **Rule:** the new surfaces use sentence case ("Tell me what you ate", "Today's meals", "Weight log"). The older ones use Title Case or ALL CAPS.
- **Offenders, by screen:**
  - **Weight goal card** (`WeightProgress.jsx:244, 297, 350, 372, 392`):
    - "Active Weight Goal", "Current Rate", "Time Remaining", "Projected Completion" → sentence case.
    - "32.7% Complete" → "33% of the way".
    - "EDIT" → "Change goal".
  - **Weight trend legend:** "7-DAY AVERAGE · READINGS · GOAL · PROJECTION · OFF TRACK" (05a) → "7-day average · weigh-ins · goal · at this pace".
  - **BP** (07): "Blood Pressure Insights", "7-Day Average", "30-Day Trend", "Healthy Range", "Category Distribution", "View Report", "Add Reading" / "Edit Reading" (`AddBPDialog.jsx:232`).
  - **Reports:**
    - "Daily Totals", "Meal Breakdown / By Time of Day", "Goal Compliance / On-Target Days", "Top Foods", "Trend Highlights", "AI Coach / Weekly Summary", "AI Insight / Trend Watch" (`Reports.jsx:348-391, 436, 504, 535, 572`).
    - "AVG / DAY" (caps).
    - Day ribbon "Sat OCT 10".
    - Legend "GOAL: Under On Target Slightly Over Over".
  - **Wizard:** step labels "Your Approach / Your Profile / Set Your Goal / Your Calorie Plan" (`AIGoalPlanner.jsx:442`), which also wrap one word per line on a phone (17). Plus "Your Personalized Calorie Plan", "Your Metabolism", "Your Deficit", "Daily Calorie Deficit", "Safety Check", "Plan Type", "Daily Target".
  - **Copy meal** (04): "Food Log / Copy Meal", "Quick Copy", "Copy Entire Day", "Copy From", "Copy To", "Will copy: All Meals from 2026-10-15".
  - **Profile and Household:** "Household Sharing", "Household Name", "Household Code", "Your Sharing Preferences", "Household Members", "Leave Household", "Change Password", "Edit Profile", "First Name", "Last Name", "Save Changes".
  - **Settings:** "Weight Units", "Height Units", "Garmin Integration", "Enable Garmin", "Garmin Email", "Save Changes".
  - **My foods / My meals:** "Saved Foods 5", eyebrow "My Foods", "My Meals", "Saved Meals".
  - **Edit log / Save meal:** "Save Changes", "Save Meal". **MealSection:** "Add Food".
  - **Medications** (`Medications.jsx:525, 640, 646, 710-711`): "Search Medications", "My Medications", "Grouped by Time of Day", "Suggested indications (editable)".
  - **Activity:** "Today's Summary", "Active Calories", "Sleep Details", "Health Metrics", "Recent Activities".
  - **Health dashboard:** everything.

**V-3. Doubled headings ("eyebrow + title") inside cards.** Inconsistent · both · S
- The plan retired page-level triplication; card-level pairs survived:
  - "Weight trend / **Your curve**"
  - "Body composition / **What it's made of**"
  - "Body & recovery · 90-day trends / **How your body is trending**"
  - "Meal Breakdown / By Time of Day", "Goal Compliance / On-Target Days", "AI Coach / Weekly Summary"
  - Dialog eyebrows: "Tracking / Log weight" (06), "Account / Edit Profile" (10), "Food Log / Copy Meal" (04), "My Foods / Edit Turkey chili" (27).
- **Fix:**
  - One heading per card, saying what it answers: "Your weight trend", "What your weight is made of", "Body and recovery, last 90 days", "Calories by meal", "Days on target".
  - A dialog eyebrow is allowed only when it carries **context**: the date (Edit weight already does "Fri, Oct 16, 2026", which is right) or the meal.

### 2.2 Labels and verbs for the same act

**C-1. Putting food on a meal.**
- **Currently:** "Log it" (composer), "+ Add" (rows, meal cards), "Add Food" (Log empty state), "Make it 2", "Log this instead" (Fix), "Done ✓".
- **Verdict:** mostly fine. "Log it" is the composer's single primary verb, and it was chosen on purpose in REVIEW §4; keep it.
- **Fix:** "Add Food" → "+ Add" (`MealSection.jsx:283`). Everything else stays.

**C-2. Recording a check-in.** Inconsistent · H · S
- **Currently:**
  - Weight: FAB "Log weight", dialog "Tracking / Log weight", Today strip "Weigh in".
  - BP: FAB "**Add BP**", dialog "**Add Reading**", Today strip "Add BP", More "Log a reading".
- **Fix:** check-ins use **Log**:
  - FAB "Log BP".
  - Dialog title "Log blood pressure" (edit: "Edit blood pressure").
  - Today strip "Log BP".
  - "Weigh in" stays: it's the friendlier word, and it means the same.
  - Primary button in every check-in dialog: **Save**, at the bottom (BP's Save is still top-right, per REVIEW §4).

**C-3. Saving an edit.** Inconsistent · both · S
- **Currently:** "Save Changes" (Edit log `EditLogDialog.jsx:170`, Settings `:488`, Profile `:336`), "Save Meal", "Save recipe", "Save", "Copy Meal".
- **Fix:**
  - Edits say **Save**.
  - Creates name the thing: "Save meal", "Save recipe", "Copy".
  - Busy states use the ellipsis character: "Saving…". `SaveMealDialog.jsx:121` and `EditLogDialog.jsx:170` use "Saving...".

**C-4. Taking something away.** Inconsistent · both · S
- **Currently:**
  - Food from Home: "Removed X".
  - Food from Log: "**Deleted** X" (`FoodLog.jsx:410`).
  - BP: "Removed … / **Put back.**" (`BloodPressure.jsx:292, 314`).
  - Meds: "Removed … / **X is back**" (`Medications.jsx:450`).
  - Food undo: "**Undone ✓**".
  - My meals: "Delete this meal?"
- **Fix:**
  - **Remove** for anything with Undo. Toast "Removed X" with **Undo**; after undo, "Undone ✓"; on failure, "Couldn't undo — try again".
  - **Delete** only for things with no undo and a confirm (a custom food, a saved meal, the household).

**C-5. Meal names.** Inconsistent · both · S
- "**Snacks**" on the meal cards and chips (`plainWords.js:10`), but "**Snack**" in:
  - Edit log (`EditLogDialog.jsx:154`);
  - Save meal (`SaveMealDialog.jsx:104`);
  - Edit meal (`EditMealDialog.jsx:90`);
  - `fitnessGeekService.js:434`;
  - Reports' meal breakdown (it capitalises the key `snack`, 07r-desktop).
- **Fix:** take the label from `mealLabel()` everywhere: "Snacks" as a name, "a snack" in sentences.

### 2.3 Toasts and errors

**T-1. Error grammar has three dialects.** Inconsistent · both · S
- **Good, newest:** "Couldn't remove that. Try again." / "That didn't go through. Tap Log it to try again." / "No signal — I can't log this yet. Your words are saved here."
- **Mixed:** "Could not log that. Try again." (`FoodComposer.jsx:259`), "Could not update that.", "Could not create that food.", "Could not read that ingredient list."
- **Old:** "Failed to load household settings", "Failed to copy meal", "Failed to update profile", "Failed to load meals", "Failed to lookup barcode.", "Error saving meal. Please try again.", "Please enter your display name", "Sorry, I encountered an error. Please try again." (AI chat).
- **Raw passthroughs that bypass `errorMessage()`:**
  - `Profile.jsx:95` (`error.message`)
  - `AIInsightsCard.jsx:93`
  - `Activity.jsx:404`
  - `BarcodeScanner.jsx:346`
  - `InfluxDBSettings.jsx:141, 165` (`err.response?.data?.error`)
- **Fix:**
  - Pattern: **"Couldn't <verb> <thing>. Try again."**
  - Route every one through `errorMessage()`.
  - Replacements:
    - "Failed to lookup barcode." → "Couldn't look up that barcode. Try again, or type the food."
    - "Please enter the household code" → "Enter the code from your family member's phone."
    - AI chat → "I couldn't answer that just now. Try again."

**T-2. Success grammar.** Inconsistent · both · S
- **Currently:**
  - "Profile updated successfully!" (×2), "Meal copied successfully!", "Meal saved successfully!", "Health baselines updated successfully!", "Successfully left household".
  - "Calorie goal saved. Tracking started!", "Keto goal saved. Tracking started!".
  - Periods sometimes ("Blood pressure saved.") and sometimes not ("Settings saved").
- **Fix:** past tense, no "successfully", no "!", no period, ✓ only on the add/undo family. Replacements:
  - "Saved", "Profile saved", "Meal copied to today's lunch", "You left the household".
  - "Your target is now 1,599 calories a day".

### 2.4 Units, numbers and dates

**U-1. Calories: four spellings.** Inconsistent · both · S–M
- **"cal"**: Home meal cards, Log, composer, Fix sheet (good).
- **"calories"**: sentences ("You have 660 calories left today", good).
- **"kcal"**:
  - Reports tiles, day ribbon and meal breakdown;
  - My foods rows;
  - the recipe builder;
  - BMR (scale) on body comp;
  - the wizard's provenance table;
  - "Calorie Goal Today";
  - ModeSelector "~2,100 kcal / day";
  - the PlanAccuracyBanner;
  - 19 files in total (grep).
- **"calories/day"**: the wizard.
- **Fix:** "cal" next to a number and "calories" in a sentence, never "kcal". The CSV export can keep `kcal` in the column header.

**U-2. Weight: "lbs" and "lb" on the same page.** Inconsistent · both · S
- **"lbs"**: the weight goal card, weight log, edit dialog ("Weight (lbs)" label **and** a "lbs" adornment, 05e and 06), the wizard chips ("23.7 lbs to lose").
- **"lb"**: body composition, the Change card, Reports, the Home stat, "1 lb/week".
- **Fix:**
  - "lb" everywhere, singular and plural (US style).
  - Label the field "Weight" with an "lb" adornment.
  - Settings option "Pounds (lb)".

**U-3. Thousands separators.** Inconsistent · both · S
- Missing: "1680 cal" (Log, `CalorieSummary.jsx:141` area), "1760" / "1980 kcal" (Reports), "1749 kcal" (body comp), "1749 calories/day", "Daily Target: 1599 calories" (wizard, next to "1,599 kcal" in the same card), "9394 / day" (steps), "1361 kcal" (recipe).
- **Fix:** always `toLocaleString('en-US')` at 1,000 and above. `plainWords.fmt` already does this, so reuse it.

**U-4. Macros: five formats.** Inconsistent · C · S
- "18P/8C/10F" (My foods), "18P / 8C / 10F" and "0.3P / 5.5C / 0.1F" (Log rows, 32a), "P 0g · C 0g · F 0g" (recipe), "Protein 141g · Fat 78g · Carbs 83g" (wizard, in P-F-C order), "113 of 156 g" (Home), "5 entries · 0g P" (Reports), "Protein (g)" (Reports tile).
- **Fix:**
  - **Full rows:** "P 18 · C 8 · F 10 g" (whole grams, "<1" for tiny amounts).
  - **Elsewhere:** "Protein 18g · Carbs 8g · Fat 10g", always in that order.
  - **Unknown:** "—", never 0. The recipe builder showing "P 0g · C 0g · F 0g" reads as a real zero (27).

**U-5. Dates: nine formats.** Inconsistent · both · S
| Seen | Where |
|---|---|
| "Friday, October 16" | Home (good, from `friendlyDay`) |
| "Today" / "Yesterday" | Log (good) |
| "Fri, Oct 16, 2026" | Edit weight eyebrow |
| "Oct 13, 2026" | Weight log rows: the year shown even in the current year |
| "Dec 01", "Jul 01" | Time remaining, chart ticks: zero-padded |
| "February 27, 2027" | Projection |
| "2026-10-10 → 2026-10-16" | Reports day ribbon (ISO) |
| "Will copy … 2026-10-15" | Copy meal preview (ISO) |
| "10/16/2026" | Native date inputs (OS-controlled, acceptable) |
| "vs the week to Sep 16" / "vs Sep 15–21" | Reports cards |
- **Fix:**
  - Words for near days ("Today", "Yesterday", "Thursday").
  - Otherwise "Oct 13", with the year only when it isn't this year. No zero padding. Never ISO.
  - Ranges as "Oct 10–16".

**U-6. Apostrophes and ellipses.** Polish · S
- Mixed curly and straight: "you’d" vs "didn't" (34), "What's your goal?" (20a), "Today's meals".
- Mixed "..." and "…".
- **Fix:** curly ’ and … in UI strings. Do it as a single lint pass.

### 2.5 Jargon a non-technical person won't know

Where Heather can see it today:
- **"Set your daily target"**, leading to BMR, TDEE, Katch-McArdle, Mifflin-St Jeor, deficit, Weekender and keto (IA-1).
- **Weight goal card**: "Projected Completion", "88 days behind" (05). Simple also shows this card.
- **Medications**: "Suggested indications (editable)", "Rx (Prescription)", "OTC (Over-the-counter)".
- **BP**: "Stage 1" (07-desktop legend), "mmHg".

Full only (Chef knows these, but see the glossary for the first-mention forms):
- "Visceral fat index 12.0" with no range or meaning.
- "Lean mass" vs "Skeletal muscle" side by side.
- "Overnight HRV".
- "VO2 max", and "Achievable: 39".
- "Intensity minutes (the WHO equivalence)".
- "Goal Compliance".
- "Trend Highlights: No significant trends detected yet." ("significant" is statistics talk.)
- "InfluxDB".

**Fix:** use the glossary (§4). The first mention gets the plain form with the term in parentheses; later mentions can use the short term. Two specifics:
- Meds: "What it's for" instead of "indications"; "Prescription / Over the counter / Supplement" in the select.
- Visceral fat: "Belly fat score (visceral fat)", with a one-line note: "Your scale's own scale; lower is better."

### 2.6 Empty states

| Where | Now | Proposed |
|---|---|---|
| Log meal (MealSection:262) | "No foods logged yet" + "Add Food" | "Nothing yet" + "+ Add" (same as Home) |
| Home weight stat | "No weigh-ins yet" | keep |
| Reports AI | "No AI summary available for this range yet." / "Trend summary will appear once enough data is logged." | "Log a few days and I'll write a summary here." (one sentence, both panels) |
| Reports trends | "No significant trends detected yet." | "Nothing stands out yet." |
| My foods | "…we'll remember it." | V-1 replacement |
| Reports, no Influx (18) | "…once the Health Dashboard connection is on." + "Health Dashboard" button | "Heart rate, sleep and activity trends show here once Garmin is connected." + **Connect Garmin** (goes to Settings → Garmin) |
| Health dashboard | "InfluxDB Integration Required…" | see IA-4 |

### 2.7 Other copy notes

- **Copy meal** (04): the quick chips "Dinner → Tomorrow's Lunch" default to tomorrow (REVIEW B10 fixed the main default, but the chip remains). The "From" dropdown has no label.
  - Chips: "Yesterday's dinner → today's dinner", "Yesterday's lunch → today's lunch", "All of yesterday → today".
  - Label the dropdown "Whose log".
  - Preview: "Copies Thursday's dinner (3 foods) to today's lunch." Button: **Copy**.
- **Weight page intro**: Full says "averaged so one **water day** doesn't move the needle"; Simple says "one **heavy day**". Keep both. They're good, and each fits its reader.
- **Edit weight** (05e): "This weight came from the scale. If you import an export that includes this day again, the scale's value replaces your edit." Good and honest; trim to "This came from the scale. A later scale import for this day will replace your edit."
- **Settings experience card**: "How FitnessGeek looks" → "**How much FitnessGeek shows**". Simple/Full is about content, not looks.
- **Profile**: "Preferences — Theme, units, **notifications**, and Garmin integration" names a removed feature. It goes away with IA-2. Until then, drop "notifications".
- **Banner pair** (01, 14): one is a primary button with no dismiss; the other is outlined with an unlabelled ✕. Give both the same shape: an outlined "Review my plan" and a "Not now" text button.
- **My foods rows** (26): "**Unknown**" (an unknown source) is printed in bold on four of five rows. Hide unknown sources.
- **Fitness age** (07t, 07u): "Achievable: 39" → "Garmin thinks you could reach 39". Keep "It moves over months, not weeks." (good).

---

## 3. Data presentation (Full)

**D-1. BP headline reports the last reading, not the state.** Confusing · C · S
- **Evidence:**
  - 07: "Blood Pressure Insights 118/74 mmHg ✓ **Normal**".
  - The 7-day average below is 126/79, which is Elevated by the app's own Reports ("The 7-day average is in the Elevated range", 07r).
  - "Healthy Range **7%** of 14 readings" sits in a pink tile.
  - The donut shows Normal 1 / Elevated 7 / Stage 1 6 (07-desktop).
  - One good morning reading paints the page green.
  - The range toggle (7d/30d/1y/All) sits *below* the donut, so the donut's window isn't stated.
- **Fix:**
  - Headline: "**Your average this week: 126/79 — a little high (elevated)**".
  - Secondary line: "Last reading 118/74 · normal · today 7:42".
  - "Healthy range: 1 of 14 readings" (a count beats "7%").
  - Move the range toggle above the donut, and title the donut "Readings by range, last 30 days".
  - Legend: "Normal · A little high · High (stage 1)".

**D-2. The weight goal card contradicts itself.** Confusing · C, H · S
- **Evidence (05):**
  - "Current Rate 1.3 lbs/week · Goal: 1.0 lbs/week".
  - A red "**88 days behind**" with a down-right arrow.
  - "Projected Completion February 27, 2027" in a pink tile.
  - The chart's goal line runs 232 → 195 from Jun 18 to Dec 1, which needs about **1.5 lb/week**.
  - `WeightProgress.jsx:358` prints `goal.ratePerWeek` (the stored 1.0), not the pace the dates require. So the user is "faster than goal" and "behind" at once.
  - Red contradicts the plan's "nothing turns red".
- **Fix:**
  - "You're losing **1.3 lb a week**. To reach 195 by Dec 1 you'd need **1.5**."
  - Projection: "At this pace: **late February**. That's about 3 months after your goal date."
  - Chip: "Behind plan" in lemon or plum, not red.
  - "32.7% Complete" → "**12.1 of 37 lb lost**", with the bar unchanged.

**D-3. Two bases for "how much is left".** Inconsistent · C, H · S
- **Evidence:**
  - Weight goal card: "24.9 lbs to go", from the 7-day average of 219.9.
  - Wizard: "23.7 lbs to lose", from the latest weigh-in of 218.7.
  - The weight log's top row says "218.7 lbs Today".
  - Neither card says which basis it uses.
  - Reports' and Home's weight both say "7-day average", which is good.
- **Fix:**
  - One basis app-wide: the 7-day average, which the weight page's own intro promises.
  - Goal card caption: "From your 7-day average, 219.9 lb".
  - The wizard uses the same number.

**D-4. Weight and body-comp charts.** Inconsistent · C · S
- **Evidence:**
  - 05a: the tooltip is clipped off the left edge; the y-axis has no unit; the legend is in caps.
  - 05c: on a phone the body-comp tooltip wraps one word per line ("Sep / 24 / 7- / day / avg / 80.0 / lb …").
  - The lean-mass axis spans 138–144 lb and the fat axis 76–82. At those spans, normal ±1 lb scale noise looks like cliffs.
- **Fix:**
  - Tooltip: `min-width` and edge-flip.
  - y-axis caption "lb".
  - Minimum axis span of about 10 lb for the mass charts, so the scale reflects the body, not the noise.
  - Keep "Line: 7-day average · dots: each scan". It's the clearest chart caption in the app.

**D-5. Reports: what the range toggle governs, and in what order.** Confusing · C · M
- **Evidence:**
  - The intro says "Deep dive into your food logs, macro patterns, and AI insights for the past 7 days" (`Reports.jsx:236`).
  - The first section under the toggle is "Body & recovery · **90-day** trends", which apologises: "The range toggle above applies to the food report only."
  - The AI panels sit at the very bottom.
- **Fix:**
  - Order: **Food (with the 7/14/30 toggle in its own header) → AI notes for that range → Body and recovery (90 days, its own label)**.
  - Intro: "How your eating went, and how your body is trending."
  - Delete the apology sentence.

**D-6. Reports: comparison windows differ per card.** Inconsistent · C · S
- **Evidence:** "vs Sep 15–21" (resting HR, HRV), "vs Sep 10–16" (intensity minutes, steps), "vs the week to Sep 16" (weight), "vs Sep 16–22" (body comp), all in one section (07s–07u).
- **Fix:**
  - State the window once at the section top: "Each number is a 7-day average, compared with the same week a month ago (Sep 10–16)."
  - Each card then says "−1 bpm" with no date.
  - Where a source forces a different window (body comp needs 14 days), the card says so.

**D-7. Intensity minutes are a sum labelled as an average.** Confusing · C · S
- **Evidence:** "279 **min / week** · 7-day average" (07t).
- **Fix:** "279 min in the last 7 days", with the guideline line kept.

**D-8. Reports day ribbon.** Confusing · C · S
- **Evidence (07r-desktop):**
  - "Daily Totals 5", with the count jammed onto the title.
  - "2026-10-10 → 2026-10-16".
  - Tiny P/C/F/Fi bars with no scale, all near the same height, which convey nothing.
  - A four-colour compliance legend (blue/green/orange/**red**) that isn't the Market Morning palette.
  - Phone tooltip "Oct 16: 1805 kcal (slightly over)".
- **Fix:**
  - Title: "Each day (5 logged)".
  - Range: "Oct 10–16".
  - Replace the bars with a text line "P 165 · C 141 · F 70 g".
  - Colour only "over" days, with the plate's plum edge; the label carries meaning: "On target" / "A bit over" / "Over" / "Under".

**D-9. Reports meal breakdown and top foods don't say total or per day.** Confusing · C · S
- **Evidence:**
  - "Breakfast 420 kcal · 5 entries · 0g P".
  - "Greek yogurt, plain 650 kcal · 5 entries" (total over the range?).
  - "0g P" on all four meals while the protein average is 162 g. The backend computes per-meal protein (`foodReportService.js:152-163`), so this is probably harness-fixture data. Verify against real data before acting on it.
- **Fix:**
  - Title "Calories by meal, average per day".
  - Rows: "Breakfast · 420 cal a day · protein 32g".
  - Top foods: "650 cal over 7 days · 5 times".

**D-10. Reports tiles.** Polish · C · S
- **Evidence:** "AVG / DAY" in tracked caps under every tile; "Calories 1760" (no unit, no comma); "Protein (g)" puts the unit in the label.
- **Fix:**
  - Label "Calories", value "1,760", caption "a day".
  - "Protein 162g a day".
  - Keep "Averages cover the 5 of 7 days you logged." It's honest and plain.

**D-11. AI-written panels don't say what they're based on.** Confusing (trust) · C · S
- **Evidence:**
  - Home: "AI Insights" with tabs Morning Brief / Daily Summary / Coach / Trends / Ask AI.
  - Reports: "AI Coach / Weekly Summary" (titled "Weekly" even at 30d) and "AI Insight / Trend Watch".
  - Health dashboard: "Recovery Coach" / "AI Recovery Coach".
  - That's four "coach" names, and no panel states its source, its time, or that it can be wrong.
- **Fix:**
  - One name, "**Notes from the AI**".
  - Each panel ends with a one-line footer: "Written by AI from your last 7 days of logs · 9:40 am · It can be wrong — check the numbers above."
  - Title by range: "This week" / "Last 14 days" / "Last 30 days".
  - Where a panel quotes a number, it should match one on the screen. That check belongs to aiGeek prompt work, not the UI.

**D-12. Wizard result colours and numbers.** Polish · C · S
- **Evidence (16, 17):**
  - "Daily Calorie Deficit **500 calories/day**" in red (it's the plan, not a problem).
  - "Safe" in green.
  - "1749 calories/day" and "1,749" on adjacent screens.
  - "Your saved plan → this plan" table says "1,950 → 1,599 kcal", next to "Daily Target: 1599 calories".
- **Fix:**
  - Neutral ink for the deficit.
  - One unit (cal) with commas.
  - "Daily Target" → "Your daily target: 1,599 calories".

**D-13. The target number may disagree across screens.** Plausible, needs a check · C · S to verify
- **Evidence:**
  - Home / Log: "2,340 = 2,100 + 240 for activity" (01, 02).
  - Wizard: "Your saved plan: daily target **1,950**" (17).
  - Scan banner: "your plan uses 1,980", which is BMR, so that one is consistent.
- **Diagnosis:** if 2,100 is the nutrition-goal store and 1,950 is the plan's target, Chef sees two "daily targets". This is probably fixture data, but it is exactly the goal-store split class (memory: FitnessGeek accuracy sweep).
- **Check:** confirm against Chef's real settings.

**D-14. Home (Full) density.** Polish · C · S
- **Evidence:**
  - The plate says "660 left", the headline says "You have 660 calories left today", and the detail says "1,680 eaten of 2,340". That's the same fact three times.
  - The fat bar is full and tomato at "99 of 78 g" with no words. The colour alone carries "over", and tomato is also Breakfast's colour.
- **Fix:**
  - On Full, the plate centre shows "72%" or nothing, since the sentence already says the number. Simple already drops it.
  - Over-target macros get words: "Fat 99 of 78g · 21 over".

**D-15. SpO2 is already on screen.** Chef's call · C
- **Evidence:**
  - Activity → Health Metrics "Avg SpO₂ · Low: x%" (`Activity.jsx:640-647`).
  - Health dashboard → Sleep Analysis: Avg / Min SpO2 tinted warning/error, an "SpO2 dips" tile, and an Alert "Blood oxygen dipped below 90%… Sleep apnea screening with a healthcare provider" (`SleepAnalysis.jsx:559-593`).
  - Settings: the "Sleep apnea screening suggestion" health alert (`Settings.jsx:400`).
- **Note:** this review proposes nothing new here. It flags that these existing surfaces sit against the stated stance (PCP reviewed; Garmin SpO2 judged noisy). Removing them, or defaulting the alert off, is Chef's decision.

**D-16. Does each screen answer a question?**
| Screen | Question it answers | Verdict |
|---|---|---|
| Home | How much can I still eat today? | Yes, in one sentence. Keep |
| Log | What did I eat on this day? | Yes. The calorie card duplicates Home; fine |
| Weight | Am I getting there? | Answers it twice, and contradicts itself (D-2, D-3) |
| Body composition | Am I losing fat, not muscle? | **Yes.** "Of the 2.9 lb you've lost, about 2.2 lb was fat and 0.6 lb lean" is the best sentence in the app. Keep |
| BP | Is my blood pressure OK? | Answers with the wrong number (D-1) |
| Reports | How did the week go? | Three questions in one page (D-5) |
| Wizard | What should my target be? | Yes for Chef; not for Heather (IA-1) |
| Activity / Health dashboard | ? | Overlapping, unaudited (IA-4) |

---

## 4. Copy style sheet (proposed)

Built from what the app already does best: `utils/plainWords.js`, the composer, and the body-comp "Change" card.

1. **Say it as a sentence when there's one thing to say.** "You have 660 calories left today", not a label and a number. Labels are for grids of several numbers.
2. **Sentence case everywhere.** No Title Case, no ALL CAPS, no tracked eyebrows. Proper nouns only: Garmin, FitnessGeek.
3. **One heading per card**, saying what the card answers. An eyebrow is allowed only for context (a date, a meal).
4. **Pronouns:** "I" when the app does thinking for you (working out calories, keeping count, hearing you); "you" for everything else; never "we". System and permission messages name FitnessGeek.
5. **Verbs:**
   - **Add** puts food on a meal. The composer's **Log it** is the one exception.
   - **Log** records a check-in (weight, BP).
   - **Save** commits an edit.
   - **Remove** takes something away with Undo; **Delete** is permanent and asks first.
   - Never use Submit, Save Changes, or Update as a button.
6. **Toasts:** past tense plus what plus where. "Added to lunch ✓ · Greek yogurt", "Removed Greek yogurt" [Undo], "Undone ✓". No "successfully", no "!", no trailing period.
7. **Errors:** "Couldn't <verb> <thing>. Try again." Then one hint when it helps ("No signal — your words are saved here."). Never raw server text, never "Failed to", never "Please".
8. **Numbers:**
   - Commas at 1,000 and above.
   - Calories and grams as whole numbers.
   - Weight and body comp to 1 decimal.
   - Percentages as whole numbers, or better, counts ("1 of 14 readings").
   - Unknown is "—", never 0.
9. **Units:**
   - "cal" next to a number and "calories" in a sentence. Never kcal.
   - "lb" (never lbs).
   - Grams written "18g".
   - Food amounts in US units (oz, cup, fl oz); macros stay in grams.
   - Rates as "1.3 lb a week" in sentences and "lb/week" in dense rows.
10. **Dates:**
    - "Today" / "Yesterday" / "Thursday" for the last week.
    - "Oct 13" otherwise, with the year only when it isn't this year.
    - Ranges as "Oct 10–16". No zero padding, no ISO.
11. **Jargon:** the plain words first, the term in parentheses on first mention (glossary below). Formula names (Katch-McArdle, Mifflin-St Jeor) live only behind "How this was worked out".
12. **No colour without words.** Over and behind are said in text. Red is for errors only, never for a plan, a deficit, or a slow week.
13. **Typography:** curly apostrophes (’), a real ellipsis (…), and an en dash (–) in ranges.

### Glossary

| Prefer | Not | Notes |
|---|---|---|
| **cal** (with a number), **calories** (in a sentence) | kcal, Cal, calories/day | CSV header can keep kcal |
| **target**: the daily calorie number | goal, Daily Target, Calorie Goal Today | "Today's target" for the one-day override |
| **plan**: what the wizard makes | calorie plan / personalized plan / program | Nav row "Calorie plan" is fine |
| **goal**: the weight you're aiming for | target weight, Active Weight Goal | "Change goal" |
| **Snacks**: the meal | Snack | "a snack" in a sentence |
| **meds** (short labels), **medications** (titles) | medicine, Medications page "My Medications" | |
| **lb** | lbs | |
| **weigh-in** | reading (for weight), entry | "reading" is for BP |
| **reading**: one BP measurement | entry | |
| **7-day average** | 7-day avg, trend (as a number) | "avg" only in tight tooltips |
| **protein, carbs and fat** | macros | Full can say "macros" in a heading if needed |
| **net carbs (carbs minus fiber)** | net carbs (first mention) | Keto only |
| **calories at rest (BMR)** | Basal Metabolic Rate | |
| **calories you burn in a day (TDEE)** | Total Daily Energy Expenditure | |
| **under your daily burn** | deficit | "500 under your daily burn" |
| **extra for today's activity** | eat-back, activity calories, (2100 +240) | Already right on Log |
| **what your weight is made of** | body comp, body composition (in Simple) | Full heading may keep "Body composition" |
| **lean mass (everything that isn't fat)** | LBM | First mention only |
| **belly fat score (visceral fat)** | Visceral fat index | Add "lower is better" |
| **heart-rate variability (HRV)** | HRV (first mention) | "Higher usually means better recovered": keep |
| **fitness level (VO2 max)** | VO2 max | |
| **a little high (elevated)** / **high (stage 1)** | Elevated, Stage 1 | BP |
| **days on target** | compliance, On-Target Days | |
| **weekend boost (more on Fri and Sat)** | Weekender | |
| **what it's for** | indications | Meds |
| **Remove** / **Undo** / **Undone ✓** | Delete (with undo), Put back, is back | |
| **Couldn't…** | Could not, Failed to, Error | |

---

## 5. Findings index, with sizes

| ID | Sev | Who | Size | One-line fix |
|---|---|---|---|---|
| IA-1 | Confusing | H | M | Simple opens a one-screen quick target; BMR etc. behind "How this was worked out" |
| IA-2 | Confusing | H, C | M | Fold Profile into Settings; editable name and goal; one Household |
| IA-3 | Inconsistent | H, C | S–M | Every setting saves on change; drop the sticky bar |
| IA-4 | Inconsistent | C | M (L) | One Garmin page with Today / Last night / Trends; InfluxDB into Settings |
| IA-5 | Polish | C | S | "Add a scan" button on Weight's body section |
| IA-6 | Inconsistent | C | S (M) | Same remove/empty/add words on Log as Home; drop emoji; label the save icon |
| IA-7 | Confusing | C, H | S | "Review my plan" / "Today's target" / "Change goal" |
| IA-8 | Polish | H | S | Home tab's title "Home" |
| IA-9 | Polish | H | S | Order Simple's Everything else; say what each needs |
| IA-10 | Polish | — | S | Delete orphans; add harness scenes for 8 unaudited screens |
| V-1 | Inconsistent | both | S | "I" / "you", never "we" |
| V-2 | Inconsistent | both | M | Sentence case sweep (list in §2.1) |
| V-3 | Inconsistent | both | S | One heading per card; eyebrows only for context |
| C-2 | Inconsistent | H | S | "Log BP" / "Log blood pressure"; Save at bottom |
| C-3 | Inconsistent | both | S | "Save"; "Saving…" |
| C-4 | Inconsistent | both | S | Remove + Undo + Undone ✓ everywhere |
| C-5 | Inconsistent | both | S | Snacks from `mealLabel()` |
| T-1 | Inconsistent | both | S | "Couldn't …. Try again." via `errorMessage()`; 6 raw passthroughs |
| T-2 | Inconsistent | both | S | No "successfully!" |
| U-1…U-6 | Inconsistent | both | S each | cal, lb, commas, macro format, dates, typography |
| D-1 | Confusing | C | S | BP headline = 7-day average category |
| D-2 | Confusing | C, H | S | Needed pace vs actual pace; no red |
| D-3 | Inconsistent | C, H | S | One basis (7-day avg), stated |
| D-4 | Inconsistent | C | S | Tooltip, y-unit, minimum axis span |
| D-5 | Confusing | C | M | Reports reorder; toggle inside Food |
| D-6 | Inconsistent | C | S | One comparison window stated once |
| D-7 | Confusing | C | S | "279 min in the last 7 days" |
| D-8 | Confusing | C | S | Day ribbon: text macros, word legend, plum for over |
| D-9 | Confusing | C | S | "a day" / "over 7 days" on meal and top-food rows (verify 0g P) |
| D-10 | Polish | C | S | Tile captions; commas |
| D-11 | Confusing | C | S | One AI name; source, time and caveat footer |
| D-12 | Polish | C | S | Neutral deficit; commas; one unit |
| D-13 | Plausible | C | S | Verify the 2,100 vs 1,950 target on real data |
| D-14 | Polish | C | S | Full plate centre; words for over-macros |
| D-15 | Chef's call | C | — | Existing SpO2 surfaces vs the stated stance |

**Suggested order:** the copy sweep is cheap and almost all S. Ship it as one revertable commit
(V-2, C-*, T-*, U-*), then do the rest in this order:
1. D-1, D-2, D-3 (honesty, S each).
2. IA-1 (Heather's dead end, M).
3. IA-2 and IA-3 (Settings, M).
4. Reports (D-5 to D-11).
5. IA-4 last.

---

## 6. Keep

- **`plainWords.js`**: `caloriesSentence`, `friendlyDay`, `addedMessage`. Make it the single source for meal names, numbers and dates (see the style sheet).
- **The Home sentence**, "You have 660 calories left today", and the plate drawn in meal colours, with no number in Simple.
- **The composer's voice**:
  - "Tell me what you ate".
  - "Say it like you'd tell a friend. I'll work out the calories."
  - "I'll work out the calories. You can fix anything after."
  - "That didn't go through. Tap Log it to try again."
  - "No signal — I can't log this yet. Your words are saved here."
  - "Log this to yesterday? [Yes] [No, today]".
  - "Make it 2".
  - The Fix sheet's "About right / Smaller · ~150 / Bigger · ~300 / It was actually…".
  - "Or pick an exact food (3)".
- **The result card**: "Added to lunch ✓ · Fix · Undo all · Done ✓". And the "Just added" strip.
- **Simple Home**: "What did you eat?", "Weigh in +", "Add BP +" (but see C-2), "Meds 1 of 3", "Did you take your meds?", "Nothing yet".
- **The first run**: "Nice to meet you, Chef. What's your goal?", with three plain choices and their one-line meanings.
- **Body composition**:
  - "Of the 2.9 lb you've lost, about 2.2 lb was fat and 0.6 lb lean."
  - "Your first comparison appears around Oct 28. It compares one week's average with one … weeks later — close enough together that…"
  - "Average of 14 scans · Oct 3–16 · latest scan Oct 16".
  - "Line: 7-day average · dots: each scan".
- **Weight page intros** ("one water day / one heavy day doesn't move the needle") and the edit-weight provenance note.
- **Reports honesty lines**:
  - "Averages cover the 5 of 7 days you logged."
  - "Lower is better. It tends to fall over weeks as fitness improves."
  - "Higher usually means better recovered. Compare it with your own, not anyone else's."
  - "Body Battery is Garmin's 0–100 energy estimate…"
  - "It moves over months, not weeks."
- **BP field labels**: "Top number (systolic)" / "Bottom number (diastolic)".
- **More's row grammar**: a big label plus a one-line plain description ("Meals you saved to log in one tap", "Simple or Full, larger text, and more").
- **The Settings experience card**: Simple and Full described by what you get; "Larger text — Makes every word in the app bigger."
- **The four-tab bottom bar, Market Morning, and Larger text.**
