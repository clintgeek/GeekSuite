# FitnessGeek: learnability review, 2026-10-16 (evening)

**Question:** could someone use it without instruction?
**Primary user:** Heather. Simple mode, installed PWA on Android, non-technical, uses it daily.
**Secondary user:** Chef, in Full mode.
**Scope:** learnability, discoverability, task flow, feedback, error recovery and mental models. Colour, type, spacing, navigation, copy and charts belong to the other two reviewers; I mention them only where they block or mislead.

**Evidence:**
- Today's harness PNGs in `tools/mobile-harness/out/ci/fitnessgeek/`, phone-light first.
- Code read under `apps/fitnessgeek/frontend/src`, plus the gateway and parser where the behaviour depends on them.
- Everything in REVIEW_2026-10 §5 is treated as shipped. Items that are now fixed are not reported again.

Severity scale:
- **Blocks task:** she can't finish without help.
- **Wrong data likely:** the UI leads her into a wrong log.
- **Slows:** she gets there, with hesitation or a detour.
- **Polish.**

Fix sizes: S is under half a day, M is about a day, L is several days.

---

## Verdict in one paragraph

The food box is now learnable.
- "What did you eat?" leads to a sentence, then Log it, then a result card with Fix and Undo all. A first-timer can do all of that without help. It is the best part of the app, so keep it exactly as it is.
- The remaining risk has moved to the edges around the box:
  - Quantity: what "Make it 2" does after her habitual second tap, and Home not showing amounts.
  - A Home screen that reads "Nothing logged yet" when it simply couldn't load.
  - A Copy Meal dialog that copies a whole day by default.
  - Screens that never got the Simple treatment: the Food Log rows, Edit Entry, Medications, Settings and the calorie plan.
- Most of these are S-sized.

---

## Task walkthroughs

### Heather: first launch, new account

1. **Step 1, "Welcome! What should we call you?"** The field is pre-filled with her account name (`20-first-run`), so she taps Next. Fine.
   - The bottom nav stays visible throughout, so she can leave the first run mid-way. That's harmless: it comes back until it's finished.
2. **Step 2, the goal** (`20a`). She picks "Lose a little weight", described as "See how much is left each day."
3. **Step 3, "Try logging your lunch"** (no scene; `FirstRun.jsx`). It says "Say it or type it — 'two eggs and toast' is enough", with "Add my lunch" and "Maybe later". This is good.
4. **Home after the first run.** There is no target yet, so the plate reads "Nothing logged yet today" with a **Set your daily target** button (`DashboardNew.jsx:452`).
   - That button opens the Full calorie wizard: Your Approach (standard vs keto), then Profile, BMR, TDEE and "Your Deficit" (`16-wizard-scan-source`).
   - **The step-2 promise ("see how much is left") is only kept if she gets through a nutrition-science form. That's finding L8.**

### Heather: log breakfast by typing a sentence

1. Home, then **What did you eat?**, which opens "Add to breakfast" at 8am (`21a`).
2. She types "two eggs and toast". The word "and" makes it a sentence, so the list folds into "Or pick an exact food (n)". Log it turns solid green (`28`).
3. She taps Log it. It shows "Working it out…" with a spinner, and after 8 s "Still working — this one's taking a moment." (`30`).
4. The result card says "✓ Added to breakfast", one row per food with calories and **Fix**, plus Undo all and Done ✓ (`31`).
5. She taps Done and Home refreshes. **Clean, with no instruction needed.**

### Heather: by voice

1. She taps the big mic. It shows "Listening… say what you ate" with the interim words and a Done button (`FoodComposer.jsx:654`).
2. When she stops talking it logs immediately. The Simple result card then says "I heard: '…'", and Undo all puts the words back in the box (`:498`). That's an acceptable recovery.
3. Offline, the mic stays enabled. The speech service fails and the app says "The microphone isn't working right now". **The real cause is the missing signal (L18).**

### Heather: pick a specific food, and log two of something

1. She types "egg". It isn't a sentence, so the list is open, and each row ends in a green "+ Add" pill and a sliders icon (`29`).
   - **Two equally loud green actions** compete: Log it and + Add. Either works (L20).
2. She taps the row (her habit, §2a). The row turns "Adding…" and then "Added ✓", and the pill becomes **Make it 2**.
3. **Her habit is to tap the row again.** That writes a second entry and resets the pill to "Make it 2".
   - She now has two eggs, and the screen invites her to make it 2.
   - Tapping it gives **three** eggs (L2).
4. Back on Home, the breakfast card shows "Egg" (or "Egg / Egg"), never "Egg ×2". The card can't confirm what she did (L4).
5. The sheet has no Done for a picking session. The only exit is the ✕ in the top-left, which to a non-technical user reads as cancel (L10).

### Heather: fix a wrong guess, undo a mistake

- **Straight after a describe:** Fix offers About right / Smaller · ~150 / Bigger · ~300, an editable Calories field and "It was actually…" (`31a`). Excellent.
- **Later:**
  1. Home card, then the Food Log (via the card's stretched link; nothing says the card is tappable). Then the pencil on the row, which opens **Edit Entry**.
  2. Simple shows one Calories field for the whole entry ("For this whole entry."), a servings slider, Day, Meal and Notes.
  3. **Save Changes sits in the top-right corner**, next to nothing she'd look at (L9).
- **Undo:** the toast's Undo lasts 10 s and turns into "Undone ✓" or "Couldn't undo — try again". Good.
  - In a picking session, the ribbon's red **Undo all** sits right next to **Undo last**, with no redo (L11).

### Heather: delete an entry from yesterday

Log, then ‹ to Yesterday, then the trash on the row. The toast says "Deleted Egg" with Undo for 10 s. Fine.
- The trash sits beside the star and the pencil on every row (L15). One tap is recoverable, so this only slows her down.

### Heather: log yesterday's forgotten dinner

1. **From Home:** she types "fried chicken and fries last night". The chip asks "Log this to yesterday? [Yes] [No, today]", and Log it is disabled until she answers (`35`).
   - "last night" sets the meal to dinner even when she opened the sheet from a lunchtime "What did you eat?" (parser `MEAL_FROM_PART`). Good.
   - **Edge:** with a comma ("fried chicken, fries last night") only the second segment moves to dinner. The chicken lands in yesterday's *lunch*, and the card header names a single meal (L6).
2. **From the Log page:** ‹ to Yesterday, then the meal's + opens a sheet titled **"Add to yesterday's dinner"** (`36`). Good.
   - The inline composer at the top of the page doesn't name the day. Only the date card above it does.

### Heather: move an entry to the right meal

Edit Entry, then the Meal select, then Save Changes (top-right, L9). The result card's Fix can't move the meal.

### Heather: weigh in

1. Home strip **Weigh in +** opens /weight?add=1, and the dialog opens straight away (`06`). There's a decimal keypad and "For example, 150.4". Save is at the bottom. Good.
2. If she weighs in again the same day, or backfills and forgets to change the date, the earlier weight is **silently replaced**, with "Weight saved." (L5).

### Heather: take two BP readings

1. **Add BP +** opens the dialog with "Top number (systolic)" and "Bottom number (diastolic)", and the save button at the bottom.
2. After save: the toast says "Blood pressure saved." The strip then reads "BP ✓", so the second reading needs the page's **+ Add BP** button.
3. Same-instant collisions now offer "Save it one minute later". Fine.
   - There is no "Save and add another", which the cuff instructions ask for. That's Polish.

### Heather: add a medication and tick it

1. Home ("Track your meds" when she has none), then the Medications page.
2. **First thing on the page:** Copy text / Download .txt / Download PDF, even with zero medicines.
3. Then "Search Medications". She must press Search (it isn't live). Results read "cholecalciferol 0.025 MG Oral Capsule · RxCUI 316965".
4. Picking one opens a form with Display name, Strength, Type (Rx/OTC/Supplement), Time of day (lower-case toggles), "Suggested indications (editable)", "Your indications" and "Add tag". Save sits at the end of the form.
5. "Add 'Vitamin D' as typed" exists, but only *after* a search.
6. Ticking works well once a medicine is in (`19a`).
7. **The add flow is the most clinical screen she will meet (L16).**

### Heather: "how am I doing?"

- Home answers today only ("You have 1,538 calories left today").
- Simple has no week view. Reports is Full-only.
- The Weight page is what she'd try next. It leads with goal maths and a red **"88 days behind"** chip (`05`).
- The BP page shows a "Normal" badge above a red "Healthy Range 7%" (`07`).
- Both send mixed signals to someone checking in (L25).

### Heather: change Larger text

More, then Settings ("Simple or Full, larger text, and more"), then the first card has the Larger text switch. It saves immediately. Easy (`25`).
- **The rest of the page** shows Household, Theme, Units and Garmin email/password, with three different save models (L17).
- One mis-tap on **Full** reshapes her whole app, and only a toast says so (L19).

### Heather: offline, or the server restarting

- **In the composer:** "No signal — I can't log this yet. Your words are saved here." Log it is off, and a bottom banner says "You're offline. New entries won't save until you're back online." (`33`).
  - The words survive only while the sheet stays open (L18).
- **During a restart:** "FitnessGeek is restarting. That didn't go through. Tap Log it to try again." Good.
- **On Home during a restart or a weak signal:** every request fails quietly. The page shows "Nothing logged yet today" with four "Nothing yet" cards and **no error**. That invites her to log breakfast a second time (L1).

### Chef: plan, reports, body comp, household, copy a meal to Heather

- **Plan wizard and reports:** dense but fine for Chef (`16`, `07r`).
- **Body composition:** lives on Weight in Full.
- **Household:** Log, then "What your household ate", then per-meal copy icons labelled **"Copy … to your log"**. It only pulls.
  - **Chef cannot put "the dinner we both ate" into Heather's log.**
  - Heather can only pull it through Copy Meal, whose "From" select shows blank for "My Log" and isn't explained (`04`).
  - Simple hides the household view (L7).
- **Copy Meal itself:** the default copies **all meals** (L3).
- **Full "Just added":** the undo toast covers the strip's Undo and Done for 10 s (`32`).
  - On Home the sheet closes without scrolling to the card, so the strip may be off-screen (L12).

---

## Findings

### Wrong data likely

**L1. Home says "Nothing logged yet today" when the day failed to load.**
- **Who:** both modes, Heather most.
- **Evidence:**
  - `pages/DashboardNew.jsx:144-177`: `Promise.allSettled`, and `rowsOf(null)` → `[]`, so meals are empty and `consumed: 0`.
  - The `catch` at `:228` can never fire, because allSettled doesn't reject.
  - `services/apiService.js:795`: `fetchPolicy: 'no-cache'`, so there's no stale copy to show.
  - `utils/plainWords.js:25-26` builds "Nothing logged yet today / Add what you ate and I'll keep count."
- **What she sees:** every push to main restarts the fleet. In that window, or on a weak signal, Home shows empty meal cards, the full calorie budget, and "Weigh in +" even when she has weighed in.
  - It looks exactly like a day she hasn't logged.
  - The offline chip only appears when `navigator.onLine` is false, not on a 502.
  - **The natural response is to log breakfast again**, which creates duplicates.
  - The same happens after her own log: `onChanged` reloads, and a failed reload blanks the cards she just filled.
- **Fix:**
  - Track the failure of `logsResult` and `summaryResult`. When either fails, keep the previous `data` and show one line in place of the plate sentence: "Can't reach FitnessGeek right now. What you logged is safe. [Try again]".
  - Never render "Nothing yet" or "Weigh in +" from a failed read.
  - Food Log already does this (`loadProblem`, B19), so copy that pattern.
- **Size:** S.

**L2. "Make it 2" after her habitual second tap makes three.**
- **Who:** Simple, which is exactly the §2a behaviour, and Full.
- **Evidence:**
  - `components/FoodSearch/FoodComposer.jsx:266-275`: `handlePick` replaces `added` with the *new* entry at `servings: 1`.
  - `FoodResultRow.jsx:109-115, 156`: the row stays tappable as "Add another", and the pill shows `Make it ${servings+1}` for the latest entry only.
  - The subtitle says "Added ✓" with no count.
- **What she sees:**
  1. She taps "Egg" twice, a minute apart, as she always has. That's two entries, which is correct.
  2. The row now offers **Make it 2**, which reads as confirming the 2 she just did.
  3. Tapping it turns the second entry into 2 servings: three eggs.
  - The feature meant to absorb her habit punishes it.
- **Fix:**
  - Within one sheet session, a second tap on the same row adds a serving to the existing entry rather than writing a new one.
  - The subtitle counts: "2 added ✓". The pill offers the next number ("Make it 3").
  - If two separate rows are preferred, the pill must count all the session's entries for that food.
- **Size:** M.

**L3. Copy Meal copies the whole day by default, and Simple can reach it.**
- **Who:** both modes, Heather via "Copy a meal from another day".
- **Evidence:**
  - `components/FoodLog/CopyMealDialog.jsx:64-72`: `fromMealType ''` and `toMealType ''`, shown as "All Meals".
  - The summary reads "Will copy: All Meals from 2026-10-15 To: All Meals on 2026-10-16" (`04`).
  - The primary "Copy Meal" button is in the header, top-right.
  - There's no undo; the dialog auto-closes after 1.5 s.
  - `pages/FoodLog.jsx`: the Copy button isn't gated by `isSimple`.
  - The "Quick Copy" buttons only fill the form, but they look like actions. "Copy Entire Day" doesn't say into which day: it's tomorrow.
- **What she sees:** "Copy Meal", so she taps Copy Meal, and yesterday's breakfast, lunch, dinner and snacks are all added to today. Nothing tells her how to take it back.
- **Fix:**
  - No copy without a chosen source meal. Make "Whole day" an explicit option, not the empty default.
  - Write the summary in words, with the person: "Copy Chef's dinner from Thursday into today's dinner".
  - Put the Copy button at the bottom (thumbSave), and end with the standard undo toast.
  - Make the quick buttons execute *with* that summary, or rename them "Fill in: …".
  - In Simple, hide the link and rely on "Same as …" picks (see L7).
- **Size:** S–M.

**L4. Simple Home never shows amounts, so a quantity can't be checked.**
- **Who:** Simple.
- **Evidence:**
  - `pages/DashboardNew.jsx:175` pushes only `name` and `calories`.
  - `components/Home/MealCards.jsx:135-141`: compact cards print `food.name` only, and no calories per food.
  - `19-simple-home` shows "Scrambled eggs".
- **What she sees:** after "Make it 2", or the serving sheet, the card still says "Egg". Two separate entries show "Egg / Egg", or "Egg and 1 more" after two rows. **Nothing confirms the amount**, so the safest-looking action is to add another.
- **Fix:**
  - Carry `servings` and show "Egg ×2" when it isn't 1.
  - Merge identical names in compact mode ("Egg ×2").
  - Do the same in the toast ("Changed to 2 ✓ · Egg" already does).
- **Size:** S.

**L5. A second weight for a day silently replaces the first.**
- **Who:** both modes. Plausible for Heather; Chef has scale imports.
- **Evidence:**
  - Gateway `resolvers.js:1561-1570`: `addFitnessWeight` keeps one row per day.
  - `QuickAddWeight.jsx` defaults the date to today and says "Weight saved."
  - The dialog never mentions an existing value.
- **What she sees:** she weighs in again in the evening, or backfills yesterday without touching the date field. The morning weight, or today's scale weight, is gone without a word.
- **Fix:** when the chosen day already has a weight, say so under the field: "You already have 218.7 for today. Saving replaces it." The button then reads "Replace".
- **Size:** S.

**L6. A day word in a comma-separated sentence splits the meal.**
- **Who:** both modes. Plausible; voice rarely produces commas.
- **Evidence:**
  - Backend `services/mealDescriptionParser.js:36`: `SEGMENT_SPLIT` on `,`.
  - `:193-201`: the implied meal ("last night" means dinner) applies from its own segment onward.
  - `FoodComposer.jsx:361`: the result header uses `logged[0].mealType` only.
- **What she sees:** "fried chicken, fries last night", typed at noon, logs the chicken to *yesterday's lunch* and the fries to *yesterday's dinner*. The card says "Added to yesterday's lunch".
- **Fix:**
  - When no segment names a meal, an implied meal from any segment applies to the whole description.
  - When entries land in different meals, the result card names the meal per row.
- **Size:** S.

### Blocks task

**L7. "We ate the same dinner" has no discoverable path for Heather.**
- **Who:** Simple, plus Chef as the sender.
- **Evidence:**
  - `components/FoodLog/HouseholdLogView.jsx:256`: "Copy … to your log". It only pulls, and it's Full-only (`FoodLog.jsx`, `!isSimple`).
  - `CopyMealDialog`'s "From" select has value `''` = "My Log" but renders empty (no `displayEmpty`) (`04`).
- **What she sees:** Chef can't send it to her. She'd have to know to open "Copy a meal from another day", change today's date default, open an unlabelled "From", pick Chef and pick a meal. Without instruction she won't.
- **Fix:**
  - In the add sheet's quick picks, when the household shares food logs, add "Same as Chef's dinner" as one tap through the existing copy path, with the standard toast and Undo.
  - Label the From select ("Whose log": Mine / Chef).
- **Size:** M.

**L8. A new Simple user's "Set your daily target" lands in the Full nutrition wizard.**
- **Who:** Simple, new users. Latent for Heather, whose goals are already set (§2a).
- **Evidence:**
  - `DashboardNew.jsx:452-460` goes to `/calorie-wizard`, which is `components/FitnessGoals/AIGoalPlanner.jsx` (1,175 lines).
  - Its steps: "Your Approach / Your Profile / Set Your Goal / Your Calorie Plan", covering standard vs keto, then BMR, TDEE, "Daily Calorie Deficit" and "Safety Check" (`16`).
- **What she sees:** step 2 of the first run promised "See how much is left each day". To get it she must choose between Standard and Keto and enter height, sex, age and activity level, then read Katch-McArdle.
- **Fix:**
  - A Simple target sheet: current weight, height and "How fast?" (gently / steady). It shows one number: "About 1,700 a day. [Use this]".
  - Link "See how this is worked out" to the full wizard.
- **Size:** M.

### Slows

**L9. Edit Entry (and Copy Meal) put Save in the top-right corner.**
- **Who:** both modes; Heather when fixing anything after the fact.
- **Evidence:**
  - `components/FoodLog/EditLogDialog.jsx` passes `primaryAction` straight to `PremiumDialog`, which puts it top-right in the full-screen header.
  - Weight and BP use `thumbSaveProps` (`BloodPressure/thumbSave.jsx`) and get a full-width bottom Save (`05e`, `06`).
  - Copy Meal is top-right too (`04`).
- **What she sees:** a long form (Calories, a servings slider, Day, Meal, Notes) with the keyboard up. **The only visible button is ✕**, which reads as cancel.
- **Fix:** use `thumbSaveProps` in EditLogDialog and CopyMealDialog. Label it "Save", not "Save Changes".
- **Size:** S.

**L10. A picking session has no Done; the only way out is ✕.**
- **Who:** both modes.
- **Evidence:**
  - `FoodComposer.jsx`: Done exists only on the describe result card.
  - `SessionRibbon.jsx:178`: hidden below 2 items.
  - `AddFoodDialog` header ✕.
- **What she sees:** after tapping an Again chip or a row, the sheet stays put (by design) with a 10-s toast. "✕" to a non-technical user means "cancel what I did here". She either hesitates, or taps the item again "to be sure" (see L2).
- **Fix:** show the ribbon from the first item as a sticky footer: "✓ 1 added to lunch · 190 cal · **Done**". Done closes the sheet; drop the red Undo all (L11).
- **Size:** S.

**L11. The ribbon's "Undo all" sits beside "Undo last", with no redo.**
- **Who:** both modes.
- **Evidence:** `SessionRibbon.jsx:214-235`: two 12-px text buttons side by side, the destructive one in red. The outcome toast has no redo.
- **What she sees:** one slip removes every item from that sitting.
- **Fix:** keep "Undo last" only, or make Undo all ask "Remove all 4?".
- **Size:** S.

**L12. Full: the toast hides "Just added", and Home doesn't scroll to it.**
- **Who:** Full.
- **Evidence:**
  - `32-full-just-added`, `32a`: the 10-s toast covers the strip's Undo and Done and repeats Undo.
  - `DashboardNew.jsx` AddFoodDialog `onClose={() => setAddMeal(null)}` has no scroll. Compare FoodLog's `showLoggedMeal`.
- **What he sees:** on Home the strip may land below the fold, so the toast is all he sees, and it hides the strip's controls.
- **Fix:**
  - When `onJustAdded` shows a strip, send a toast without an action, or no toast.
  - On Home, scroll the landed meal's card into view after close, as the Log page does.
- **Size:** S.

**L13. Result rows cut a long name to one line and lose the part that tells foods apart.**
- **Who:** both modes; worse with real OpenFoodFacts names.
- **Evidence:**
  - `FoodResultRow.jsx:183-192`: `nowrap` and an ellipsis. The 84-px pill, the 44-px sliders icon and "190 cal" take about half a 390-px row.
  - `29` shows "Fage Total 2% Greek…", "Fage Total 0% Greek …", "Fage Total 5% Greek…".
- **What she sees:** "Breaded Southern Fri…" against "Breaded Southern Fri…". She picks one at random, which risks the wrong item.
- **Fix:** clamp the name to two lines on phones and move "190 cal" under it, beside the brand and serving.
- **Size:** S.

**L14. Amounts are hard to reach: an unlabelled icon, and chips can't set one.**
- **Who:** both modes.
- **Evidence:**
  - `FoodResultRow.jsx:276-288`: a sliders icon with only a tooltip ("Change the amount"), which doesn't exist on touch.
  - `QuickPicks.jsx:93-101`: Again chips re-log at the last servings, with no Make it 2 and no amount.
- **What she sees:** most of her habitual foods will be chips now, and a chip can only say "one more entry".
- **Fix:** give chips the same post-tap affordance as rows ("Egg · Added ✓ · Make it 2"), and label the sliders icon "Amount" (or use the text button "oz/cups").
- **Size:** S–M.

**L15. The Simple Food Log page is still the Full page.**
- **Who:** Simple.
- **Evidence:**
  - `components/FoodLog/FoodLogItem.jsx` and `MealSection.jsx` have no `isSimple`.
  - Each row has a filled "190 cal" chip, "18P / 8C / 10F" and "1 serving", then ☆, ✎ and 🗑 as three adjacent boxed icons.
  - Section headers have an unlabelled 💾 ("Save as a meal") beside +, in the old teal with a ☀️ emoji. They don't look like the Home cards that link here (`32a`, the same components).
  - No harness scene covers Simple /food-log.
- **What she sees:** macro shorthand and three similar icons beside every food. The floppy disk reads as "save my log", not "save this as a meal".
- **Fix:**
  - Simple rows show the name, amount and "190 cal", and a whole-row tap opens Edit. Delete goes inside Edit, with the undo toast.
  - The header keeps only "+ Add".
  - Hide "Save as a meal" in Simple, or label it.
- **Size:** M.

**L16. Adding a medication is a pharmacist's form.**
- **Who:** Simple (and Full).
- **Evidence:**
  - `pages/Medications.jsx:512-518`: export buttons come before anything else, even with 0 medicines.
  - `:525-588`: the search is button-driven, results show "RxCUI ####", and "Add '…' as typed" appears only after a search.
  - `:590-690`: "Display name", "Type: Rx/OTC/Supplement", lower-case "morning/afternoon/evening/bedtime" toggles, "Suggested indications (editable)", "Your indications", "Add tag", and Save at the bottom of a long form.
- **What she sees:** a database search when she wanted to write "Vitamin D, mornings".
- **Fix:**
  - A Simple add: "What's it called?" (live suggestions, with RxNorm as a hint, not a gate), then "When do you take it?" (Morning · Midday · Evening · Bedtime · Once a day), then a bottom Save.
  - Hide export, type and indications in Simple. Move export below the list.
- **Size:** M.

**L17. Settings in Simple shows Garmin, Units and three save models.**
- **Who:** Simple.
- **Evidence:**
  - `pages/Settings.jsx:213-370` has no `isSimple`. Under the Experience card come Household, Appearance, Units, then Garmin email and password.
  - The Experience card saves instantly, Household has its own Save, and Units and Garmin need the sticky "SAVE CHANGES" bar.
  - **The Units setting is read nowhere else:** the only reference is `Settings.jsx:290`, and Weight is hard-coded to `unit="lbs"`.
- **What she sees:** a Garmin password field in the mode that promised "nothing to set up". Changing the theme and units leaves her unsure what was saved.
- **Fix:**
  - Simple Settings shows Simple/Full, Larger text and Theme, plus "More settings" for the rest.
  - Remove Units until it's wired up.
- **Size:** S.

**L18. Offline: the mic misleads, and "Your words are saved here" is only half true.**
- **Who:** both modes.
- **Evidence:**
  - `FoodComposer.jsx:432`: `micAvailable` ignores `isOnline`.
  - `hooks/useSpeechInput.js:36`: 'other' says "The microphone isn't working right now".
  - `composerText.js:129`: the words live in component state, and the MUI Dialog unmounts its children on close.
- **What she sees:**
  - She taps the mic in a dead spot and is told her microphone is broken.
  - She closes the sheet trusting "saved here", and the words are gone.
- **Fix:**
  - Disable the mic offline, with the same "No signal" line.
  - Keep the draft per (day, meal) in sessionStorage, inside try/catch, or change the copy to "Keep this open — tap Log it when you have signal."
- **Size:** S.

**L19. Switching Simple to Full is one tap with no way back offered.**
- **Who:** Simple.
- **Evidence:** `components/Settings/ExperienceSettings.jsx:30-31`: it saves immediately and the toast says "Switched to Full".
- **What she sees:** a stray tap reshapes Home: a banner, macros, stat cards, insights and a differently behaving add sheet. She may not connect it to Settings.
- **Fix:** add Undo to that toast ("Switched to Full · Undo"). In Full, add a one-line "Simple view" link on Home or More.
- **Size:** S.

### Polish

**L20. Two equal primaries when she types a short name.**
- **Evidence:** `29`: a green "Log it" and green "+ Add" pills on every row.
- **Fix:** in name mode, render Log it as an outlined button ("Just log 'fage'"), so the rows lead.
- **Size:** S.

**L21. Number words aren't treated as a sentence.**
- **Evidence:** `composerText.js:18-25`. "two eggs" and "a couple eggs" have no digit and fewer than 3 words, so they count as a name: the list opens and a deep search runs.
- **Fix:** match one to twelve, "a couple", "half", "a few", "dozen".
- **Size:** S.

**L22. The add sheet mixes relative and weekday names for days.**
- **Evidence:** `36`: "Add to yesterday's dinner" above "Same as Wednesday's dinner". Both are correct, but it reads like a jump.
- **Fix:** on a backfilled day, use the weekday in both places ("Add to Thursday's dinner (yesterday)").
- **Size:** S.

**L23. The meds checklist is today-only.**
- **Evidence:** `useMedsToday(today)`.
- **What she sees:** last night's missed tick can't be recorded.
- **Fix:** a "Yesterday" toggle on the Medications page checklist.
- **Size:** S–M.

**L24. "Please sign in again." gives her nothing to tap.**
- **Evidence:** `utils/errorMessage.js:20` and `composerText.js:153`.
- **Fix:** add a Sign in button wherever that message renders.
- **Size:** S.

**L25. "How am I doing?" gets mixed signals in Simple.**
- **Evidence:**
  - `05`: Weight leads with "Active Weight Goal", "32.7% Complete" and a red "88 days behind".
  - `07`: BP shows a "Normal" badge above a red "Healthy Range 7%".
- **What she sees:** for a daily check-in, red pills read as failing even when the trend is good.
- **Fix:** Simple Weight leads with the trend in words ("Down 13 lb since September"). Hide the days-behind chip. Make the BP headline agree with the average.
- **Size:** M. This overlaps the charts reviewer.

---

## Things that already work well: keep

- **"What did you eat?"** is the first control on Simple Home, above the fold even with Larger text (`19`, `22`). It opens on the meal for this hour.
- **The composer:**
  - The sentence folds the list ("Or pick an exact food (n)").
  - Log it sits directly under a multi-line box, and the mic is beside it.
  - The status line keeps its height, so nothing jumps (`28`).
- **Thinking state:** "Working it out…" with a spinner and the box read-only, then "Still working — this one's taking a moment." after 8 s (`30`).
- **Errors that keep her words** and say what to do: "That didn't go through. Tap Log it to try again.", with the same idempotency key on the retry (`34`, `FoodComposer.jsx:315`).
- **Simple result card:** "✓ Added to lunch", Fix per item, and Undo all *restores the sentence* (`31`).
- **The Fix sheet's** three tiers. "It was actually…" writes the new entry *before* deleting the old one (`31a`, `useEntryFixes.js`).
- **The day question is asked before writing,** with Log it disabled until it's answered (`35`). Sheet titles name the day (`36`).
- **One write at a time:** a ref guard, plus "Adding…" on the exact row or chip tapped.
- **The undo toast grammar** everywhere: 10 s, then "Undone ✓" or "Couldn't undo — try again" with a retry.
- **Today strip "Weigh in +" and "Add BP +"** open the dialog directly. Weight and BP have a full-width bottom Save, plus "Save it one minute later" for a BP collision.
- **`useToday`** rolls over on visibility, focus, pageshow and midnight. Food Log follows today only if it was showing today.
- **Android back** closes sheets (`useBackToClose`) rather than leaving the page.
- **Edit Entry in Simple** asks for the whole entry's calories ("For this whole entry.") and can move the Day.
- **My Meals "Log this"** asks for the meal and the day before writing.
- **Meds "Daily" group** and "Add '…' as typed". The tick list on Home is excellent (`19a`).
- **The ErrorBoundary** copy: "Nothing you saved is lost. Reloading usually fixes it."
- **The offline banner** tells the truth.
- **The three-step first run.** Step 3 says "Try logging your lunch", by the hour.

---

## Screens and states with no harness scene that should get one

1. **Simple /food-log** with rows on today and on Yesterday (this would have shown L15). Include the inline composer on a backfilled day.
2. **Simple Home after a failed load** (fixture 502 on `foodLogs` and the summary), to pin L1.
3. **A row after a tap:** "Added ✓ · Make it 2". Then after a second tap on the same row (L2).
4. **The session ribbon** with 2+ items in the sheet. An Again chip in "Adding…".
5. **Edit Entry**, Simple and Full: Save placement and the Calories field (L9).
6. **First run step 3**, and Home immediately after "Maybe later" (no target, "Set your daily target").
7. **The calorie wizard step 1** reached from Simple (L8).
8. **Medications:** empty, search results, the add form, and "Add as typed" (L16). Simple Home "Track your meds".
9. **Settings in Simple**, full-page scroll (L17).
10. **The serving sheet** in servings, oz and cup.
11. **Mic states:** listening with interim text, an error, and a result card with "I heard: …".
12. **Describe outcomes:** partial ("Logged the soup. I couldn't work out 'crackers'. [Pick crackers]"), nothing understood, and a server-heard day ("Move it to Monday").
13. **The BP dialog**: `08-bp-dialog` is defined in `scenes.mjs` but there is no PNG in `out/ci`. Add the duplicate error with "Save it one minute later".
14. **The weight dialog** on a day that already has a weight (L5).
15. **The ErrorBoundary** screen.
16. **Copy Meal** with a household member chosen. HouseholdLogView (L3, L7).
17. **Brand-new account empty states:** Home with no goal, Weight with no logs, BP with no logs, an empty Log.
18. **Long OpenFoodFacts names** in the fixtures: rows and Again chips ("CHOCOLATE PEANUT BUTTER protein bar", "Breaded Southern Fried Chicken Breast") (L13).
19. **Larger text plus the add sheet** with the keyboard space reserved: does Log it stay visible?
20. **The signed-out composer message** (L24).
