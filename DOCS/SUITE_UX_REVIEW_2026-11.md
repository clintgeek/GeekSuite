# Suite design and UX review (2026-11-18)

Chef asked for "a full review of the suite for any possible improvements in design
or UX". **This is a review. Nothing here is built.** It complements
`SUITE_REVIEW_2026-11.md` (2026-11-15), which covered data correctness from code and
did not use screenshots.

**How it was done.** Eight read-only reviewers, one or more apps each, worked from the
2026-11-18 harness screenshots (1,848: every scene on a 390 px phone and a 1280 px
desktop, dark and light) and the app code. Each was given the standing decisions (own
look per app, phone first, tablet work for NoteGeek and TodoGeek only, and the rest)
and told not to propose against them. Their full reports are appended unchanged.

**How far to trust it.** Every finding says whether it was SEEN in a screenshot, read
in CODE, or is SUSPECTED and needs a device. Sage re-checked 14 headline findings
against the code or the screenshot; all 14 held (marked ✔ below). The rest rest on the
reviewer's reading. No device was involved, and a screenshot shows no motion, focus or
keyboard. Sizes: S under 2 h, M half a day to a day, L more.

## Verdict per app

| App | State | Biggest gain |
|---|---|---|
| FitnessGeek | Good. Simple mode is the best-finished part. | Full mode's Home and Log; three "goals" that disagree; a few add-sheet traps |
| NoteGeek | Good. Home capture box is the best front door in the suite. | The note page on a phone: chrome, viewer versus editor, save-failure noise |
| TodoGeek | Good. Red Pen is the most consistent look in the suite. | Today shows 2.5 tasks on a phone; stock-Material editor; old BuJoGeek login copy |
| ThingGeek | One of the most finished. | The phone thing page (insurance panels buried, action bar scrolls away) |
| BookGeek | Library and detail sheet are the strongest identity work in the suite. | The in-app reader: no position, Back leaves the book, no bookstore look, no harness scene |
| GameGeek | Good; loudest identity. Hours are already gone everywhere. | Two visible collisions on the phone; "Couch co-op" as a shelf |
| NewsGeek | One of the best crafted ("County Gazette"). | The reading path: masthead, tap targets, front-page length, Sources at 88 |
| StoryGeek | Strong identity; excellent turn recovery. | A 1–3 minute turn looks like a 5-second one; `/back` rewinds with no confirm |
| FlockGeek | Works, calm. **Weakest identity in the suite.** | Egg logging is 5–7 taps and remembers nothing |
| BaseGeek | Signal Box is the most complete identity; login matches its plain intent. | Bad news is hard to find ("3 CAUTIONS" with no link); phone layouts |
| StartGeek | Look holds; desktop and error wording are good. | Phone first screen; command box reads an old task grammar |

## What the suite has in common

Five patterns turned up in most apps. Each is a class of fix, not one fix.

**1. The first phone screen is mostly chrome.** The thing the user came for starts a
third to more than half way down:

| App | Screen | Where the content starts (of 844 px) |
|---|---|---|
| NewsGeek | Everything | first story about 340 px down ✔ |
| NoteGeek | a note | body about 265 px down ✔ |
| TodoGeek | Today | about 236 px of list between header and add box; 2.5 rows ✔ |
| ThingGeek | a Where level; Attention | first unit about 55% down; first due item about 60% down |
| StoryGeek | play | about 165 of 664 px before the first story line |
| StartGeek | console | no complete task on the first screen |
| BaseGeek | The Line | about 820 px of all-green cards before a reading that changes |
| FitnessGeek | Food log; Health; Reports; Weight | add box, tiles or cards first; today's weight about five screens down |

Several of these headers are part of an identity (TodoGeek's big date numeral,
ThingGeek's murals, NewsGeek's nameplate, StartGeek's clock), so shrinking them on the
phone is Chef's call each time. The usual answer is to keep the motif at full size on
one home screen and use a compact form of it everywhere else.

**2. Each app has a few screens that fall back to stock Material.** The identity is
strong on the main screens and drops out on forms, sheets, menus, and empty and error
states: TodoGeek's editor, BookGeek's forms, filter sheet, Settings and reader,
GameGeek's sheets, ThingGeek's Edit, Filters and More sheets, NoteGeek's info alerts,
mind map and pen palette, NewsGeek's pill, fields and menu, BaseGeek's Account,
FitnessGeek's household food logs. This is also the one place BookGeek and GameGeek
still look alike. Every one of these is fixed in the app's own theme; none needs a
shared-package change.

**3. Delete, undo and confirm are done a different way in every app, and sometimes
two ways inside one.**

| App | Delete | Undo |
|---|---|---|
| NoteGeek | asks, then also offers Undo; Archive only offers Undo | yes |
| ThingGeek | asks every time | none |
| FlockGeek | browser `window.confirm` | none |
| StoryGeek | `/back` rewinds with no question | none |
| StartGeek | ticking a task is silent | none |
| BookGeek | "Send" emails the Kindle on one tap | none |
| FitnessGeek | Undo, under four different labels in one flow | yes |

A suite rule would settle all of them: reversible actions act at once and offer Undo;
only actions that cannot be undone ask first. That is a decision for Chef (it touches
NoteGeek's D1).

**4. Engineer words on screens Heather can see.** Model ids, "fragments" and "one
pass" in NoteGeek; "IGDB keys are set on the server" in GameGeek ✔; raw server error
text in TodoGeek; "instance" in TodoGeek's repeat dialog; weather jargon in StartGeek;
"click away" on a phone in BaseGeek.

**5. The harness has never seen some of the most-used screens.** No scene for: any
login page, BookGeek's reader, StartGeek's command box in use, TodoGeek with the
keyboard open, NoteGeek's Settings, version history and every empty/loading/error
state, FitnessGeek's food search, barcode scanner and food editing. Three fixtures are
wrong: StartGeek still fakes the old wallpaper address, so no scene shows a wallpaper;
NewsGeek's Today scenes open already scrolled; BaseGeek scenes 09 and 10 point at
`/databases`, which no longer exists ✔. Each reviewer's "no harness scene" list is in
its appendix.

## Ranked across the suite

Ranked by benefit to someone using the app every day.

**A. Things that go wrong in the hand (do these first; mostly small)**

1. **FitnessGeek, both modes:** "Amount" on a food already added logs a second entry;
   one egg, then Amount 3, gives four eggs. ✔ (`FoodSearch/FoodComposer.jsx`, the
   serving sheet's confirm always logs) — S
2. **FitnessGeek, both modes:** "Same as yesterday's…" has no Added state; a second tap
   copies the whole meal again. — S
3. **FitnessGeek, Simple:** Heather cannot set or change a weight goal; both buttons on
   Weight lead to a form with no goal-weight field. — S–M, needs a decision
4. **StartGeek:** `> task` capture uses its own old copy of the grammar, which does not
   know `(private)`, so a private task captured there arrives unmasked. ✔ (StartGeek's
   `parseTaskInput.js` has no "private"; `packages/task-grammar` does) — S–M
5. **NoteGeek:** the tag field's hidden clear-all × removes every tag in one click. ✔
   (no `disableClearable`) — S
6. **BookGeek:** the reader never shows where you are and opens at the cover every
   time. ✔ (no `locations.generate` anywhere) — M, needs a decision
7. **BookGeek:** Android Back in the reader closes the reader and the book sheet
   together; the controls hide while you are using them. — M
8. **StoryGeek:** `/back` rewinds to the last checkpoint with no confirmation and no
   undo. — S
9. **ThingGeek:** the phone action bar is meant to stick and cannot. ✔ (its box ends
   right under it) — S
10. **BaseGeek:** the login fields have no `autoComplete`, so phone password managers
    may not fill them. This is the front door of every app. — S, needs a device
11. **GameGeek:** Add a game — heading over the field label, X on the field border ✔;
    detail — sticky bar under the close button. — S each
12. **BookGeek:** two close buttons drawn on top of each other on the phone detail
    sheet. — S

**B. Daily jobs that take too long**

13. **FlockGeek:** logging eggs is 5–7 taps and starts from zero daily; remembering the
    last pen and offering recent counts makes it 3. Home never says whether today is
    logged. — S–M
14. **FitnessGeek, Full:** Home has no way to add food on the first screen ✔ (the bar
    renders only in Simple). — S, needs a decision
15. **TodoGeek:** Today shows 2.5 tasks on a phone. — M, needs a decision
16. **NewsGeek:** only the headline text opens a story ✔; the masthead takes the first
    screen; about 2.5 stories per screen. — S each
17. **NoteGeek:** a third of the phone screen before the first line of a note; the
    viewer and the editor disagree. — M each
18. **ThingGeek:** Claim readiness, Value and Documents are at the bottom of the phone
    thing page. — S
19. **StoryGeek:** a long turn has no clock, no expectation and no "safe to leave". — S
20. **BaseGeek:** "3 CAUTIONS" is not a link and does not say which. — S
21. **BookGeek:** rating a book from its own page takes four taps. — S

**C. Identity**

22. **FlockGeek has no real identity.** "Field Ledger" exists only in a comment in its
    theme. — M–L, needs a decision
23. **TodoGeek's login page still sells BuJoGeek** (Daily Log, Habits, Migration,
    Reflection). ✔ — S
24. The stock-Material fallbacks in pattern 2, app by app. — S to M each
25. **TodoGeek:** ripple highlights freeze as grey blobs (this is the "clipped
    carried-over highlight" the 11-15 review could not reproduce). — S

**D. Larger, and wanting a decision first**

26. **TodoGeek:** repeats and reminders have no visible way in (Phase 2 was never
    built). — L
27. **GameGeek:** "Couch co-op" is a shelf, so it replaces a game's real status and
    stops the Playnite import moving it. — M to L
28. **StoryGeek:** desktop play column is about 500 px at 1280 (the known item, still
    true); two "new tale" forms that disagree. — M each
29. **NewsGeek:** Sources does not scale to 88 (no find-by-name). — M
30. **BaseGeek:** UserGeek can only add and delete users. — M

## Decisions for Chef

None of these is urgent; each unblocks the item beside it.

| # | Decision | Unblocks |
|---|---|---|
| 1 | One suite rule for delete/undo/confirm (pattern 3)? | NoteGeek, ThingGeek, FlockGeek, StoryGeek, BookGeek Send |
| 2 | May identity headers shrink on the phone away from the home screen? (TodoGeek numeral, ThingGeek murals, NewsGeek nameplate, StartGeek clock, NoteGeek/StoryGeek top bar) | Pattern 1 |
| 3 | FlockGeek: is "Field Ledger" the identity, or something else? Is a bird known by name or by tag? | 22 |
| 4 | FitnessGeek: should Full Home carry Simple's add bar? Which of the three "goals" is the real one? How does Heather set a goal weight? | 3, 14 |
| 5 | BookGeek: is a reading position remembered on the device only acceptable under S-D3? | 6 |
| 6 | TodoGeek: is Phase 2 (repeats, reminders) still wanted? May the add box appear outside Today? | 26 |
| 7 | GameGeek: is Couch co-op a status or a list? Do you use per-game progress at all? | 27 |
| 8 | StoryGeek: which "new tale" form survives; which column gives way on desktop | 28 |
| 9 | BaseGeek: should anyone be able to register on the sign-on page? Do role changes and password resets belong in UserGeek? | 30 |
| 10 | NoteGeek: should a model id be visible anywhere? What is a text note called ("Note", "Notes", Markdown)? | Pattern 4 |
| 11 | StartGeek: same tab or new tab from the dock | — |

## Suggested order

1. **Group A** in one pass. Almost all S, no decisions except items 3 and 6, and they
   are the ones a user trips on.
2. **Harness scenes** for the unaudited screens (pattern 5) and the three fixture
   fixes, so the rest is checked as it lands.
3. **FlockGeek egg logging** and **Group B** S items.
4. Decisions 1 and 2, then the pattern 1 and pattern 3 work app by app.
5. The identity fallbacks (pattern 2), one app per commit so each can be reverted.
6. FlockGeek's identity and the Group D items, as Chef picks them.

## Corrections to our own notes

- ThingGeek's shipped identity is "Storage Yard", not "Moving Day" (Moving Day was
  revised the same day; `THINGGEEK_PLAN.md`, "As built"). The reviewer was briefed with
  the wrong name, caught it, and reviewed against the right one.
- FlockGeek's offline page is styled now; the open item in `SUITE_TODO.md` §3 no
  longer holds. BookGeek's was not re-checked.
- GameGeek: hours are already gone from cards, rows, detail and export; nothing is
  left of that pending offer.
- `PLAYNITE_IMPORT.md` says the "how did it end?" question was replaced by the
  automatic move to Backlog, but the banner is still built and has a scene. One of the
  two is stale.

---

# Appendix — the reviewers' reports, unchanged

## FitnessGeek (part A: scenes 0x, 1x, 2x, 3x, 6x) — design and UX review

Scope: the 92 phone scenes numbered 01–36 and 60–69, in both themes for the main screens, plus the desktop shots for Home, Log, Weight, BP, Reports, Settings and the calorie plan. Scenes 40–59 are reviewed by the other FitnessGeek reviewer. Screenshot directory: `tools/mobile-harness/out/par-fitnessgeek/fitnessgeek/`. Code: `apps/fitnessgeek/frontend/src`. I did not re-report anything the October review fixed (`apps/fitnessgeek/DOCS/ARCHIVE/UX_REVIEW_2026-10-17.md`) or anything in the 2026-11-15 inspection (`DOCS/SUITE_REVIEW_2026-11.md`).

### Verdict
FitnessGeek is in good shape. The Simple face (Heather) is the best-finished part: Home answers "how much is left" in one sentence, "What did you eat?" sits above the fold, and the composer, result card, Fix sheet and day question work without instruction. Market Morning holds in both themes and on desktop. The gains left are mostly in **Full mode (Chef)**: Full Home has no add above the fold, the Full Log page shows a floating + that repeats the composer and covers content, Weight hides today's reading under five sections, and the BP card and Reports spend the first screen on tiles that repeat each other. The other gain is in both modes: three separate things are called "Your goal", and they do not talk to each other.

### Top findings (ranked, at most 12)

#### 1. Full Home has no way to add food on the first screen
- Where: Home, Full mode (`/dashboard`)
- Evidence: `fitnessgeek-01-home-dark.png`, `-01-home-light.png`, `-23-full-home-meals-dark.png`, `-14-home-scan-bmr-banner-dark.png`; `pages/DashboardNew.jsx:509-518` (the "What did you eat?" button renders only when `isSimple`)
- Seen or inferred: SEEN + CODE
- Problem: Chef's most frequent job is adding food. On the phone, the first screen in Full is the greeting, the plan banner, a 180 px ring and the macro bars; the first "+ Add" (Breakfast) is about one and a half screens down (scene 23 is already scrolled). The alternative is switching to the Log tab. Simple got the one-tap entry; Full, the mode for the person who logs every meal, did not.
- Proposal: phone first: show the same full-width "What did you eat?" bar in Full, between the greeting and the plan banner (it opens the add sheet for the meal of the hour, as Simple's does). Alternatively, on phones put the ring and sentence side by side as Simple does (104 px ring), which pulls the meal cards up by about 300 px. Desktop: the same bar fits above the ring card; the four meal cards already show on the first screen there.
- Size: S
- Needs a decision from the owner? Yes: whether Full should carry Simple's entry bar, or only the compact ring.

#### 2. On the Full Log page, the floating + repeats the composer and covers content
- Where: Food log, Full mode (`/food-log`)
- Evidence: `-02-log-dark.png` (the + sits on the "Or tap one you've had" heading and the "Same as yesterday's breakfast" card), `-11-describe-and-log-dark.png` (covers the Breakfast section's own "+ Add"), `-32a-log-just-added-dark.png` (covers a row's delete icon); `pages/FoodLog.jsx:343-350` (hidden only in Simple, "the add box is already on the page, and the button sat over the Again chips")
- Seen or inferred: SEEN + CODE
- Problem: the reason given for hiding it in Simple applies equally to Full. The page already opens with the composer and each meal section has "+ Add", so the FAB is the third add control on one screen, and it is the one that hides the other two plus a delete icon. Its label "Log food" cannot show on phones (known GeekFab limitation), so it reads as a bare +.
- Proposal: hide the FAB on `/food-log` in both modes (drop the `hidden: isSimple` condition). If Chef wants a thumb-reach add after scrolling, show it only once the composer has scrolled out of view.
- Size: S
- Needs a decision from the owner? No.

#### 3. Weight page: today's reading is buried, and the page is six sections deep
- Where: Weight, Full mode (`/weight`); Simple's Weight is in the other reviewer's scenes (53a, 57e)
- Evidence: `-05-weight-dark.png`, `-05a-weight-trend-dark.png`, `-05b-weight-body-dark.png`, `-05c-weight-body-trend-dark.png`, `-05d-weight-log-dark.png`, `-05-weight-light-desktop.png`
- Seen or inferred: SEEN
- Problem: a daily weigher opens Weight to see "what did I weigh today". The page order is: intro sentence, goal card (with three nested tiles), trend chart, body composition, change, fat and lean chart, and only then the weight log, where "218.7 lb Today" is the first row, about five phone screens down. The top only shows the 7-day average in body text ("From your 7-day average, 219.9 lb"). The "Log weight" extended FAB also sits over the last line of each section as you scroll ("At this pace: early April 20…", "What your weight is mad…", "Of the 2.9 lb…").
- Proposal: phone first: one line at the very top, above the goal card: "Today 218.7 lb · 7-day average 219.9 lb" (or "Last weighed Sunday" when nothing today), with today's row tappable to edit. Drop the "Scale" chip from every log row and mark only the typed ones ("Typed"), so rows shrink from about 66 px to one line plus date. Give the page bottom padding equal to the FAB height so the FAB never covers the last line. Desktop: the same line can sit in the goal card's header row.
- Size: M
- Needs a decision from the owner? No.

#### 4. Three different things are called "Your goal", and they do not agree
- Where: Settings > About you (both modes), Weight goal card (Full), calorie plan (Full)
- Evidence: `-09-profile-dark.png`, `-10-settings-about-you-dark.png`, `-60a-settings-simple-you-dark.png`, `-61e-profile-lands-on-you-dark.png` (no goal selected, for both a user with a 232 → 195 lb goal and one with a 1,800 cal target), `-05-weight-dark.png` ("Your goal 232 lb → 195 lb", "Change goal"), `-17-wizard-old-vs-new-dark.png`; `pages/Settings.jsx:69-73, 211-218` (writes only `experience.goal`), `components/Weight/WeightProgress.jsx:24-27`, `components/FitnessGoals/AIGoalPlanner.jsx:103, 351`
- Seen or inferred: SEEN + CODE (the empty radios are fixture-driven, but nothing in the code fills them from an existing weight goal or plan)
- Problem: Settings shows "Your goal: Lose a little weight / Keep my weight steady / Just keep track" as an unselected radio group for someone who already has a weight goal and a calorie plan. Choosing "Keep my weight steady" there changes neither the Weight goal card nor the calorie target, so Settings can say "steady" while Weight says "Behind plan" toward 195 lb. In Simple this is a mild puzzle; in Full it is two controls with the same title that disagree.
- Proposal: phone first: in Full, replace the radio group in Settings with a one-line summary of the real goal ("Lose to 195 lb by Dec 1 · 1,950 cal a day") and a "Change" link to the Weight goal / calorie plan. In Simple, keep the three plain choices, but pre-select one from the stored weight goal when `experience.goal` is empty, and say under the group what changing it does ("Your daily target will be worked out again").
- Size: M
- Needs a decision from the owner? Yes: whether `experience.goal` should drive the calorie plan, or Settings should only point at the plan.

#### 5. The BP summary card repeats itself, and its heart is green even when the week is high
- Where: Blood pressure (`/blood-pressure`), both modes
- Evidence: `-07-bp-dark.png`, `-07-bp-light.png`, `-67-bp-week-dark.png`, `-07-bp-dark-desktop.png`; `components/BloodPressure/BPInsights.jsx:176-181` (the icon tile is always `primary.main`)
- Seen or inferred: SEEN + CODE
- Problem: on the phone the first screen is an intro sentence plus one card holding four full-width tiles. The headline "Your average this week: 126/79 — a little high (elevated)" is then repeated by the "7-day average 126/79" tile directly below it. The headline sits beside a basil-green heart, the colour the app uses for "done" and "normal", so the colour says fine while the words say a little high. The readings chart and log start a full screen down.
- Proposal: phone first: keep the headline sentence. Below it, one compact row of three facts ("30 days 126/79 · Stable · 1 of 14 in healthy range") instead of four tiles, and drop the 7-day tile because the headline is the 7-day figure. Tint the heart tile by the headline's category (neutral or warning tone for "a little high"), never green when it is above normal. Desktop: the existing 2×2 grid is fine once the duplicate tile goes.
- Size: S
- Needs a decision from the owner? No.

#### 6. The full calorie plan wizard has no side margin on phones
- Where: Calorie plan, Full mode (`/calorie-wizard`)
- Evidence: `-16-wizard-scan-source-dark.png`, `-17-wizard-old-vs-new-dark.png` (the cards, the "Step 4 of 4" text and the progress bar touch both screen edges); `components/FitnessGoals/AIGoalPlanner.jsx:365` (`p: { xs: 0, sm: 3 }`)
- Seen or inferred: SEEN + CODE
- Problem: every other page keeps the shell's gutter; this one runs edge to edge, so rounded cards are cut off by the screen edge and text starts at x = 0. It looks broken next to the quick target (`-62-quick-target-light.png`), which has its margin.
- Proposal: change `xs: 0` to the shell's normal page padding. No change on desktop.
- Size: S
- Needs a decision from the owner? No.

#### 7. Reports spends its first phone screen on six oversized number tiles
- Where: Reports, Full mode (`/reports`)
- Evidence: `-07r-reports-dark.png`, `-66-reports-food-dark.png`, `-66a-reports-ribbon-dark.png`, `-66-reports-food-light-desktop.png`
- Seen or inferred: SEEN
- Problem: on the phone, Calories, Protein, Carbs, Fat, Fiber and Sugar each get a 130 px tile in a 2×3 grid (about 880 px), with no target beside them, so "162 g protein" cannot be judged on the page (the AI note further down says the target is 178 g). The day ribbon marks "over" days with a lilac top stroke, the Snacks colour, so a meal colour is again doing a status job (the October review's B2 rule: produce colours for meals only).
- Proposal: phone first: a compact table, one row per nutrient: "Protein 162 g a day · target 178", with a thin bar, at about 48 px a row (about 300 px in total), so the day ribbon and "Calories by meal" reach the first screen. Mark over days in the ribbon with a words-first status ("Over" is already there) plus the warning tone, not the Snacks lilac. Desktop: the single row of six tiles works; add the target line under each number.
- Size: S–M
- Needs a decision from the owner? No.

#### 8. The BP and weight dialogs behave differently for the same job
- Where: Log BP dialog and Log weight dialog, both modes
- Evidence: `-08-bp-dialog-dark.png`, `-68-bp-dialog-light.png` (Save is filled and enabled with every field empty), `-06-weight-dialog-dark.png` (Replace is disabled until a value is typed); `components/BloodPressure/QuickAddBP.jsx:247` (`disabled={loading}`) against `components/Weight/QuickAddWeight.jsx:176` (`disabled={!value || loading}`)
- Seen or inferred: SEEN + CODE
- Problem: one check-in invites a tap that can only fail, the other does not. The verbs differ too: the button that opened it says "Log BP" or "Log weight", the BP dialog says "+ Save", and weight says "Replace" or "Save". In both themes the BP units "mmHg" and "bpm" sit high in the field, above the text baseline, while weight's "lb" is centred.
- Proposal: phone first: disable BP Save until both numbers are in, as weight does. Use one verb, "Log" for new readings and "Save" for edits, in both dialogs. Centre the unit adornment vertically as in the weight field.
- Size: S
- Needs a decision from the owner? No.

#### 9. Undo has four labels in one add flow
- Where: add sheet result (Simple), add sheet ribbon (Full), Just added strip on Home and Log, toasts; both modes
- Evidence: `-31-composer-result-simple-dark.png` ("Undo all"), `-29a-composer-short-query-full-dark.png` ("Undo last" on the ribbon plus "Undo" on a toast, both on screen at once), `-32-full-just-added-dark.png` and `-32a-log-just-added-dark.png` ("Undo" on the strip)
- Seen or inferred: SEEN
- Problem: the same undo grammar the October review praised now reads four ways, and in Full (29a) two undo controls cover the bottom quarter of the sheet together, over the result rows. (The toast over the strip is the October review's L12; it still holds in this scene. The other reviewer's 42* scenes cover it in more depth.)
- Proposal: one label per scope: "Undo" when it removes one item, "Undo all" when it removes everything just added. In the Full sheet, suppress the toast while the ribbon is showing, since the ribbon already carries undo.
- Size: S
- Needs a decision from the owner? No.

#### 10. Medications: two different add forms and two time-of-day pickers
- Where: Medications, Simple against Full (`/medications`)
- Evidence: Simple `-63a-meds-suggest-simple-dark.png`, `-63b-meds-add-simple-filled-dark.png` (a sheet asking "What's it called?" and "When do you take it?", with 2×2 tiles plus "Once a day"); Full `-64-meds-add-full-dark.png`, `-64a-meds-nothing-found-dark.png` (an inline form under a button-driven search, a segmented Morning/Midday/Evening/Bedtime bar, "Display name", "Strength", "RxCUI 314076", "Suggestions for what it's for")
- Seen or inferred: SEEN
- Problem: the same field (when you take it) is picked two different ways depending on mode, and Full's add form opens at the bottom of a long page, below today's doses, the search box and the results. Full keeping the clinical fields is fine for Chef; the duplicate pickers and the scroll are not.
- Proposal: phone first: give Full the same bottom sheet as Simple, with Full's extra fields (strength, type, what it's for) under a "More details" section inside the sheet, and use the 2×2 tiles in both. Search as you type in both (Simple already suggests as you type; Full still needs a Search button press).
- Size: M
- Needs a decision from the owner? Yes: whether Full may lose the inline form.

#### 11. Settings switches and outlines are inconsistent
- Where: Settings (`/settings`), both modes (Household and Garmin are under "More settings" in Simple)
- Evidence: `-25-settings-experience-dark.png` (Larger text switch on the right), `-61a-settings-household-dark.png`, `-61b-settings-garmin-dark.png` (switches on the left of their labels), `-60b-settings-simple-more-dark.png` (the household code box has a bright near-white 2 px outline in dark, unlike every other brown-outlined field; the "Share my saved meals" row uses a dumbbell-like icon, not a meal icon)
- Seen or inferred: SEEN
- Problem: one page uses two switch layouts, so the eye has to find the control again for each section, and the stock-looking white outline on the code box breaks Market Morning's warm outlines in dark mode.
- Proposal: put every switch on the right, aligned to the card edge, with the label and helper text on the left (the Larger text pattern). Give the code box the theme's divider colour. Use the restaurant or menu icon for saved meals.
- Size: S
- Needs a decision from the owner? No.

#### 12. Home's Weight and Blood pressure tiles do not line up
- Where: Home, Full mode, below the meal cards
- Evidence: `-15-home-weight-stat-dark.png`, `-69-home-ai-advice-dark.png`
- Seen or inferred: SEEN
- Problem: in the two-column stat row, the Blood pressure title and number sit about 9 px lower than Weight's, and BP has a coral outline while Weight has none, so the pair looks like two different components. The tiles after it (Steps, Days in a row) repeat the offset.
- Proposal: one tile component for all four, with the title on a fixed baseline. Use an outline tint only when it carries meaning (for example a high reading), and say that meaning in words.
- Size: S
- Needs a decision from the owner? No.

### Smaller findings

**Home**
- Simple: the Today strip wraps raggedly. "Meds 1 of 3" has no "+", unlike its neighbours, and at Larger text it drops to a second row on its own (`-19-simple-home-light.png`, `-22-larger-text-dark.png`). It is fine, but a fixed three-up grid would read as one control set.
- Full: the plan-accuracy banner cannot be dismissed. That is deliberate (`components/Dashboard/PlanAccuracyBanner.jsx:20`) and is not proposed against.

**Food log and add sheet**
- The date navigator's calendar icon touches the word "Today", with no gap (`-02-log-dark.png`, `-02-log-light.png`).
- The gear on the Calories card is a bare white icon in dark mode, while every other card icon is basil. Its purpose (calorie settings) is not visible (`-02-log-dark.png`).
- Full Log rows are still heavy: each row is a card inside the meal card, with its own fork tile, a "21 cal" chip, a "0.5 servings" chip, and macros wrapping as "P 38 · C 12 · F / 31 g" (`-32a-log-just-added-dark.png`). The Lunch section icon is a fork and knife on Log but a burger on Home (`-23-full-home-meals-dark.png`). The other reviewer's 50b covers this page in full.
- SUSPECTED: in Full, the unselected "Breakfast" chip shows a grey fill while "Lunch" is the selected one (`-21-add-sheet-again-dark.png`, `-28a-composer-sentence-full-dark.png`), so it reads as a second selection. It is probably MUI's focus or hover fill on a clickable outlined chip (`components/FoodSearch/FoodComposer.jsx:883-905` styles only the chosen chip). Neutralise the default hover and focus background, or give focus a ring instead.
- The Fix sheet is a centred dialog over the full-screen add sheet (`-31a-composer-fix-sheet-dark.png`), so its controls sit mid-screen rather than at the thumb, and its "Save" for typed calories is a grey circle that reads as disabled. (Its own back-stack hook is a known suite item.)
- Copy meal (Full) shows dates as "11/17/2026" (`-04-copy-meal-dialog-dark.png`), as do the weight and BP dialogs (`-06`, `-08`), while the weight edit header says "Wed, Nov 18, 2026" (`-05e`). These are native date inputs; a "Today / Yesterday / pick a day" chip row would match the app's date voice.

**Weight**
- The "Time left" tile shows "1 week" large and "12 days until Dec 1" small (`-05-weight-dark.png`), so the larger figure is the less precise one. Lead with "12 days".
- The body-composition chart axis reads "Nov 01, Nov 08" while the weight chart reads "Nov 1" (`-05c`, `-05d` against `-05a`); `components/BodyComposition/BodyCompTrend.jsx:72` uses `'%b %d'`. Use the same day format as `bodyCompFormat.js:formatDay`.
- Text buttons "Add a scan" (`-05b`) and "Change these" (`-62`, `-62c`) start about 16 px to the right of the text column above them.

**Calorie plan and quick target**
- In the quick target, Save is below the result card and off the first screen (`-62-quick-target-light.png`, `-62c-quick-target-first-dark.png`). Make it a bottom thumb button, as the weight and BP dialogs do.
- The full wizard's comparison still says "Your saved plan was calculated with a formula error fixed on Sep 20" (`-17-wizard-old-vs-new-dark.png`, desktop too). That was true two months ago; "Your saved plan uses an older formula" ages better.

**Reports**
- "Weight & body →" appears twice in a row, once under the Weight card and once under Body composition (`-07u-reports-body-dark.png`).
- On an empty week the page says "Nothing stands out yet." twice, in "What stands out" and in the AI "Trends" card (`-66c-reports-empty-dark.png`). One of them could say what to do ("Log a few days and I'll look for patterns").

**Blood pressure**
- The duplicate-time warning offers "Save it one minute later" while the main "+ Save" stays enabled below it (`-68a-bp-dialog-duplicate-dark.png`), which leaves two save paths and no word on what the main one does now.

**My foods, More**
- My foods marks the source with a coloured dot (grey or green), and only the green one also has words ("My foods") (`-26-my-foods-recipe-dark.png`), so colour is the only signal for the grey ones.
- My foods says "Your custom entries and everything you've saved", More says "Foods you made yourself", and the list holds branded Fage and Blue Diamond items (`-26`, `-24-more-dark.png`). One description would do.
- More orders sections differently by mode: "Look up a specific food" is first under Food in Full and last under Everything else in Simple (`-24`, `-24a`). This is fine if deliberate; noted for consistency.

**Settings**
- The Health alerts sleep apnea card (SpO2) is still in Full Settings (`-61b`, `-61d`). This is the owner's open call (SUITE_TODO §4); not proposed against.

**Scan import**
- Below the drop zone the page is empty (`-12-scan-import-dark.png`). A "Last import: Nov 18, 14 scans" line would confirm that the Nextcloud folder import is working without a trip to Weight.

**Desktop**
- Page widths vary with no clear rule: Home and Reports use the full content width, while Log, Weight and BP sit in a column of about 935 px, Settings about 795 px and the calorie plan about 775 px (`-01-home-light-desktop.png`, `-02-log-dark-desktop.png`, `-05-weight-light-desktop.png`, `-07-bp-dark-desktop.png`, `-61-settings-full-light-desktop.png`, `-17-wizard-old-vs-new-dark-desktop.png`). Pick two widths (reading and dashboard) and apply them by page type.
- On desktop, Simple's "big buttons" become ordinary 15 px type (`-19-simple-home-dark-desktop.png`). That is fine for a desktop, but Larger text is the only way to get the phone scale back.

### Screens with no harness scene (unaudited)
- `/login` (shared `LoginSplash`) and `/register` (a redirect to `loginRedirect`).
- `/food-search`, "Look up a specific food" (the More entry): the page itself, its results and its empty and error states.
- The barcode scanner (camera permission, no camera, no match).
- My foods: the "New food" and "Edit food" dialogs (`FoodEditDialog`) and delete. Only the recipe builder has a scene (27).
- My meals: edit (`Meals/EditMealDialog.jsx`).
- The Log page's calendar date picker (the icon next to "Today").
- The weight "Change goal" dialog, unless the other reviewer's 53* covers it.
- BP: the "View report" PDF view (`BPReport.jsx`), and editing or deleting a reading from the BP log list.
- Medications: edit, delete and "export it for your doctor"; the Full medication list below the add form.
- Scan import after a file is chosen: preview, confirm, parse error, file too large.
- Calorie wizard steps 1–3 in Full (only the scan-source step 16 and step 4 have scenes).
- Settings: leaving or joining a household (confirmation), "Update Garmin login" success or error, and Sign out.
- The update prompt (`PWAUpdatePrompt.jsx`).
- No tablet scenes. That is correct: tablet scope is NoteGeek and TodoGeek only.

### How this app handles shared concerns
- **Login:** the shared `LoginSplash` (`pages/Login.jsx`); Register redirects to BaseGeek's login.
- **Navigation:** on phones, a bottom bar (Home · Log · Weight · More) plus a hamburger drawer and the suite app grid in the top bar; on desktop, a dark chalkboard sidebar grouped Today / Check-ins / Food / Body and activity / Looking back. Simple trims the sidebar to Home, Food log, the check-ins and More.
- **Search:** the composer doubles as search when the words are short (`-29`); there is a separate "Look up a specific food" page, a local search box on My foods, and a button-driven medication search in Full.
- **Add:** Simple: "What did you eat?" plus a per-meal "+ Add" on Home and "Weigh in +" / "Log BP +" chips. Full: per-meal "+ Add", the composer on Log, plus a + FAB. Weight and BP use extended FABs ("Log weight", "Log BP").
- **Delete / undo:** an × or trash icon removes at once, with an Undo toast (food, weight, BP, meds); My meals delete asks for confirmation.
- **Toasts:** the suite `GeekToastProvider`; a bottom card with icon, message, Undo and ×.
- **Empty:** a dashed-outline card with an icon, one sentence and one primary button (`-63`, `-12`); Reports uses "Nothing stands out yet."
- **Error:** an inline sentence with a red-outline icon under the action ("That didn't go through. Tap Log it to try again."); offline shows an inline note plus a bottom banner.
- **Loading:** the action button's label changes ("Working it out…"), then "Still working — this one's taking a moment." after 8 s.
- **Settings:** one page of section cards, saved on change with a "Saved" toast; Simple shows experience and About you, with the rest behind "More settings". `/profile` redirects to `/settings#you`.
- **Updates:** the update is deferred until the page is hidden, with no "Updating" pill (deliberate, SUITE_TODO §3).
- **Date formats:** "Wednesday, November 18" (greeting), "Nov 18", relative "Today / Sunday / Thursday" in the weight log, "Wed, Nov 18, 2026" (edit header), "11/18/2026" (native inputs), and chart axes in both "Nov 1" and "Nov 01".
- **Number formats:** commas at 1,000; "cal", "lb", "mmHg", "bpm", "g"; tabular figures.

### Works well — keep
- Simple Home: "What did you eat?" above the fold, "You have 1,538 calories left today", the plate ring in meal colours, "Scrambled eggs ×2" on the cards, and "Did you take your meds?" with big ticks (`-19`, `-19a`).
- The composer and its states: "Say it like you'd tell a friend", "Just log 'fage'" for short queries, the result card with Fix, "Log this to yesterday? [Yes] [No, today]", and the honest offline and failure lines (`-28` to `-36`).
- "Same as yesterday's breakfast" and "Same as Sarah's breakfast" cards outlined in the meal's own colour; the add sheet's title naming the day ("Add to Tuesday's dinner (yesterday)", `-36`).
- Copy meal's "Fill in: yesterday's dinner → today's dinner" shortcuts (`-04`).
- The Simple quick target ("How fast?" with three plain speeds and "Using 220.6 lb (your 7-day average), 5'4", age 52. Change these") (`-62*`).
- The Simple medication add ("What's it called?" / "When do you take it?"), and the Yesterday tab with "Ticks here are saved for yesterday." (`-63a`, `-65`).
- The weight dialog's "You already have 218.7 for today. Saving replaces it."; the BP dialog's "This reading is High (stage 1)" and "Save it one minute later" (`-06`, `-68a`).
- Body composition's plain labels ("Belly fat score (visceral fat) · Your scale's own scale; lower is better", "Everything that isn't fat") (`-05b`).
- Reports' honesty lines and the AI footers ("Written by AI from your last 7 days of logs · 9:40 AM · It can be wrong — check the numbers above.") (`-66b`).
- Market Morning in both themes; the desktop chalkboard sidebar with the yellow-dot wordmark; meal cards on desktop in a 2×2 (Full) or 4-across (Simple) grid.

### Bugs noticed in passing
- The BP Save button is enabled with every field empty (`QuickAddBP.jsx:247`); I did not check what an empty save does. Listed under finding 8 as UX; flagged here in case it posts.
- Settings' "Your goal" never reflects an existing weight goal or calorie plan (finding 4); that is a data gap as much as a design one.

---

## FitnessGeek (part B: scenes 40–59) — design and UX review

Scope: the add sheet's row, chip, ribbon, household, offline, describe-outcome, serving-sheet and mic states (40–49); the Food log, Edit entry, Copy a meal, household view and Save as a meal (50); My foods and My meals (51); Home states (52, 55, 57); Weight (53, 57); More (54); the error boundary (56); Activity and the Health dashboard (58–59). Phone screenshots were read in light for every scene and in dark for the main screens; desktop for the main screens and wherever the phone raised a question. Simple mode is Heather's, Full is Chef's.

### Verdict
The add sheet is in very good shape. Row taps, Again chips, "Make it 2", the ribbon with Done, the household pick, the offline words and every describe outcome read clearly on the phone in both themes, and the October fixes hold. The biggest gains are now in flows a still image cannot show. In Simple, the Weight page's "Set your goal" and "Change goal" lead to a calorie form that has no goal-weight field. "Amount" on a row that is already added logs a second entry. A second tap on "Same as …" copies the whole meal again. On a 1280 px desktop the add sheet cuts food names to one word. After those, the Food log hides the log below a full-height add box, and the Garmin pages (Full only) are the least finished part of the app.

### Top findings (ranked, at most 12)

#### 1. Simple has no way to set or change a weight goal
- Where: Weight page, "Change goal" (scene 53a) and the empty state's "Set your goal" (57e); both route to `/calorie-wizard`.
- Evidence: fitnessgeek-53a-weight-goal-simple-light.png, fitnessgeek-57e-weight-empty-simple-light.png; `pages/Weight.jsx:133` (`onEditGoal={() => navigate('/calorie-wizard')}`); `components/FitnessGoals/AIGoalPlanner.jsx:111` (Simple always gets QuickTarget); `components/FitnessGoals/QuickTarget.jsx:164` passes the existing `targetWeight` through and its only fields are weight now, height, age, sex and "How fast?" (`:244-285`). Settings has no goal-weight field either (grep of `pages/Settings.jsx`, `components/Settings`).
- Seen or inferred: CODE (the buttons are SEEN; where they lead is read in code)
- Problem: Heather taps "Change goal" to change 195 lb and lands on "Set your daily target", which never asks for a goal weight. A new Simple user who taps "Set your goal" saves a calorie target and comes back to "No weight goal yet". It is a dead end, and the button's word ("goal") points to a different thing (a calorie target) than the card it sits on (a weight goal).
- Proposal: phone first, give the quick form one more question when it is reached from Weight: "What weight are you aiming for?" with one number field, prefilled with the current goal, above "How fast?". Or open a one-field goal sheet from Weight and leave the quick target alone. Rename the button to match where it goes if neither is done. Desktop is the same form.
- Size: S–M
- Needs a decision from the owner? yes: a goal-weight question in the quick form, or a separate goal sheet.

#### 2. "Amount" on a row that is already added logs a second entry
- Where: add sheet rows after a tap (scenes 40, 40a, 42b), both modes.
- Evidence: fitnessgeek-40-row-tapped-once-light.png (the Egg row reads "Added ✓" and still offers "Amount" beside "Make it 2"); `components/FoodSearch/FoodComposer.jsx:965-973` (the serving sheet's confirm calls `logFoods`, which always writes a new entry and does not update `addedByKey`).
- Seen or inferred: CODE
- Problem: Heather taps "Egg" (one egg logged), then thinks "it was three" and uses the obvious control, Amount → 3 → Log it. The log now holds four eggs in two entries, and the row still says "Added" for one. "Make it 2" is the right tool, but "Amount" is the one that looks like it changes the amount.
- Proposal: once a row or chip is added in this sitting, its Amount opens the serving sheet in edit mode for that entry: title "Change Egg", button "Save", and saving sets the servings (the `setServings` path already exists). On a fresh row, Amount stays as it is. Desktop is the same.
- Size: S
- Needs a decision from the owner? no

#### 3. "Same as yesterday's / Sarah's …" has no "Added" state, so a second tap copies the meal again
- Where: the household and yesterday picks in the add sheet (scenes 45, 45a, 46), both modes; also inline on the Food log.
- Evidence: fitnessgeek-45a-same-as-household-tapped-light.png (after the tap the card looks the same as before, apart from losing its tint, and the ribbon says "1 added to dinner · 631 cal" for three foods); `components/FoodSearch/QuickPicks.jsx:95-145` (no `added` handling for these buttons, only for chips); `FoodComposer.jsx:359` (household meals are excluded from the second-tap rule).
- Seen or inferred: SEEN + CODE
- Problem: the October review records that Heather taps twice "to be sure". Rows and chips now absorb that habit. These big cards do not: a second tap writes salmon, rice and beans again. The ribbon's "1 added" also undercounts what she just put in her log.
- Proposal: phone first, after a successful tap the card turns into its done state, "✓ Sarah's dinner · Added" with the food list kept, and a second tap does nothing or offers Undo. The ribbon counts foods ("3 added to dinner"), not picks. Desktop is the same.
- Size: S
- Needs a decision from the owner? no

#### 4. On a 1280 px desktop the add sheet cuts food names to one word
- Where: the add sheet at the `lg` breakpoint (scene 43b; 40 and 45 desktop show the same layout). Chef's desktop, both modes.
- Evidence: fitnessgeek-43b-long-names-desktop-lg-light-desktop.png ("Breaded…", "CHOCOL…", "Queso…", and "Fage Total…" twice) against fitnessgeek-43a-long-names-desktop-md-light-desktop.png (1000 px: full two-line names); `components/FoodSearch/FoodResultRow.jsx:236` (`WebkitLineClamp: { xs: 2, lg: 1 }`) and `:270-292` (macro column and source chip at `lg`), inside `components/FoodLog/AddFoodDialog.jsx:86` (`maxWidth="sm"`, 600 px).
- Seen or inferred: SEEN + CODE
- Problem: the breakpoints follow the window, not the 600 px dialog. On the widest screen the row gets the narrowest name, which repeats the "Fage 0% or 2%?" problem the October review fixed for phones (A4/L13).
- Proposal: keep the `md` row layout (two-line name, macros in the subtitle) whenever the row is inside the dialog, for example with a container query or a `compact` prop from AddFoodDialog. Or widen the dialog to `md` at `lg`. The phone does not change.
- Size: S
- Needs a decision from the owner? no

#### 5. The Food log opens on the add box, and the log is below the fold
- Where: Food log, both modes (scenes 50a, 57c, 57d; 50 and 50b are scrolled past it).
- Evidence: fitnessgeek-50a-simple-log-yesterday-light.png (on Yesterday, the first 844 px show the date card, "Add to Tuesday's dinner (yesterday)", the box, Log it, the meal chips and "Same as Sarah's dinner", and not one meal); fitnessgeek-57d-empty-log-simple-light.png (Breakfast starts about 700 px down); `pages/FoodLog.jsx:563-604` (the comment says "on THIS page the meals below are what you came to see", yet the full composer sits above them).
- Seen or inferred: SEEN
- Problem: the Log tab is where she checks what she ate. Every day she moves to with ‹ › needs a scroll, and the scroll then takes the date label off screen. Home already leads with "What did you eat?", and every meal section has its own Add.
- Proposal: phone first, collapse the inline composer on this page to a single "Tell me what you ate" field (about 56 px) that expands to the full box, chips and picks on focus. The meals then start under the date card. Desktop can keep it expanded.
- Size: M
- Needs a decision from the owner? yes: it reverses the "search box inline" choice on this page.

#### 6. Full Food log: the "Log food" button sits on the meal sections' "+ Add"
- Where: Food log, Full (scenes 50b, 57c).
- Evidence: fitnessgeek-50b-full-log-today-light.png (the round "+" covers Dinner's "+ Add"); fitnessgeek-57c-empty-log-light.png (it covers Breakfast's "+ Add"); `pages/FoodLog.jsx:345-350` (the shell primary action, hidden only in Simple).
- Seen or inferred: SEEN
- Problem: Chef has three ways to add on one screen (inline box, per-meal Add, the button), and two of them overlap, so he can hit the wrong one. On first load the covered pill is the one for the current meal. The icon-only round "+" is the least clear of the three.
- Proposal: hide the primary action on this page in Full too, as Simple already does: the box is on the page and every meal has Add. If it stays, give the page's last element bottom padding equal to the button's height and offset, and show the label ("Log food") as the other pages do.
- Size: S
- Needs a decision from the owner? no

#### 7. The add sheet counts two ways and offers Undo twice
- Where: add sheet, both modes (scenes 40a, 41b, 42, 45a).
- Evidence: fitnessgeek-40a-row-tapped-twice-light.png (row "2 added", ribbon "1 added to breakfast"); fitnessgeek-41b-again-chip-toast-x2-light.png (chip "Sourdough Toast · 2 added", ribbon "1 added to lunch"); fitnessgeek-42-ribbon-with-toast-light.png (toast "Added to breakfast ✓ · / Egg · Undo" over the Egg whites row, with "Undo last" 60 px below); `components/FoodSearch/SessionRibbon.jsx:106` (`{items.length} added`).
- Seen or inferred: SEEN
- Problem: "2 added" on the row and "1 added" on the ribbon look like a contradiction. One counts servings and the other counts entries, and nothing says so. For ten seconds two Undo buttons for the same action sit stacked, and the toast covers the next row she might want.
- Proposal: phone first, the ribbon names what it counts: "Egg ×2 · 144 cal" for one item and "2 foods · 89 cal" for more. Inside the sheet, where the ribbon is already up, the toast can drop its Undo (or be skipped), so there is one Undo in one place. Keep the toast when the sheet closes.
- Size: S
- Needs a decision from the owner? no

#### 8. The mic looks enabled when it is off, and its stop sign is nearly invisible
- Where: the composer mic, both modes (scenes 47, 47a offline; 49m listening).
- Evidence: crops of fitnessgeek-47-offline-sheet-light/dark.png against fitnessgeek-45-same-as-household-light/dark.png (offline, the full green ring stays and only the glyph turns brown-grey); fitnessgeek-49m-mic-listening-interim-light.png (white square on a near-white disc) and -dark.png (dark square on a dark disc); `components/FoodSearch/ComposerBox.jsx:188` (the border is `primary.main` whatever the disabled state).
- Seen or inferred: SEEN + CODE (why the listening disc is not filled was not traced)
- Problem: offline, a ring that looks live invites a tap that does nothing. While listening, the button she would press to stop shows no visible sign. The Done in the listening strip saves the flow, but the round button reads as broken.
- Proposal: disabled means a `divider`-coloured ring and a grey glyph. Listening means a filled primary disc with a contrast stop glyph, or a "Stop" label, and the harness checks its contrast.
- Size: S
- Needs a decision from the owner? no

#### 9. The amount is set three different ways in three places
- Where: the serving sheet (49, 49a, 49b), Edit entry (50c, 50d) and the composer's meal chips; both modes.
- Evidence: fitnessgeek-49-serving-sheet-servings-light.png (a centred stock MUI dialog, a small grey ToggleButtonGroup whose selected state is a grey fill, a − field + stepper, a Meal dropdown, and "Log it"); fitnessgeek-50c-edit-entry-simple-light.png (a slider from 0.25 to 10 plus a field, and a Meal dropdown); `ServingSheet.jsx:83` (plain `Dialog`, not PremiumDialog) and `EditLogDialog.jsx:250-268`.
- Seen or inferred: SEEN
- Problem: Heather learns one way to set an amount in the sheet and meets another in Edit entry. The meal is a chip row in the sheet behind and a dropdown in the dialog on top of it. The serving sheet's "Log it" is the same label as the composer's main button with a different job. The selected unit (grey on grey) is hard to tell from the others, and the dialog is the one stock-Material surface in the add flow.
- Proposal: one amount control everywhere: the − [n] + stepper with the unit toggle as the suite's pill chips, selected in basil. The meal is the same four chips. On the phone the serving sheet becomes a bottom sheet (PremiumDialog), and its button says what it does: "Add 1.8 oz" or "Add 2 servings". Drop the slider from Edit entry.
- Size: M
- Needs a decision from the owner? no

#### 10. Full Weight says "behind" four times, in cards inside a card
- Where: Weight, Full (scene 53, phone and desktop).
- Evidence: fitnessgeek-53-weight-goal-full-light.png: the "Behind plan" chip; "Your pace: You're losing 0.7 lb a week… you'd need 1.6." (no unit on 1.6); "Time left 6 weeks / 44 days until Jan 2, 2027"; "At this pace: well past your goal date / At this pace the finish is more than twice the plan's length out"; then "Off track" in the chart legend. Three bordered tiles sit inside the goal card.
- Seen or inferred: SEEN
- Problem: the main fact ("you need 1.6 lb a week and you are doing 0.7") gets diluted by repetition, and the card stack pushes the trend chart off the first screen.
- Proposal: phone first, one headline sentence in the goal card ("Losing 0.7 lb a week; Jan 2 needs 1.6 lb a week") with the chip, and "6 weeks left" as a plain line under it. Drop the "At this pace" tile, because the chart's dashed line and "Off track" already say it. No nested borders.
- Size: S
- Needs a decision from the owner? no

#### 11. The Health dashboard on a phone spends the first screen on chrome
- Where: Health dashboard, Full (scenes 59, 59a–59f).
- Evidence: fitnessgeek-59a-health-overview-light.png (a 230 px "Day" card holding a native "11/18/2026" field and Yesterday/Today links, then five scrolling tabs cut to "Meal impa", "verview" and "leal impact"); a "Settings" pill in the page header and a "Settings" tab that do the same thing (`pages/HealthDashboard.jsx:163-168` and `:233`); "from the home data server" and "(InfluxDB)" as user copy; fitnessgeek-59b-health-sleep-light.png ("Good ✅" emoji in an amber chip; "6 h 52m" against Activity's "1h 14m"); fitnessgeek-59d-health-recovery-light.png (the Recovery coach card in stock navy blue); fitnessgeek-59c-health-meal-impact-light.png (the chart title squeezed into a 100 px column beside the toggle, and vertical bar labels running into each other).
- Seen or inferred: SEEN
- Problem: on the phone, the content Chef came for starts about 560 px down. The tabs hide their own names. Copy, blues and emoji fall outside Market Morning. The Garmin page merge in `DOCS/SUITE_TODO.md` §4 is still open; this finding is the phone polish that is worth doing whether or not that merge happens.
- Proposal: phone first, replace the Day card with a single "‹ Today ›" stepper in the page header (the Food log's DateNavigator), drop the header Settings pill, and use icon-over-label tabs that fit (four tabs, with Settings moved into the page's overflow) or short labels. Recolour Recovery and the info boxes from the theme's info/primary tokens, drop the emoji, use one duration format ("6h 52m"), and stack the meal-impact title above its toggle.
- Size: M
- Needs a decision from the owner? no (the page merge is already his open call)

#### 12. "Household food logs" is the one meal surface without Market Morning
- Where: Food log → "What your household ate", Full (scene 50g).
- Evidence: fitnessgeek-50g-household-view-light.png and -light-desktop.png: stock Cards, the same green fork icon for every meal, "1 serving • 310 cal" bullets where the rest of the app uses "·", and the "Whose log" label clipped at the top of the dialog on desktop and touching the header on phone; `components/FoodLog/HouseholdLogView.jsx:174-240`.
- Seen or inferred: SEEN + CODE
- Problem: every other meal list (Home cards, Food log sections, the picks) uses the produce colour and icon per meal. Here breakfast, lunch and dinner look identical, so scanning Sarah's day is slower.
- Proposal: reuse the Food log meal-section header (produce tint, meal icon, "Copy to your log" as its action) and the Simple Food log row style. Give the Select top margin so its label clears the dialog header. Desktop is the same.
- Size: S
- Needs a decision from the owner? no

### Smaller findings

Add sheet (40–49)
- The ribbon wraps to three lines on the phone ("1 added to / breakfast / 72 cal") because Undo last and Done take most of the row: fitnessgeek-40-row-tapped-once-light.png. Shortening Undo last to an icon plus "Undo", or putting the calories after a "·" on the first line, keeps it to two lines. Both modes. SEEN.
- A long Again chip truncates to "Breaded Southern Fried Chicken Br…" once "Make it 2" joins it, and "Make it 2" touches the sheet's right edge: fitnessgeek-41c-again-chip-long-name-added-light.png. Both modes. SEEN.
- The toast's wording "Added to dinner ✓ · Sarah's dinner" wraps mid-phrase on the phone (fitnessgeek-45a-…-light.png, fitnessgeek-42-…-light.png). "✓ Sarah's dinner added" fits on one line. SEEN.
- The partial result repeats itself: the row "Chicken soup, 1 bowl" is followed by "Added Chicken soup, 1 bowl. I couldn't work out 'crackers'" (fitnessgeek-48d-partial-result-light.png). Keep only the second sentence. Simple. SEEN.
- "Nothing understood" (48e) offers no next step except retyping. When a name-like word is present, showing "Or pick an exact food" (as 48 does) would give her one. Simple. SEEN.
- The mic-denied message and other info boxes use stock MUI pale blue (49n, 59, 59f), the one colour outside Market Morning in the sheet. SEEN.
- Full's "Just added" strip is a bordered card inside the meal card and says "Undo", while the Simple result card says "Undo all" for the same action (fitnessgeek-48c-full-just-added-no-toast-light.png against 48b). SEEN.

Food log, Edit entry, Copy a meal (50)
- Full rows wrap the macros mid-value, leaving a lone "g" on its own line ("P 12 · C 2 · F 10 / g", "F / 11 g"): fitnessgeek-50b-full-log-today-light.png. Each value needs a no-wrap span. Full. SEEN.
- Full Edit entry truncates its labels to "Calories (per servi…" in a two-column grid on the phone: fitnessgeek-50d-edit-entry-full-light.png. Use one column on `xs`, or put "(per serving)" once as a subheading. Full. SEEN.
- Simple Edit entry gives a large "Notes (optional)" box as much room as Calories; she never sees notes anywhere else in Simple. Consider hiding it in Simple. SEEN (50c).
- Every date input shows numeric "11/18/2026" (Edit entry, Copy a meal, Log weight, Health dashboard), against the copy rule "Oct 13, never numeric". The native input is right for picking; a "Wed, Nov 18" read-out on the field would match the rest of the app. Both modes. SEEN.
- The calorie strip has two layouts: Full puts "0 cal" left with a gear icon; Simple puts it right with "33%" floating on its own line between the number and the bar (fitnessgeek-50a-…, 57c, 57d). "Typical day: 2,000 cal" is the SUITE_TODO §4 item and still holds. SEEN.
- Copy a meal's "Fill in: yesterday's dinner → today's dinner" pills only fill the form, so it is still a second tap on Copy. Labelling them as actions ("Copy yesterday's dinner") and copying straight away with Undo would save the tap. Full. SEEN (50e).

My foods, My meals (51)
- My meals shows its title three times: the app bar "My meals", a "Library · Meals" eyebrow and an h1 "My meals". My foods, its sibling page, shows only a subtitle (fitnessgeek-51b-…, 51a-…). Activity also repeats its title in an h1 (58). SEEN.
- My foods marks each food's source with a coloured dot (green, grey, orange) that has no legend or text, so colour is the only signal: fitnessgeek-51a-my-foods-sources-light.png. The source name is already in the subtitle for some rows; dropping the dot, or adding the source word to every row, fixes it. SEEN.
- My foods is described three ways: More says "Foods you made yourself", the page says "Your custom entries and everything you've saved for quick access", and the empty state says "Foods you create, and foods you log often". SEEN (54, 51a, 51).

Home (52, 55, 57)
- After a reload fails, the food she just removed stays on the card, highlighted, while the toast says "Removed Greek yogurt"; the "Can't reach FitnessGeek" line is above the fold (fitnessgeek-52b-home-reload-failed-full-light.png). Grey out or strike through the removed row, or repeat the line on the card. Full (the same code serves Simple). SEEN.
- Full Home for a new account shows "Protein 0 of 0g", "Carbs 0 of 0g", "Fat 0 of 0g" with empty bars (fitnessgeek-57g-home-empty-full-light.png; `components/Home/MacroStrip.jsx:21-32` has no branch for a goal of 0). Hide the strip until there is a target, or show "No target yet". Full. SEEN + CODE.
- On a failed load, Home quietly drops the "Weigh in" chip (deliberate per scene 52) while keeping "Log BP" and "Meds". A chip that vanishes reads as a missing feature; a disabled "Weigh in" would read as temporary. Both modes. SEEN.
- Simple Home has five large filled buttons on the first screen ("What did you eat?" plus four produce-coloured "+ Add"), and the empty Dinner and Snacks tiles stretch to match their neighbours, leaving about 150 px of blank tile (October's C8 still holds): fitnessgeek-52c-home-amounts-simple-light.png and -dark.png. The produce Adds are on-identity; making them tonal (tint fill, produce-coloured text) would leave "What did you eat?" as the one loud button. Owner's call. SEEN.

Weight (53, 57)
- The "Log weight" button covers chart axis labels (53a) and section headings mid-scroll ("What your weight is mad…", 53d), and on Simple's empty page it covers the third empty state's sentence at rest (57e). The page's last section needs bottom clearance like BloodPressure's (`pages/BloodPressure.jsx:352`). SEEN.
- Simple's empty Weight page stacks three empty states that say much the same ("No weight goal yet", "No weigh-ins yet. Weigh in and your trend shows here.", "No weigh-ins yet. Log a weight with the button below…"), and the loudest button is "Set your goal" rather than a first weigh-in (fitnessgeek-57e-weight-empty-simple-light.png). For a new user, lead with "Log your first weight" and fold the other two into one line. Simple. SEEN.
- "Log weight" is a full-screen dialog for one number and a date, with 600 px of empty space between the fields and the button (53b, 53c). On a phone a short bottom sheet that rides above the keyboard would keep context. Both modes. SEEN.

Activity, Health (58, 59)
- Activity's "Sleep" tile shows "6" (see Bugs). Its tiles use four different tints (green, orange, red, blue), where the rest of the app keeps colour for meals. Full. SEEN.

### Screens with no harness scene (unaudited)
- `/food-search` ("Look up a specific food" in More and the sidebar): no scene in the whole app.
- The barcode scanner (from "Scan a barcode" in the add sheet and on the Food log).
- My meals: the "Log this" dialog (`pages/MyMeals.jsx:139-150`, with its meal chips and day), the meal edit dialog (`components/Meals/EditMealDialog.jsx`) and its delete confirmation.
- My foods: the food edit and delete dialogs (`components/MyFoods/FoodEditDialog.jsx`, `FoodDeleteDialog.jsx`) for a non-recipe food.
- Weight → "Change goal" / "Set your goal" in Simple, end to end (finding 1); the quick target form itself is covered by scenes 62*, which belong to the other reviewer.
- Food log: the Full calorie panel (gear → `showCaloriePanel`), keto mode, a past day reached with ‹, and the household view when the other person has logged nothing ("hasn't logged anything").
- Copy a meal after Copy (the toast and the scroll), and Copy the whole day.
- The add sheet's "Pick crackers" result after a partial log (48d shows the button, not where it leads).
- Activity with a list of recent activities (58 shows the tiles and sleep; 58a shows the empty list).

### How this app handles shared concerns
- Login: not in these scenes. Inside the add sheet, an expired session shows "You're signed out. Sign in again." with a Sign in button, and the typed words are kept (48).
- Navigation: on the phone, a bottom bar (Home, Log, Weight, More) plus an app bar with a drawer, the suite grid and the avatar. On desktop, the dark "chalkboard" sidebar grouped as Today / Check-ins / Food / Body and activity / Looking back (54a). More groups Check-ins / You / Everything else (54).
- Search: My foods and My meals have a page search field. Food lookup happens in the composer (a name opens the list, "Just log 'fage'") and on "Look up a specific food".
- Add: Home "What did you eat?" plus a per-meal "+ Add". The Food log has the inline composer, a per-meal Add, and in Full a "Log food" primary button. On the phone the add sheet is a full-screen dialog; on desktop it is a 600 px top-anchored dialog.
- Delete/undo: removing is immediate with an Undo toast (Home ×, Food log trash, Edit entry "Remove"). The add sheet has "Undo last" on the ribbon, the result card has "Undo all", and the Full strip has "Undo". There are no confirm dialogs for food rows.
- Toasts: a bottom geek toast, about 10 s, with Undo and ✕, in success (green check) or info (blue i) tones. It rises above the sheet's ribbon.
- Empty: a dashed card with a round icon, one sentence and one action (My meals, My foods, BP, Activity). Home says "Nothing logged yet today" with a ring.
- Error: Home says "Can't reach FitnessGeek right now. What you logged is safe." with Try again. The error boundary says "Something went wrong. Nothing you saved is lost. Reloading usually fixes it." with Reload. The composer shows inline status lines with an icon (offline, nothing understood, signed out).
- Loading: "Adding…" with a spinner on the chip or pick being written, while the others dim (41d). Log it reads "Working it out…".
- Offline: a bottom banner ("You're offline. New entries won't save until you're back online."), the composer's status line, and the words kept across closing the sheet (47, 47a).
- Settings: More → Settings (scenes 60–61, the other reviewer's).
- Dates: headers say "Wednesday, November 18"; sheets say "Tuesday's dinner (yesterday)"; prose says "Jan 2, 2027"; charts say "Aug 1"; inputs show numeric "11/18/2026".
- Numbers: thousands commas ("1,484"), "cal" with numbers, "lb", "bpm", "g" attached ("31 of 78g"). Durations come in two forms ("1h 14m" and "6 h 52m").

### Works well — keep
- The add sheet's grammar: "Just log 'egg'" as an outline in name mode and a filled "Log it" in sentence mode (44, 44a); "Added ✓" then "2 added" with "Make it 2/3" on rows and chips; the ribbon with Done from the first item; and "Adding…" on the one chip being written.
- Backfilled naming: "Add to Tuesday's dinner (yesterday)" and "Same as Monday's dinner" (46).
- Describe outcomes in plain words: "Added to today" with a meal under each row (48b), "Pick crackers" (48d), "You said 'on Sunday'. This is in today's log. Move it to Sunday" (48f), "I heard: 'two eggs and toast'" (49o).
- The words survive offline and a closed sheet (47a). The disabled-not-hidden mic is the right idea; only its look is wrong (finding 8).
- Phone add-sheet rows: two-line names with "Brand · 6 oz · 150 cal" (43), and the sheet and box hold still while results arrive (49d).
- Home's failed-load honesty in both modes (52, 52a); "Egg ×2" on Simple Home (52c); "99 of 78g · 21 over" in words (52e).
- Simple Edit entry's single "Calories / For this whole entry." (50c); Log weight's "You already have 218.7 for today. Saving replaces it." with a "Replace" button (53b).
- Copy a meal's summary sentence, "Copy Sarah's dinner from Tuesday into today's dinner (3 foods)", with Copy at the thumb (50f).
- Empty states with one clear action (51, 51c, 57b, 58a), and the calm error boundary (56).
- The Weight chart tooltips and the body-composition card (53d, 53e).
- Dark mode across the sheet, Home and the Food log: produce tints stay legible and the ribbon and toasts separate from the page.
- The chalkboard sidebar and the desktop Food log column width.

### Bugs noticed in passing
- Activity's "Sleep" tile shows "6" for 6h 52m: `pages/Activity.jsx:414` builds "6h 52m" and `StatNumber` runs `parseFloat` on it (`components/primitives/StatNumber.jsx:89`), so everything after the 6 is dropped (fitnessgeek-58-activity-garmin-light.png).
- The serving sheet's Log it on a row that is already added creates a duplicate entry (finding 2; listed there because it is a UX trap as much as a bug).

---

## NoteGeek — design and UX review

Evidence: today's harness run `tools/mobile-harness/out/par-notegeek/notegeek/` (296 shots, phone + desktop, both themes). Tablet notes rest on `out/wave3-note-tablet/` and `out/wave3-note-tablet-40b/` (2026-11-16, older than `main`, layout only), and say so. Code paths are under `apps/notegeek/frontend/src/`. Items already listed in `DOCS/NOTEGEEK_TODOGEEK_REVIEW_2026-11.md` are not re-reported as new; the ones I saw still holding are listed once, under "Already known, still holds".

### Verdict

NoteGeek is in good shape. Graphite is consistent and calm, the capture box on Home is a strong front door, and the hard flows have been thought through: autosave, restoring drafts, conflicts, Recently deleted, fold-in with a preview. The biggest gains now are on the note page itself. On a phone the top chrome pushes the text down by about a third of the screen. The read view and the edit view are two different pages with different headers, dates and actions. On a bad day the save state is shown three or four times. After that, the AI features still use engineer language (model ids, "fragments", "one pass"), and a handful of stock Material and library pieces (blue info alerts, React Flow controls, the tldraw rainbow palette) break the Graphite look.

### Top findings (ranked, at most 12)

#### 1. On a phone, the note page spends about a third of the screen before the first line of text
- Where: `/notes/:id/edit` (every text, markdown and code note), phone
- Evidence: `notegeek-03-editor-light.png`, `notegeek-08-editor-code-dark.png`, `notegeek-21a-restore-draft-banner-light.png`; `components/navConfig.jsx:28-38` (every note route is titled "Notes"); `pages/NoteEditorPage.jsx:1562-1590` (NoteMetaBar with Back as `leading`)
- Seen or inferred: SEEN
- Problem: the global top bar ("Notes", the app grid, the avatar, ~62 css px) sits above a second row that holds only "← Back" and "⋯" (~60 px). Below those come a 2 rem title, the type and save stamp, and the tag row. The body starts about 265 css px down an 844 px screen (`03-editor`), and lower still when a banner shows (`21a`). The top bar's "Notes" says nothing that Back does not already say. The planning doc records ~35 % for sketches; text notes are nearly as bad and are the daily case.
- Proposal: on a phone, on a single note (the routes where `hidesBottomBar` is already true), turn the top bar into the note bar: ← on the left, the loud save pill and ⋯ on the right, and no title, app grid or avatar. That removes one whole row. Shrink the phone title from 2 rem to about 1.5 rem, and keep the type · stamp line and the tag row as they are. Desktop: no change, because the sidebar and top bar earn their place there.
- Size: M
- Needs a decision from the owner? Yes: whether the app grid and avatar may leave the top bar on a single note (the suite pattern elsewhere keeps them).

#### 2. Reading and editing a note are two different pages that disagree with each other
- Where: viewer `/notes/:id` versus editor `/notes/:id/edit`, phone and desktop
- Evidence: `notegeek-03v-viewer-light.png` vs `notegeek-03-editor-light.png`, `notegeek-18c-links-viewer-light.png`, `notegeek-03v-viewer-light-desktop.png`; `components/NoteViewer.jsx:139-244` (icon bar: Back, Edit, Fold in, Print, Archive, Delete); `components/notes/NoteActions.jsx` (editor ⋯: Save now, Print, Pin, Version history, Fold in, Compose, Convert, Archive, Delete)
- Seen or inferred: SEEN (layout), CODE (action sets)
- Problem: the same note shows two headers (an icon bar with "Tт Rich text" against a "← Back" text button with ⋯) and two date styles (a monospace "Wed, Nov 18, 2026, 07:20 AM" against "saved · 2h ago"). It also shows two grounds: a bordered card in the viewer, plain sheet in the editor. The two pages offer different actions. Pin, Version history and Compose cannot be reached from the viewer at all. On a phone the viewer's actions are five bare icons whose names live in tooltips a finger never sees, and the fold-in icon (a merge glyph) is unreadable. Print gets a front-row slot on a phone, where it is rare. The bullets in the viewer also hang outside the card's text column (`03v` phone: dots at ~9 css px, text at ~11).
- Proposal: this is the small step toward Tier 7.2, not Tier 7.2 itself. Give the viewer the editor's header: ← Back, the type · stamp line in the same format, and the same ⋯ menu with the same items, with Edit as the one visible button (the pencil, labelled "Edit" from 600 px up). Drop Print, Archive and Delete from the viewer's top row into ⋯. Use one date grammar on both pages ("saved 2h ago", with the full date in the history dialog). Desktop gets the same, with Edit labelled.
- Size: M
- Needs a decision from the owner? No (Tier 7.2, one surface, stays the owner's bigger bet).

#### 3. A failed save is announced up to four times, and the docked copy pushes the formatting tools off a phone
- Where: editor, failed or offline save, phone
- Evidence: `notegeek-03f-save-failed-light.png` (header pill, meta "not saved", toast, docked pill under the toast), `notegeek-03o-offline-unsaved-light.png` (docked "offline · Retry" pill; only T, B, I are left visible of the markdown tools), `notegeek-21b-conflict-dialog-light.png`; `components/editors/EditorToolbar.jsx:30-32, 103-111`, `pages/NoteEditorPage.jsx:1584-1588`
- Seen or inferred: SEEN
- Problem: the docked pill exists, per its own comment, for when "the note's own head has scrolled away". It also shows while the head is on screen, so the user reads "not saved" three times plus a toast. On the phone it takes about 200 css px of the tool row, and lists, checkboxes and quote scroll off to the side. They are still reachable by scrolling, but nothing on screen says so, and the problem lasts as long as the user stays offline.
- Proposal: phone first. Show the docked pill only while the header's SaveAlert is out of view (an IntersectionObserver on the head). When docked, shrink it to an icon plus "Retry" (the word "offline" is already in the head and the toast). Keep the meta-line stamp as the quiet status. Desktop: unchanged, since nothing docks there.
- Size: S
- Needs a decision from the owner? No

#### 4. Note-list previews run the heading into the body
- Where: Home, Notes, tag views, Archived, Recently deleted, and Related (the preview text)
- Evidence: `notegeek-01-home-light.png` ("Cookies Brown the butter first…", "Roadmap Draft agenda…"), `notegeek-21c-recently-deleted-light.png` ("Yesterday Today Blocked Replaced by…"), `notegeek-01-home-light-desktop.png` ("…the mobile pass Close out CSRF hardening Decide on flockg…"); `utils/previewText.js` has an `opts.shape` that keeps "heading — paragraph, item · item"
- Seen or inferred: SEEN; CODE for the existing option
- Problem: every row's second line reads as a garbled sentence, because headings and list items lose their boundaries. This is the line the eye scans to recognise a note, on every list, every day.
- Proposal: build the stored `preview` with the shaped form (an em dash after a heading, " · " between list items). If the server's `preview` is built elsewhere, give it the same rule. No layout change. Desktop is the same.
- Size: S
- Needs a decision from the owner? No

#### 5. The tag field's hidden "clear all" × removes every tag in one click
- Where: editor tag row, desktop and any fine pointer
- Evidence: `notegeek-10-editor-sketch-light-desktop.png` (a lone × at the far right of the tag row); `components/TagSelector.jsx:55-120` (MUI `Autocomplete` without `disableClearable`)
- Seen or inferred: SEEN on desktop, CODE
- Problem: MUI's default clear button shows on hover or focus with no label the user can see. One click empties the tags, and autosave stores the result. Version history can bring them back, but nobody will think to look there. On a phone it shows when the field has focus.
- Proposal: set `disableClearable`. A tag is removed with its own chip ×, which is already there.
- Size: S
- Needs a decision from the owner? No

#### 6. The AI features speak engineer: model ids, "fragments", "one pass", an unexplained "similar"
- Where: Related caption, transcript status, Compose (one note and many), photo review, search
- Evidence: `notegeek-05-suggestions-light.png` ("related notes ranked by llama-3.1-8b-instant"), `notegeek-10t-sketch-transcript-status-light.png` ("read by openai/gpt-4.1-mini via OpenRouter"), `notegeek-12c-sketch-compose-light.png` and `notegeek-20b-compose-many-draft-light.png` (chips "3 fragments", "6 fragments", "one pass", the model id), `notegeek-14h-search-hybrid-light.png` (italic "similar" before the tags)
- Seen or inferred: SEEN
- Problem: Heather uses this app too. The model id appears as a chip on four surfaces and as a caption on a fifth. "6 fragments" for two notes means nothing to a reader. The chip in the review dialogs is already known (3.11), but the Compose, Related and transcript-status copies are not on that list.
- Proposal: phone and desktop alike. Drop the model id from every user surface, or move it into one "About this reading" line inside ⋯ or a tooltip for Chef. Replace "N fragments · one pass" with "From 2 notes". In search, change the italic "similar" to "close in meaning", which matches the Related caption's wording, or explain it once in the results header ("3 results · 2 close in meaning").
- Size: S
- Needs a decision from the owner? Yes: whether Chef wants the model id visible anywhere (he may use it for debugging aiGeek routing).

#### 7. Stock pieces break Graphite: blue info alerts, stock switches, React Flow chrome, the tldraw rainbow
- Where: fold-in proposal, Compose from several notes, sketch More, mind map, pen picker
- Evidence: `notegeek-19b-foldin-proposal-light.png` and `notegeek-20b-compose-many-draft-light.png` (MUI blue "info" Alert), `notegeek-22a-sketch-more-light.png` and `19b` (default MUI Switch), `notegeek-09-editor-mindmap-light-desktop.png` (React Flow's default zoom controls, minimap, and connection dots on read-only nodes), `notegeek-03p-sketch-pen-dark.png` (12 saturated tldraw colours); `theme/graphite.js:1-30` ("ONE accent… error the one loud colour")
- Seen or inferred: SEEN
- Problem: Graphite's own rule is graphite ink, one highlighter fill, and one loud colour for errors. A blue info box is a fourth voice and reads as stock Material. The mind map, the one canvas without its own skin, looks like a library demo.
- Proposal: through the app theme only. Add a Graphite `MuiAlert` "info" variant: sheet ground, graphite rule, ink text, an outlined (i) icon in `lead`. Add a Graphite `MuiSwitch`: an ink thumb on a rule-coloured track, with the highlighter track when on. For the mind map, hide the handles in view mode, restyle the controls as a small Graphite pill (44 px on touch, which also clears the harness floor that keeps it out of the phone run), and style the minimap like the list thumbnails. For pens, put a graphite/ink row first (graphite, ink, blue-black, red pencil) and keep the rest behind "More colours".
- Size: M
- Needs a decision from the owner? Yes, for the pen palette only (whether to lead with pencil colours).

#### 8. Delete asks first and also offers Undo; Archive only offers Undo; restore works two ways
- Where: delete dialog, Archive, Recently deleted, Archived
- Evidence: `notegeek-04-delete-dialog-light.png` + `notegeek-21g-delete-undo-toast-light.png`, `notegeek-20e-archived-view-light.png` (select, then a yellow Restore bar), `notegeek-21c-recently-deleted-light.png` (Delete forever and Restore on every row); `components/DeleteNoteDialog.jsx:22, 45-67, 87` ("Delete Note"), `hooks/useArchiveNotes.jsx:18`
- Seen or inferred: SEEN, CODE
- Problem: a reversible delete (30 days, plus Undo) still costs a second tap through a modal, while Archive, which is just as reversible, does not. The two "put it back" pages use different patterns: per-row buttons on one, select mode with a bar on the other. On Recently deleted, "Delete forever" is plain ink beside an outlined Restore, so the one irreversible action looks the quietest. The dialog title is in Title Case ("Delete Note") while the menu says "Delete note".
- Proposal: phone first. Delete a note straight away, with the Undo toast, as Archive does, and keep the confirm only for "Delete forever" (which already has one, `21d`). On Recently deleted, use Archived's select-and-bar pattern (Restore as the bar's primary, "Delete forever" in error ink) so both bins work the same way. Use sentence case for the dialog title.
- Size: S
- Needs a decision from the owner? Yes: D1 chose "Cancel focused" for delete; dropping the confirm reverses that.

#### 9. Recently deleted lights the Home tab and titles itself "NoteGeek"
- Where: `/deleted` (and `/share`), phone
- Evidence: `notegeek-21c-recently-deleted-light.png`, `notegeek-19d-share-existing-light.png`; `components/PrimaryNav.jsx:35-45` (`/deleted` falls through to `'home'`), `components/navConfig.jsx:32-38` (no `/deleted` title)
- Seen or inferred: SEEN, CODE
- Problem: the user arrived from Notes, then Tags, then Recently deleted. The tab bar says they are on Home and the top bar shows the app name, so there is no sense of place and no visible way back to where they came from. Archived does this right ("Archived", Notes tab lit).
- Proposal: map `/deleted` to the Notes tab and the title "Recently deleted"; title `/share` "Shared". On the rail this already maps to Tags.
- Size: S
- Needs a decision from the owner? No

#### 10. The Tags sheet's close button is out of line and touches the filter field
- Where: Tags sheet, phone and tablet portrait
- Evidence: `notegeek-03t-tag-sheet-light.png`, `notegeek-07-tag-tree-light.png`, `notegeek-16c-tag-delete-dialog-light.png` (× ~10 css px below the title's baseline, its bottom on the field's top border); tablet `wave3-note-tablet-40b/…/notegeek-40b-tablet-tags-sheet-light-tablet.png` (same; older run)
- Seen or inferred: SEEN
- Problem: this is the main way to reach tags, Archived and Recently deleted on a phone. The crooked header is the first thing it shows, and the × target overlaps the field's top edge, so a tap near it can focus the filter instead.
- Proposal: put the title and × on one row with a centred cross-axis, and leave 8 px before the field. If the header comes from `@geeksuite/ui`'s GeekSheet, fix it there, since other apps likely show the same misalignment.
- Size: S
- Needs a decision from the owner? No

#### 11. Two words for text notes: the "Notes" filter, the "Note" type and "New note" all mean Markdown
- Where: Notes filter chips, editor stamp, New sheet
- Evidence: `notegeek-02-notes-list-light.png` (chips "All · Notes · Sketches · Code · Mind…"), `notegeek-01n-new-light.png` ("New note — Markdown, with a preview"), `notegeek-03-editor-light.png` ("Tт Rich text"); `components/notes/noteTypeMeta.js:21-27`
- Seen or inferred: SEEN, CODE
- Problem: on a page titled "Notes" with "12 notes", a chip called "Notes" reads as a second "All". "Rich text" shows in the editor stamp of old notes, but no chip or New entry ever mentions it, so a user cannot tell what it is or find more like it.
- Proposal: rename the Markdown chip and type label "Text" (or "Writing"), so the chips read "All · Text · Sketches · Code · Mind maps". Keep the "Rich text" filter where it is, last, as the code already orders it. The 390 px chip row then needs one scroll less.
- Size: S
- Needs a decision from the owner? Yes: the word.

#### 12. Select mode's Compose button counts the notes it will skip
- Where: Notes, select mode
- Evidence: `notegeek-20a-select-mode-light.png` ("1 will be skipped…" above "Compose 3 notes"); `components/select/SelectionBar.jsx:44, 122` (label uses `count`, not `usable`)
- Seen or inferred: SEEN, CODE
- Problem: the button promises three notes and the line above it says one will be dropped. The result dialog then says "1 note left out" (`20b`).
- Proposal: label it `Compose ${usable} notes`, and keep the hint line. Same on desktop.
- Size: S
- Needs a decision from the owner? No

### Smaller findings

Home and lists
- The relative time is set in the monospace stamp face, so "1d ago" reads as "1d  ago" with a wide gap, while Recently deleted sets "Deleted 1h ago" in the sans face. Use one face for times across lists (`01-home`, `21c`). SEEN
- Home's "Select" sits on the Pinned divider but selects across Pinned and Recent; on Notes it sits in the sort row. Put it in one place: the header row on both (`01-home`, `02-notes-list`). SEEN
- Filter chips at 390 px: the last chip is cut ("Min…", "Mi"). That works as a scroll cue, but there is no edge fade, and the A–Z sort sits right beside the cut-off chips (`02`, `16a`). SEEN

Editor and viewer
- A long title is clipped with no ellipsis on a phone too ("Recipe: brown butter chocolat", `03f`, `21a`), not only on the tablet that SUITE_TODO §11 names. Let the title wrap to two lines on phone. SEEN
- The sketch stamp reads "1d ago ·searchable", with no space after the dot (`10-editor-sketch`, also desktop). SEEN
- Suggestion chips are square-cornered outlined buttons with a tag glyph, while applied tags are round chips; the same tag looks like two different things one row apart (`05-suggestions`). SEEN
- The `[[` link picker sits flush against the toolbar with no gap or shadow edge, so it reads as part of the bar (`18a`). SEEN
- "Save now" leads the ⋯ menu in an app with no Save button. Move it below Version history; it is an escape hatch (`06-editor-menu`). SEEN

Sketch, photo, compose
- Compose (one note, `12c`) is a centred dialog over the sketch, while the transcript review (`12b`) and Send tasks (`12d`) are full-screen on a phone. Known in part as "three dialog grammars"; Compose is the remaining odd one. SEEN
- Fold-in proposal titles quote raw Markdown ("In "## Widow spiders"") with straight quotes, while the subtitle uses curly quotes ("Into “Spiders”"). Show the heading text without hashes (`19b`). SEEN
- "Keep as plain text" produces a title "From photos: Photos · 18 Nov 2026" and repeats it as the first body line (`13e`). SEEN
- The photo entry page has an eyebrow "New page" above "Photo of a page"; the word "page" twice reads as a stutter (`13a`). SEEN

Search
- Desktop `/search` still shows two search boxes, and the top bar's box does not show the current query (`14-search-light-desktop`). Known 4.12, still holds. SEEN

Desktop
- On a note, the top bar says "Notes" and no sidebar row is lit, so the page has no "you are here" (`03-editor-dark-desktop`, `03v-…-desktop`). Lighting the note's first tag or "All notes" would help. SEEN
- Desktop text in lists and meta is small (preview ~13 px, stamp ~12 px) against a 1280 px window with wide empty margins (`01-home-light-desktop`, `14-search-light-desktop`). Worth one step up at desktop widths; the measure is fine. SEEN

Accessibility
- The viewer's five action icons are labelled (`NoteViewer.jsx:161-244`, aria-label plus tooltip), but a phone user gets neither words nor tooltips. Covered by finding 2. CODE
- Applied-tag chips are MUI Chips ~26 px tall with a ~16 px delete glyph (`TagSelector.jsx:111`). The input row is 44 px, but each chip's × is a small target on a phone. SEEN, SUSPECTED on a device

Already known, still holds (from `NOTEGEEK_TODOGEEK_REVIEW_2026-11.md`)
- 3.11 Review dialogs: "Compose it" alone on a second row, helper text clipped under the footer (`12b`, `13c`).
- 3.12 `[[` picker preselects "New note "garage"" over the existing "Garage shelving plan" (`18a`).
- Tier 6 Suggestions panel offers tags already on the note (work, planning) and pushes the body down (`05`).
- Tier 6 Photo notes show `--- page 1 ---` and a literal `->` (`13c`, `13e`).
- Tier 6 Select mode: action bar plus tab bar take ~470 of 1992 device px (`20a`).
- Tier 6 Rename-tag is a full screen for one field (`16b`).
- Tier 6 Wide code clips with no wrap and no scroll cue (`08-editor-code-dark`).
- 5.5 Highlights inside words and on filler words for natural-language queries ("Sun·day", "log·in", "Every", "take"; `14i`, `14j`).
- Sketch chrome ~35 % of a phone (`10`, `03s`).

### Screens with no harness scene (unaudited)

- `/settings` (Settings.jsx): no scene at all.
- `/login`, `/register`.
- Version history dialog (NoteHistoryDialog): the menu item is checked, but the dialog itself has never been captured (3.7 says it is unusable on a phone).
- Mind map on a phone: desktop only (`scenes.mjs:1030-1035`, ReactFlow under the 44 px floor).
- Empty Home, empty Notes, empty tag, and search with no results; loading and error states of every list (Tier 6 "Both" item, still open). Only `21e` Recently deleted empty exists.
- The share target's failure state (3.8 says it is a dead end).
- Any editor with the keyboard open (the docked toolbar over the keyboard, the `[[` picker over the keyboard).
- Fold-in target picker search with results (`FoldTargetPicker.jsx`); the Archived banner on a viewer (only `20f`).
- Tablet: only the tags sheet is in the assigned 40b folder; all other tablet evidence is from 2026-11-16.

### How this app handles shared concerns

- Login: shared SSO (not reviewed; no scene).
- Navigation: phone tab bar Home · Search · New · Notes, with New as an outlined action and the highlighter pill on the current tab; the bar is hidden on a single note. Tablet portrait has a rail with Tags added (older shots). Desktop has a sidebar (Home, tag tree with All notes, Archived, Recently deleted) plus top bar.
- Search: its own tab on the phone; a top-bar box with "/" plus a page box on desktop (two boxes). Results combine word and meaning matches, with a "Best match" card and highlighter marks.
- Add: Home capture box (type, camera, pen) plus the New sheet (Note, Photo, Sketch, More: Code, Mind map, Import). On desktop a split "New note" button.
- Delete / undo: delete asks first and then gives Undo; there is a 30-day Recently deleted. Archive gives Undo with no confirm. Version history underlies everything.
- Toasts: bottom, sheet-coloured, green check for success, red for errors, Undo as a text action.
- Empty: Recently deleted has an empty state; others are unaudited. Desktop two-pane shows "Pick a note".
- Error: save failures are loud (error pill, Retry, toast); the conflict dialog offers Keep mine / Use theirs / Keep both.
- Loading: cached note shows at once; Home skeletons only with nothing on screen (per review status; not seen in a scene).
- Settings: in the account menu (route exists; unaudited).
- Dates and numbers: relative ("2h ago", "1w ago") in a monospace stamp in lists, switching to "Oct 9" when older. The viewer uses "Wed, Nov 18, 2026, 07:20 AM", the photo title "18 Nov 2026", and transcript status "Nov 17, 2026, 1:20 PM". That is three absolute formats in one app.

### Works well — keep

- The Home capture box: type-and-Save, camera, pen, Fold in on typed text (`01c`). It is the best front door in the suite.
- Graphite's restraint: ink, one highlighter fill for primary actions and selection, and an error red that only appears when something is wrong. It reads equally well in light and dark (`01-home` both).
- Autosave plus the quiet stamp, the restore-draft banner, and the conflict dialog's plain-English explanations (`21a`, `21b`).
- The fold-in flow: "The note changes only when you apply", per-change checkboxes, struck and new text (`19a`, `19b`).
- Transcript review: "What the model saw" next to an editable transcript, with [?] for doubtful words (`12b`).
- The New sheet: three common types up front and the rest behind "More" (`01n`).
- The tag tree with counts, sub-tags and "Rename or move" explaining the path syntax (`07`, `16b`).
- The desktop two-pane, list | note, with the selected row lit in highlighter (`40d`).
- The sketch bar's bottom/top/left/right placement and "Finger draws" (`22a`).

### Bugs noticed in passing

- "Compose 3 notes" counts a sketch it will skip (`SelectionBar.jsx:122`); see finding 12.
- The tag field's clear-all × is enabled (`TagSelector.jsx`, no `disableClearable`); see finding 5.
- `/deleted` maps to the Home tab and the "NoteGeek" title (`PrimaryNav.jsx:35-45`, `navConfig.jsx:32-38`).

---

## TodoGeek — design and UX review

Evidence: phone and desktop screenshots in `tools/mobile-harness/out/par-todo/todogeek/` (today, current with `main`); tablet screenshots in `out/wave3-todo-ci-tablet/todogeek/` (2026-11-17, a day older, used for layout only and flagged where a finding rests on them); code under `apps/todogeek/frontend/src`. Items already listed as open in `DOCS/NOTEGEEK_TODOGEEK_REVIEW_2026-11.md` or `DOCS/SUITE_TODO.md` are marked "still holds" rather than reported as new.

### Verdict
TodoGeek is in good shape. Red Pen is the most coherent identity in the suite: paper, ink, one red, a strike that means "done", and an add box that underlines what it understood as you type. Rows, the Upcoming timetable, Done and Search all read clearly in both themes. The biggest gains are on the phone's Today screen, which shows only two or three tasks above the docked add box. Next come repeats and reminders, which still have no visible way in (the plan's Phase 2 was never built). After that, the editor sheet and the login page are the two places where the identity falls back to stock Material or to the old BuJoGeek. A handful of small craft slips need tidying too: ripple blobs, a clipped swipe label, and hover icons over the time in the desktop pane.

### Top findings (ranked, at most 12)

#### 1. On the phone, Today shows only two or three tasks before the add box
- Where: Today, phone
- Evidence: `todogeek-01-today-light.png`, `-02-`, `-07-pinned-tag-filter-dark.png`; `pages/TodayPage.jsx` (hero, chips, Reorder line and carried-over line all above the list)
- Seen or inferred: SEEN
- Problem: On a 390 × 844 screen the first task row starts at about 274 px and the docked add box starts at about 510 px. That leaves roughly 236 px, or 2.5 rows, for the list. The page is about what to do today, yet the top bar ("TodoGeek"), the date hero (about 110 px), the chip row (about 60 px) and a line holding only "Reorder" (about 60 px) all come first. With a tag filter on, the "Will be tagged #work" line under the add box cuts the list to about 190 px (`07`). Tier 3.15 (collapse the hero on scroll) is still open. This is the same problem, measured.
- Proposal: Phone first. (a) Move "Reorder" to the right end of the chip row, or into the carried-over line, to save one 60 px line. (b) On Today, let the date hero replace the "TodoGeek" title in the top bar once the page scrolls, or always use a one-line hero ("18 Wed · Nov · 13 to do"), to save about 100 px. (c) Put the "Will be tagged" ghost chip inside the add box's preview line, not on a line of its own. Together these roughly double the visible rows. Desktop and tablet do not need it.
- Size: M
- Needs a decision from the owner? Yes: whether the big desk-calendar numeral may shrink on the phone (it is part of the identity, item 8 of the Red Pen spec).

#### 2. Repeats and reminders still have no visible way in
- Where: add box, editor, Help, account menu
- Evidence: `todogeek-04-inline-editor-light.png`, `-13-help-light.png`; `components/pen/InlineEditor.jsx:12-15` ("Repeats are not offered on a task that does not have them: that is Phase 2's redesign"); `packages/task-grammar/src/parseTaskInput.js:14,158` (only `(daily)`, `(weekly)`, `(monthly)`); reminders are one global switch in `components/layout/TopBar.jsx:28-35` and the sidebar
- Seen or inferred: SEEN and CODE
- Problem: The plan's own reason for keeping repeats and reminders was Chef's "I'd like to use them if they weren't so complicated to figure out" (`apps/todogeek/DOCS/SIMPLE_PLAN.md`). Today a task can only be made to repeat by typing a bracketed word when it is first added. An existing task cannot be made to repeat, and there is no "every Monday", "every weekday" or "every 15th". Reminders are an app-wide on/off switch. Nothing on a row or in the editor says a timed task will send a push. So the two features that were meant to become obvious are the least discoverable things in the app.
- Proposal: Build Phase 2 as written. In the editor, a Repeats select on every task (Never · Daily · Weekdays · Weekly on [day] · Monthly on [date]). In the grammar, plain-word repeats (`every monday`). On a row, a small grey "repeats" mark and "Next: Mon 23" after ticking. In the editor, a "Remind me" switch once a time is set. On the phone, the select sits in the editor sheet under Date and Time.
- Size: L
- Needs a decision from the owner? Yes: whether Phase 2 is still wanted, and per-task versus global reminders.

#### 3. The editor is the one screen that falls back to stock Material, and its first label is clipped
- Where: edit sheet (phone), detail pane (desktop), repeating-task scope dialog
- Evidence: `todogeek-04-inline-editor-light.png` (the "Task" label is cut off by the sheet's top edge and reads as "Iask"), `-63-repeating-task-light.png`, `-73-two-pane-open-dark-desktop.png`; `InlineEditor.jsx:101-173` (MUI outlined TextFields, ToggleButtons, Select); `components/tasks/RecurringEditDialog.jsx`
- Seen or inferred: SEEN
- Problem: Every other screen is ink on paper with ruled lines. The editor is a stack of outlined Material boxes with floating labels and a segmented priority control in which only a faint grey fill marks the choice. The first label is clipped on the phone. For a repeating task, a centred Material dialog opens on top of the sheet, with a small title, radio buttons and Cancel/OK. That is two taps where one would do, and it uses the word "instance".
- Proposal: Phone first. Restyle the editor through the app theme as ruled paper: a small grey label above each field, a single hairline under each input, and priority shown as the margin marks the list already uses (none / short grey / short red / full red) with the chosen one in ink. Give the sheet enough top padding that no label touches its edge. Replace the scope dialog with two buttons in the sheet's sticky footer when a repeating task has changes: "Save this one" and "Save every one". Desktop: the same in the right pane.
- Size: M
- Needs a decision from the owner? No (the restyle is inside the app's own theme).

#### 4. The login page still sells BuJoGeek
- Where: `/login` (no harness scene)
- Evidence: `pages/LoginPage.jsx:12-31`
- Seen or inferred: CODE
- Problem: It is the first screen on a new device or after a session expires. It says "Journal calmly. Plan effectively.", lists "Daily Log, Collections, Habit Tracking, Migration, Reflection" (all retired on 2026-09-29), and washes the page in sage and earth greens (`inkColors`). None of that is Red Pen, and the feature list promises screens that redirect to Today.
- Proposal: Tagline along the lines of "Write it down. Cross it off." Features: Today · Upcoming · Done · one add box. Ink colours from the Red Pen palette (paper with a faint ink and one red). Add a harness scene for it.
- Size: S
- Needs a decision from the owner? No (copy can be adjusted later).

#### 5. Ripple highlights stick on text buttons as clipped grey blobs
- Where: "carried over" header, "Done reordering", other ButtonBase/Button controls
- Evidence: `todogeek-02-today-carried-over-light.png` (grey pill behind "3 carried over", cut off on the right), `-50-today-grips-light.png` (two-tone blob behind "Done reordering"); `theme/theme.js:68-99` has no `disableRipple`
- Seen or inferred: SEEN and CODE
- Problem: This is the "clipped carried-over header highlight" that the 11-15 review marked "not reproduced". It is Material's ripple caught mid-spread. It breaks two Red Pen rules: the strike is the only animation, and the page is flat paper. In dark mode the same control shows a filled panel with no underline, so one button has two looks.
- Proposal: `MuiButtonBase: { defaultProps: { disableRipple: true } }` in the app theme. Keep a visible focus outline (already present on the row words). Both themes then look the same.
- Size: S
- Needs a decision from the owner? No

#### 6. Desktop two-pane: hover icons cover the time again, the time field is clipped, and the empty pane is wasted
- Where: Today, 1280 px (also landscape tablet)
- Evidence: `todogeek-73-two-pane-open-dark-desktop.png` (on the open row, the calendar icon sits on "2pm"; the Time field reads "02:00 P"), `-72-two-pane-empty-*-desktop.png`, `-01-today-light-desktop.png` ("Tap a task to open it here." in about 500 px of blank pane); `PenRow.jsx:540-548`, `TodayPage.jsx:155-160`
- Seen or inferred: SEEN
- Problem: The fix "time hides while actions show" does not hold on the open (selected) row in the pane layout. The 3-up Date/Time/Tags grid squeezes the time input until "PM" is cut. On a mouse-driven desktop the placeholder says "Tap". Half the screen holds one grey sentence.
- Proposal: Hide the row's time whenever its actions are visible, including on the selected row. Give Time a minimum width of about 130 px, or put Tags on its own line. Show "Click a task to open it here" on desktop. Better still, let the empty right pane show the next three days of Upcoming. The plan for 4.6 offered "editor or the next few days on the right"; that serves the next-glance job without changing the approved two-pane rule.
- Size: S (fixes); M (Upcoming peek)
- Needs a decision from the owner? Yes, for the Upcoming peek only.

#### 7. You can only add from Today
- Where: Upcoming, Done, Search
- Evidence: `todogeek-05-upcoming-light.png` (no add box); `TodayPage.jsx` is the only page that renders `AddBox`
- Seen or inferred: SEEN and CODE
- Problem: Upcoming is where you notice that Friday needs something. To add it you leave, go to Today, type "friday …", and get an "Added for Friday" toast for a row you cannot see. Tier 7.3 ("add line on Upcoming pre-dated") is still open. The 11-15 review also noted that `/` and Ctrl+N only reach the box on Today.
- Proposal: Phone first. Dock the same add box on Upcoming. Lines without a date go to Anytime as today, and a typed date lands in the visible timetable, so the new row appears in front of you. Desktop: the sticky box at the top of Upcoming. Make `/` work on every view.
- Size: M
- Needs a decision from the owner? Yes: whether the add box may appear outside Today (the plan put it on Today only).

#### 8. The swipe-left label is clipped to "omorrow"
- Where: Today, phone, swipe left
- Evidence: `todogeek-10-swipe-tomorrow-light.png`; `PenRow.jsx:312-330` (the reveal sits behind the row and is right-aligned, so the moving row covers the first letters until the swipe is long)
- Seen or inferred: SEEN
- Problem: At the moment the user decides whether to let go, the word that says what will happen is cut off. "Pick a date" at the long threshold (`11`) is fine.
- Proposal: Pin the label inside the revealed strip: right-aligned with its own 16 px padding and an icon-only fallback ("→") while the strip is narrower than the word. Or show the icon first and the word once there is room.
- Size: S
- Needs a decision from the owner? No

#### 9. Done loses the app's signature: only cancelled rows are struck through
- Where: Done, Search (done section)
- Evidence: `todogeek-06-done-light.png`, `-06-done-dark-desktop.png` (completed rows are grey with a filled box and no strike; "Argue with the insurance company" is struck and labelled "cancelled"); `PenRow.jsx:449-452`
- Seen or inferred: SEEN
- Problem: The strike is the Red Pen moment. On the page of finished work it appears only on things that were not done, which inverts its meaning. Crossed-off items look merely faded.
- Proposal: Draw the hand-drawn strike in grey (not red, per D7) on completed rows in Done. Cancelled keeps the empty box, the plain typographic line-through and the "cancelled" word, so the two stay distinct.
- Size: S
- Needs a decision from the owner? Yes (a visual call on D7's neutral ink).

#### 10. A failed load is reported twice, once in raw server words
- Where: Today, load error, phone
- Evidence: `todogeek-61-load-error-light.png` ("Couldn't reach your list. Retry" inline plus a pink "Service unavailable" toast)
- Seen or inferred: SEEN
- Problem: Two messages for one fact, and the toast is the server's wording on a pink tint. The palette note says error is the red, alerts carry no icon and toasts are greys. Pink is neither. On desktop the centred GeekLoadError is good.
- Proposal: Drop the toast when the inline load error is showing. If a toast is needed for a failed write, use the grey toast with red text.
- Size: S
- Needs a decision from the owner? No

#### 11. The empty Today is a dead end
- Where: Today, nothing due
- Evidence: `todogeek-60-today-empty-light.png` ("Nothing due today." in grey in an otherwise empty page; "0 to do · 0 done")
- Seen or inferred: SEEN
- Problem: This is the best moment in a to-do app and it reads as a blank page. Nothing points to what is next or to the add box below.
- Proposal: One line in ink, then one in grey: "Clear. Next: Thu 19 · Draft the offsite agenda" (linking to Upcoming). With nothing ahead either: "Clear. Type below to add one." Keep it two lines, with no illustration. The Upcoming empty line already does this well.
- Size: S
- Needs a decision from the owner? No

#### 12. "Passed" uses the same bold red as "late"
- Where: Today rows with a time earlier today
- Evidence: `todogeek-64-note-and-passed-light.png` ("12:05am · passed", "8am · passed" in bold red, the same treatment as "2 days late" in `02`); `PenRow.jsx:487-489, 523-524`
- Seen or inferred: SEEN
- Problem: By evening every timed task of the day turns red, so red stops meaning "this slipped" and the page looks urgent. Red should mean something specific.
- Proposal: Show "8am · passed" in the grey at weight 600, and keep bold red for "N days late" and the carried-over count.
- Size: S
- Needs a decision from the owner? Yes (which states earn the red).

### Smaller findings

Today and rows
- In dark mode, the mask over a hidden private task is a bright light-grey slab, the loudest object on the screen (`01-today-dark.png`, `42`). A darker bar, around the rule colour, would hide it just as well. SEEN.
- A revealed private row indents its words about 40 px further than the other rows, because the eye icon gets a column of its own (`41-private-revealed-light.png`). Put the icon inline before the words, as in the hidden state. SEEN.
- The Low priority mark is a 4 px grey stub that is hard to see or tell apart from a stray pixel (`51-anytime-grips-light.png`). The legend is in Help. SEEN.
- In Reorder mode the note line wraps with tight leading ("one that did / not.", `50`). SEEN.
- On a done row, the desktop hover action "Not done" uses the same ✓ icon as "Done" (`PenRow.jsx:545`; `06-done-dark-desktop.png`). An undo arrow, or "Not done" as text, would say what it does. CODE and SEEN.

Upcoming
- On the phone, the 72 px numeral column plus priority bar plus checkbox leave about 220 px for words, so most rows wrap to two lines (`05-upcoming-light.png`). Dropping the checkbox to the words' line, or the bar into the numeral column, would win back about 40 px. SEEN.

Sheets
- Pin tags: the sheet's "Done" button shares its name with the Done tab, and the chip that opens it says "Pins…" while the sheet says "Pinned tags" (`08`). Use "Close" or "Save", and call both "Pinned tags". SEEN.
- Move to…: it offers "Today" for a task that is already today, and "Another day" is pre-filled with today. "Tomorrow" has no date while "Weekend · Sat 21" and "Next week · Mon 23" do. The title uses "..." where the rest of the app uses "…" (`62`, `12`). SEEN.
- Help on the phone: the subtitle runs straight into the "In the add box" heading. Help does not mention reminders, and teaches repeats only in brackets (`13-help-light.png`). SEEN.

Desktop and tablet
- The list column moves between pages: Today is the left pane starting at x≈244, while Upcoming and Done are a centred 672 px column starting at x≈414. On Upcoming, Done and Search the editor opens under the row, not in a pane (`05-…-desktop`, `06-…-desktop`; `usePenRows.jsx` `pane` only from Today). Worth a look as consistency, within the approved two-pane rule. SEEN and CODE.
- The app's name has two spellings: the desktop sidebar wordmark is "todogeek" and the phone top bar says "TodoGeek" (`Sidebar.jsx:79`). SEEN.
- Tablet portrait (older screenshots): an `@` event shows "9:30am · passed" in red (`wave3…/01-today-dark-tablet.png`). On the current phone the event's time is grey, so this may already be fixed. Re-check when the tablet shard runs again.

### Screens with no harness scene (unaudited)
- Login and Register (see finding 4).
- Loading ("Opening the list…"), and the startup state with no spinner (SUITE_TODO §3).
- Empty Upcoming, empty Done, Search with no query, Search with no match.
- Navigation drawer on the phone (Reminders switch), account menu, app switcher.
- Toasts: "Added for tomorrow · Undo", Undo for a move, a failed write.
- Inline editor under a row on desktop Upcoming, Done and Search. Editor for a repeating task with the Repeats select visible.
- Phone with the keyboard open (add box above the keyboard; editor sheet above the keyboard).
- Help, pin tags and date sheets at tablet size; tablet two-pane with today's code (the tablet run is from 2026-11-17).

### How this app handles shared concerns
- Login: shared `LoginSplash` with old BuJoGeek copy and green ink wash (finding 4).
- Navigation: bottom bar of four (Today · Upcoming · Done · Search) plus a hamburger drawer on the phone; a rail on the tablet; a 220 px sidebar on desktop. Top bar has the suite app grid and an account avatar.
- Search: its own tab with a field. Done has its own search field too. Pinned tag chips filter every view.
- Add: one always-visible add box with a typed grammar, live underlines and a preview line; Today only.
- Delete and undo: delete is in the editor; every change gives a 6 s "Done. Undo" toast; delete is deferred until the toast expires. No confirmation dialogs.
- Toasts: grey card, bottom, above the docked add box. Errors use a pink tint (finding 10).
- Empty: one grey line ("Nothing due today.", "Nothing ahead. Add a date…", "Nothing crossed off yet.").
- Error: inline "Couldn't reach your list." with Retry on the phone; centred GeekLoadError on wider screens.
- Loading: a still grey line, no shimmer.
- Settings: none. Theme is a top-bar toggle on desktop; reminders are in the drawer, sidebar and account menu; pinned tags are in a sheet.
- Dates and numbers: rows say "2pm", "Tue 2pm", "today", "4 days late", "Sun 13 Dec"; the editor uses the browser's native 11/18/2026 and 02:00 PM; tabular numerals throughout.

### Works well — keep
- The add box: it underlines what it understood in your own sentence (dates in red, tags grey, priority as the margin bar) and adds a plain preview line underneath (`03`, `43`). It is the clearest teaching of a grammar anywhere in the suite.
- The Red Pen palette and Inter Tight in both themes; red really is rare.
- The strike on ticking, and Undo instead of "are you sure?".
- The "Will be tagged #work ×" ghost chip under an active filter (`07`).
- The Upcoming timetable on desktop (`05-…-desktop`): big numerals, skipped empty days, "Later · December".
- Notes and events without checkboxes (`51`, `64`).
- "Carried over" collapsed to one line with "Move all to today".
- Move-to sheet choices with real dates ("Weekend · Sat 21").
- Swipe right to done, swipe left to tomorrow, long swipe to pick a date, with haptics.

### Bugs noticed in passing
- Desktop pane: on the open row the hover icons cover "2pm" and the Time field clips "PM" (`73`). Both were marked fixed on 11-15 for the inline layout. See finding 6.
- `utils/quickAdd.describeParse` still says Private is "hidden on a desktop" (already in SUITE_TODO).

---

## ThingGeek — design and UX review

Screenshots: `tools/mobile-harness/out/par-thinggeek/thinggeek/` (today's run). Code: `apps/thinggeek/frontend/src` (paths below are relative to it unless they start with `tools/` or `DOCS/`).

A note on the name: the brief calls the identity "Moving Day", but `DOCS/THINGGEEK_PLAN.md` ("As built") records that Chef said Moving Day "leaned way too hard into the moving aesthetic". The look that shipped is the storage-and-rental yard: black livery, kraft, yard orange, unit tags, roll-up doors, no packing and no box markings. I reviewed against that.

### Verdict
ThingGeek is one of the most finished apps in the suite. The yard identity is strong and consistent in both themes, the phone flows for adding (Add, Walk the room, Save & add another) have clearly been tuned by use, and the privacy rules are visible without nagging. The biggest gains are on the phone's thing page, where the insurance payoff (Claim readiness, value, receipts) sits at the very bottom and the action bar scrolls away even though it is meant to stick, and on the Where level and Attention pages, where headers and action rows push the real content below the middle of the screen. After that come consistency points: Edit works differently from Add, there are three different "Take a photo / Choose a file" designs, and a few overlays and empty states drop the yard motif.

### Top findings (ranked, at most 12)

#### 1. On the phone, Claim readiness, Value and Documents are at the bottom of the thing page
- Where: `/thing/:id`, phone
- Evidence: thinggeek-05-detail-light.png, 05a-detail-scrolled-light.png, 05b-detail-sections-light.png, 05-detail-dark-desktop.png; `views/detail/ThingDetail.jsx:93-105`
- Seen or inferred: SEEN (desktop and the phone's first three screens) + CODE (the order)
- Problem: the desktop puts Claim readiness ("4 of 5 on file", "Add a receipt") and Value at the top of the right column, which is good. On the phone the two columns stack, so the order is Inside, Details, Dates, Accessories, Notes, and only then Readiness, Value and Documents. For a boat with contents, the "what is the insurer still missing" panel is four or more screens down, under the notes. That panel is the app's reason to exist ("the insurance claim … exportable on a bad day", plan §What it is), and its one-tap fix ("Add a receipt") is the most useful action on the page.
- Proposal: phone first: render the phone in its own order: header, action bar, Claim readiness (it is already compact), then Inside, Details, Value, Dates, Documents, Accessories, Notes. Hide Claim readiness when it reads 5 of 5. Desktop: no change.
- Size: S
- Needs a decision from the owner? No.

#### 2. The thing page's action bar is meant to stick on the phone but scrolls away, and the top bar only says "Thing"
- Where: `/thing/:id`, phone
- Evidence: 05-detail-light.png (bar under the tags), 05a-detail-scrolled-light.png and 05b (bar gone, top bar reads "Thing"); `views/detail/ActionBar.jsx:38` (`position: { xs: 'sticky' }`), `views/detail/ThingDetail.jsx:63-80` (its containing block ends right after the bar, so sticky never engages); `components/navConfig.js:34` (title 'Thing')
- Seen or inferred: SEEN + CODE
- Problem: one screen down, Edit, Photo, Document and More are gone and the bar reads "Thing", so there is nothing on screen that says which thing you are looking at. To add a receipt after reading the details you scroll back to the top. The code shows sticky was intended.
- Proposal: phone first: move the ActionBar out of the header grid (or make the sticky container the article) so it pins under the top bar after scrolling. Once the h1 has scrolled off, put the thing's name in the top bar instead of "Thing"; the TopBar already has a title slot. Desktop keeps the static bar.
- Size: S
- Needs a decision from the owner? No.

#### 3. A Where level spends more than half the phone screen before the first unit, and offers the same actions three ways
- Where: `/where?at=…`, phone
- Evidence: 10a-where-level-light.png, 10a2-where-level-garage-light.png (the first unit door starts about 1,100 px down a 1,992 px capture, so 55% of the screen); 10c-where-menu-light.png; 05e-detail-location-light.png
- Seen or inferred: SEEN
- Problem: each level opens with a 400 px mural hero, a crumb row, then five actions in two rows (Add here, Walk this room, Move, Its page, Print labels) in three button weights (filled, outlined, text). The same Add, Walk, Add a location, Move and Show in library actions are on every unit's ⋮ menu, and "Add a location inside" appears again as a link under the units. Someone drilling House → Garage → Van to find the jumper cables has to scroll on every level. "Its page" is also unclear: the same place has two pages (the Where level and the thing page) with different action sets.
- Proposal: phone first: below the root, shrink the level hero to a band about 160 px tall (the mural strip plus the name and count; keep the mural, it is the motif). Keep Add here and Walk this room as the two visible buttons and move Move, Print labels and "Open its page" into one ⋮ on the level header. Drop the bottom "Add a location inside" link, since the ⋮ menu has it. Desktop tree: unchanged.
- Size: M
- Needs a decision from the owner? Yes: whether the level header can shrink, since the murals were a deliberate part of the identity (plan: "a level opens with its mural").

#### 4. On the phone, the Attention page shows the first due item only after 60% of the screen
- Where: `/attention`, phone
- Evidence: 09-attention-light.png, 09-attention-dark.png, 26-attention-attic-light.png, 16d-attention-rooms-light.png; `views/AttentionView.jsx:298-317`
- Seen or inferred: SEEN
- Problem: this is the tab with the badge, opened to see "what's due". The three-line lede and the dashboard (lights and gauge) take about 1,000 px, so the first overdue row starts about 1,190 px down. The rows themselves truncate the useful part: "Plates renewal · Sep 22, 2…", "Boat registration · Oct 7, 2026 · …". The absolute date fights the relative date ("3 days overdue") for one line, and the location is lost entirely.
- Proposal: phone first: drop the lede on the phone (it repeats what the dashboard and section titles say) and make the dashboard shorter: lights and gauge side by side at about 60% of the current height. Make the two warning lights tap targets that scroll to their list. In rows, put the date's label on line 2 and the place on line 3 (or drop the absolute date, since the relative one is on the right). Desktop: unchanged; it reads well (09-attention-light-desktop.png).
- Size: S–M
- Needs a decision from the owner? No.

#### 5. Edit works differently from Add: Save is in the top-right corner, fields are stock outlined Material, and there is no yard
- Where: Edit dialog (Edit, any section's Edit), Type editor
- Evidence: 08-edit-form-light.png, 08b-edit-details-dark.png, 11b-type-editor-light.png versus 07-add-light.png and 18-walk-empty-light.png; `views/edit/EditThingDialog.jsx`
- Seen or inferred: SEEN
- Problem: Add and Walk put Save in a black bar at the thumb, with borderless cream fields on kraft. Edit is a full-screen white sheet with stock outlined MUI fields, a close X top-left and Save in the top-right, the hardest corner to reach one-handed. It is a long form (Basics, details, value, dates, accessories, photos, documents, notes). The suite review's "no unsaved-changes guard on Edit" (SUITE_REVIEW finding 4; SUITE_TODO §11 `useUnsavedGuard`) still holds, so a stray X or Android Back loses the whole form.
- Proposal: phone first: give Edit and the Type editor the same footer as Add (black bar, orange Save, Cancel), the same filled cream fields, and the livery stripe under the header. That keeps "white for forms" while still putting the yard on screen. Add the unsaved guard at the same time. Desktop: the same footer at the bottom of the dialog.
- Size: M
- Needs a decision from the owner? No.

#### 6. The "added, next one" toast covers the Save bar during Save & add another
- Where: `/add`, "Save & add another"
- Evidence: 07f-add-another-light.png (the toast sits over both buttons); `views/add/AddThing.jsx:284`; `packages/ui/src/feedback/GeekToastProvider.jsx:50` (4 s)
- Seen or inferred: SEEN
- Problem: the point of Save & add another is speed. For four seconds after each save, the buttons for the next save are under the toast, so a fast second entry taps the toast, or waits.
- Proposal: phone first: confirm inside the page rather than with a toast. Show a one-line "Tow strap added ✓" strip above the photo slot, or a running count like Walk's "2 added to Garage". At minimum, lift the toast above the footer bar on `/add`. (SUITE_TODO §11 already notes the shared toast-clearance problem above 600 px; this is the phone side.)
- Size: S
- Needs a decision from the owner? No.

#### 7. Moving something to the Trash asks for confirmation, then gives no Undo
- Where: thing page → More → Move to Trash
- Evidence: 20-more-print-label-light.png, 05i-trash-container-*.png; `views/detail/ConfirmTrashDialog.jsx`, `views/detail/ThingDetail.jsx:255-258` (toast "… is in the Trash for 30 days", no action)
- Seen or inferred: CODE + SEEN (sheet)
- Problem: trashing is recoverable for 30 days, but you still answer a dialog every time, and when you do trash the wrong thing the way back is More → Trash → find it → Restore.
- Proposal: phone first: for a plain item, trash at once and show a toast with an Undo action (the toast provider supports `action`). Keep the dialog only for a container or location with contents, where it explains what happens to them, which is useful. Desktop: the same.
- Size: S
- Needs a decision from the owner? No.

#### 8. Search teaches a grammar the phone cannot type easily, and you cannot tap the examples
- Where: Things tab search, phone
- Evidence: 01c-search-hint-light.png; `components/TopBar.jsx:54-80` ("visual only", `aria-hidden`), `:213-224` (search only on the library route)
- Seen or inferred: SEEN + CODE
- Problem: `type:boat`, `in:garage`, `missing:receipt` need the colon from the phone keyboard's symbol layer, and the example tokens look like chips but do nothing. Search is also only on the Things tab, so from a thing page or Where you go to Things first. The close arrow sits at the right of the field, where a back arrow is not usually found.
- Proposal: phone first: make each hint token a button that inserts its prefix (`type:`, `in:`) into the field and keeps the keyboard up. Put the close arrow on the left. Optionally show the search icon on Where and Attention too, opening the library search. Desktop: the same tokens, clickable.
- Size: S
- Needs a decision from the owner? No.

#### 9. "Take a photo / Choose a file" has three designs, and selected chips look like focused chips
- Where: Add, the thing page's Add photo sheet, Attic add
- Evidence: 07-add-light.png (orange filled plus outlined, in the open unit), 06e-add-photo-sheet-light.png (black filled plus outlined), 24-attic-add-card-light.png (two beige tiles with the icon on top); 07-add-light.png (Electronics has a dark outline that looks like Tool's selected state in 07f-add-another-light.png)
- Seen or inferred: SEEN
- Problem: the same two choices look different on each screen, so the user has to read them every time. On the type chips, the selected state (grey fill plus dark ring) and a plain dark ring (what 07-add shows on Electronics) are hard to tell apart in daylight, and a wrong type means the wrong fields.
- Proposal: phone first: one photo-pair component: orange "Take a photo" (camera is the default on a phone) and an outlined "Choose a file", used by all three. For selected type chips, use the yard's own signal: black fill with cream text, or an orange stripe, so selection does not depend on a thin outline. Desktop: the same.
- Size: S–M
- Needs a decision from the owner? No.

#### 10. The motif drops out on overlays and some empty and error states
- Where: Filters sheet, More sheet, Edit dialog, Trash empty state, every `GeekErrorState`
- Evidence: 04-filters-sheet-dark.png (plain charcoal, full screen), 02b-more-sheet-light.png and 20-more-print-label-light.png (plain cream sheets); `views/TrashView.jsx:60-63` (stock `TrashIcon` on the empty state); `GeekErrorState` used for every load failure (`views/LibraryView.jsx:146`, `AttentionView.jsx:284`, `WhereView.jsx:523`, `TrashView.jsx:54`, Attic views)
- Seen or inferred: SEEN (sheets) + CODE (empty and error states, unscened)
- Problem: the owner's rule is that the motif is on every screen, empty states included. The library's empties do it well (`LibraryEmpty.jsx` uses `MiniDoor` for "Nothing matches"). The Trash empty state, the error states and the full-screen Filters sheet are stock. On the phone, the Filters sheet covers the whole screen, so for that moment the app looks like any MUI app.
- Proposal: phone first: give sheets a livery stripe under the drag handle (the black/orange rule the top bar has) and a kraft surface for the Filters sheet. Use a closed `MiniDoor` for the Trash empty state and an app-local error state (a door with a "closed" plate and the Retry button) wrapped around `GeekErrorState`, not a change to the shared package. Desktop: the same components.
- Size: S–M
- Needs a decision from the owner? No.

#### 11. The phone Filters sheet lists every zero-count option and hides what is active
- Where: Things → Filters, phone
- Evidence: 04-filters-sheet-dark.png (scene `/?tag=fishing`: the sheet opens on Type with Tool 0, Camera 0, Firearm 0, Vehicle 0, Keyboard 0, Storage 0; the active tag filter is not visible)
- Seen or inferred: SEEN
- Problem: with a filter on, most of the first screen is options that would show nothing, and you cannot see what is narrowing the list without scrolling to the Tags group. "Show 4 things" is good.
- Proposal: phone first: put a row of active-filter chips at the top of the sheet, each with an ×. Fold zero-count options under "Show all" when any filter is active. Desktop panel: the same fold.
- Size: S
- Needs a decision from the owner? No.

#### 12. Status squares on Insurance and Record check look like checkboxes you can tick
- Where: Insurance report (Photo 11 of 16, Receipt 6 of 16, Serial 11 of 16), Attention → Record check rows
- Evidence: 12-insurance-light.png, 26-attention-attic-light.png (empty squares beside "No ID-plate photo 12"), compared with 16d-attention-rooms-light.png, where the Getting started list uses the same square as a real check
- Seen or inferred: SEEN
- Problem: the same empty square means "a to-do you can tick" on one panel and "a partly met status" on the next. On Insurance a tap on it does nothing. On Record check the row does open the filtered library, but the square suggests ticking.
- Proposal: phone first: on Insurance, use a small progress pip or "11/16" in a plate instead of an empty box (a check only when all 16 are on file). On Record check, replace the square with the count plate already on the right, or the orange stripe mark used for section titles. Keep real checkboxes only on Getting started.
- Size: S
- Needs a decision from the owner? No.

### Smaller findings

**Things (library)**
- On the phone list, the overdue/due-soon marker is a red or amber dot with no text (01-library-light.png). Red and amber differ only by colour. Give the dot a shape difference (a ring for due soon) or add a short "Overdue" or "Due" caption on line 2, as the grid card does. SEEN.
- Desktop Add: the page has an h1 "Add a thing" under a top bar titled "Add a thing", and the sidebar lights "Things" (07-add-light-desktop.png). Drop the h1 on desktop, or light nothing. SEEN.

**Thing page**
- A location's page shows "Accessories · Link a thing" and "Dates" for a room (05e-detail-location-light.png). Hide Accessories for locations, since a garage has no accessories. SEEN.
- A masked identifier shows the last four characters including spaces, so "••••7  BK" reads oddly (05a). Take the last four non-space characters. SEEN.

**Add / Walk**
- On the phone, Add's Tags field and "Walk a whole room…" are below the fold under a 600 px photo unit (07-add-light.png). That is fine for speed; I note it only so it is not "fixed" by shrinking the unit, which is the motif.
- Walk keeps the walk list below the chips (18b). With more than five items, the latest saves scroll out of view. Consider newest-first, which may already be the order; the list in the scene suggests oldest-first (Rake, then Extension cord). SEEN, order not confirmed in code.

**Attic**
- The set-up screen says "Your lock is yours: Heather sets up her own." (`views/attic/AtticLock.jsx:216`, 22-attic-setup-light.png). That is wrong when Heather is the one setting it up. Name the other member, or say "each member sets up their own". CODE + SEEN.
- Recent access names people by lowercase username ("heather revealed…", "chef failed to unlock") while documents name them by person ("Passport · Clint") (23b-attic-access-light.png; `views/attic/AtticParts.jsx:98-105` uses `actorName`). That is two names for one person in the same panel. Use the display name. SEEN with fixture data; production names unconfirmed.
- Attic add: the sticky "Put it in the Attic / Cancel" bar sits above the bottom tab bar, so on the phone about 360 px of the 844 px screen is fixed chrome (24-attic-add-card-light.png). Add and Walk hide the tab bar (`fullScreen` in `components/navConfig.js:35-36`). Give `/attic/add` and `/attic/edit/:id` the same treatment. SEEN + CODE.
- Attention's Attic section shows a passport "in 7 months" in the same amber as "Due soon" (26). Use amber only within the warning window and neutral text beyond it. SEEN.
- The Attention tab badge (3) counts things only. Attic items due in 19 and 24 days are on the page but not in the badge or the warning lights (26, 09 desktop). Decide whether the badge means "due on things" or "due". SEEN; it needs an owner call.

**Labels**
- `/labels` is not in `components/navConfig.js` ROUTES, so the top bar reads "ThingGeek", no phone tab is lit and the page carries its own h1 "Print labels" (17-labels-selector-light.png, 17b). Add the route (title "Print labels", tab 'more', back). CODE + SEEN.
- In the Small preview, the label's footer word is cut to "THINGG" (17b-labels-preview-light.png; `views/labels/LabelSticker.jsx:240-245` has no fit for the footer). If the printout clips the same way, the footer either needs a fit or can be dropped on Small. SEEN in the preview; print not checked.

**Types**
- The type editor puts a 49-icon grid before the fields list (11b-type-editor-light.png). The fields are what you came to edit. Collapse the icon picker to the current icon with "Change". SEEN.

**Where (desktop)**
- The tree's row toggles are small door glyphs with no label (10b-where-expanded-light-desktop.png). Their accessible names are good ("Show … kept directly in Van"), but a sighted first-time user will not know they expand. A tooltip would do. SEEN.

### Screens with no harness scene (unaudited)
- `/attic/types` (Document types) and `/attic/edit/:id` (edit a document).
- Edit dialog sections past Details: Dates editor, Accessories (`RelationshipsEditor`), Photos and documents (`MediaEditor`), Notes.
- Attic card crop sheet (`CardCapture.jsx`) after a photo is taken; Change-PIN dialog; remove-fingerprint confirm; Attic document Delete confirm.
- Save view dialog (`SaveLibraryView.jsx`) and the saved-view ⋯ menu (rename and delete).
- Where: Rename dialog; the "Not anywhere yet" group.
- Type editor: adding or editing a field, choices, the identifier flag; New type.
- Settings below the identifiers card (Appearance and Account cards; 14 shows only the top).
- Labels: the Large size preview; the print portal itself.
- Every loading, error and offline state (library skeleton, `GeekErrorState` on each page, Trash "Loading…", Attic spinners), and the Trash empty state. SUITE_TODO §11 already lists "state scenes (empty / loading / error / offline)" as open.
- Add after a photo is chosen (preview in the unit, upload progress), and Add with the keyboard open.

### How this app handles shared concerns
- **Login:** suite SSO through `LoginSplash`. Non-members get a branded "Members only" card with the hazard livery, Sign out and Back to GeekSuite (15-not-a-member).
- **Navigation:** phone has a five-slot tab bar (Things · Where · raised orange Add · Attention with a count · More sheet). Desktop has a black sidebar with an orange rule on the current row, saved views listed in it, and Settings and Sign out at the foot. Sub-pages get a back arrow; Add and Walk hide the tab bar.
- **Search:** in the top bar on the library only. Phone opens it from an icon into a full-width field with a grammar hint (`type:`, `in:`, `missing:`, `due:`). Desktop has an always-on field with a `/` shortcut.
- **Add:** the raised Add tab or "Add a thing" button goes to a full page: photo first, name, type chips, where, Save or Save & add another (which keeps type and place). Walk the room is a fast capture loop. "Add here" presets the place.
- **Delete / undo:** things go to the Trash after a confirm dialog and a toast with no Undo. Trash keeps them 30 days with Restore. Attic documents are deleted permanently after a confirm.
- **Toasts:** shared `GeekToastProvider`, 4 s, with success and error tones. On `/add` the toast covers the footer bar.
- **Empty:** library first-run is strong (a YOUR STORAGE hero, roll-up doors, numbered steps, a rooms-as-units variant). "Nothing matches" uses a MiniDoor. Trash empty uses a stock icon.
- **Error:** shared `GeekErrorState` with Retry on every page, with friendly copy ("Your records are fine — this is a connection problem.").
- **Loading:** a skeleton grid on the library, "Loading…" text on Trash and in Attention lists, bare spinners in the Attic.
- **Settings:** a page from More. Its top card explains the identifier rules (no switches), then the household setup, Appearance and Account.
- **Dates and numbers:** "Sep 22, 2026" and "Wed, Oct 7, 2026" in lists and detail; relative "in 12 days", "3 days overdue", "Expires in 7 months"; audit uses "9 min ago" and then "Nov 17 7:14 AM". Money is "$18,500"; the insurance total is an odometer reel. Units are shown ("17.5 ft").

### Works well — keep
- **The identity.** Black livery chrome, kraft surfaces, unit tags for places, roll-up doors, truck-side murals, the Attic's steel door. It holds in light and dark (01, 09, 18b dark), is used for meaning (unit tags are where things are) and never reads as a brand.
- **Walk the room** (18–18e): thumb-reach Next, sticky type chips, an inline required field with the reason, a per-row "Needs Frame size to save" fix in place, and the new "Leave with things unsaved?" confirm.
- **Save & add another** keeps the type and the place (07f). Add here presets the place (07e).
- **Identifier handling:** masked to the last four, Reveal and Copy per field, re-masked on leave, explained once on Settings and in one quiet line per page. It never nags.
- **The Attic:** a clear locked, set-up and unlocked progression, a visible countdown and Lock, an audit that never shows values, and an Attention panel readable while locked that shows "who, which document, the date".
- **Attention's dashboard** (lights and gauge) and **Insurance's** odometer total and ruled form: the app's personality, and still readable.
- **First run with rooms** (16b, 16c): each empty room is a door that opens Walk. That is exactly the right next step.
- **The desktop thing page** (05-detail-dark-desktop): a two-column layout with Claim readiness and Value top right.
- **Copy:** plain, specific and kind throughout ("They stay put until it's restored.", "A photo is optional — the whole thing, in good light.").

### Bugs noticed in passing
- The thing page's action bar is `position: sticky` on xs but cannot stick, because its containing block ends right after it (`views/detail/ActionBar.jsx:38`, `views/detail/ThingDetail.jsx:63-80`). See finding 2.
- `/labels` is missing from `components/navConfig.js` ROUTES, so the title falls back to "ThingGeek" and no tab or sidebar row is active.
- The Small label preview clips the footer to "THINGG" (17b-labels-preview-light.png).
- The Attic set-up copy hard-codes "Heather sets up her own" (`views/attic/AtticLock.jsx:216`).
- Already known and still open, not re-reported: Edit and Attic forms have no unsaved-changes guard (SUITE_REVIEW ThingGeek 4 / SUITE_TODO §11). The SUITE_REVIEW Walk discard (3) and the 26 px Walk photo-remove target (6) are fixed (scene 18e; `views/walk/WalkRoom.jsx:160-167` now has a 44 px hit area).

---

## BookGeek — design and UX review

### Verdict
The library and the detail sheet are the strongest identity work in the suite: the green signboard, the wood planks, the seeded stickers, the shelf talker and the bargain-bin empty state make it unmistakably a used bookstore, and the browse, filter and recently-deleted flows are clear. The in-app reader is the weakest screen by a distance. It is unaudited (no harness scene), it never tells you where you are in the book, the phone's Back gesture throws you out of the book as well as the reader, and it looks like a stock slate-blue e-reader rather than part of the shop. The second gain is identity: wherever BookGeek uses a shared or stock surface (toolbar pills, filter sheet, chips, Add book, Edit metadata, Save view, Settings) it falls back to plain grey Material, and those are exactly the places where it starts to look like GameGeek's skeleton without GameGeek's paint. Third, rating a book from its own page needs four taps.

Do the two apps still feel like different places? Yes. On the library and the detail sheet nobody would confuse them. They converge only in the shared `@geeksuite/collection` skeleton: the same Filters · Sort · icon-pill row, the same "N books" count line, the same chip row, the same filter sheet with "Clear all / Show N", the same sort menu with direction words, and the same "What should I … next?" sheet. GameGeek inks all of these in its own theme; BookGeek leaves them stock, so the fix is in BookGeek's theme, not the shared package (finding 5).

### Top findings (ranked, at most 12)

#### 1. The reader never tells you where you are, and always starts at the cover
- Where: in-app EPUB reader (Read on the detail sheet). No harness scene.
- Evidence: apps/bookgeek/web/src/views/ReaderModal.jsx:144-159 (progress from `location.start.percentage`, label from `location.start.displayed`), :440-480 (rail and %); apps/bookgeek/web/src/hooks/useReader.js:102 (`rendition.display()` with no location) and no call to `book.locations.generate()` anywhere in `web/src`.
- Seen or inferred: CODE (needs a device to watch it happen)
- Problem: epub.js only fills `percentage` once the book's locations have been generated, and this code never generates them, so on a phone the 2px progress rail stays empty and the "%" never appears. The only position text is "Page N of M", and epub.js's `displayed` counts pages inside the current chapter, so a 300-page novel says "Page 3 of 9". Every open starts at the cover (position sync was decided against, S-D3), and nothing the reader does feeds the detail sheet's Progress slider, so a reader who reads in the app has to drag the slider by hand afterwards.
- Proposal: phone and desktop the same. (a) Generate locations after `display()` (cached per book in localStorage so it runs once) and show "42% · <chapter title>" in the bottom bar, with the rail filled. (b) Remember the last location per book on this device only (localStorage, no schema or gateway change) and reopen there; this is the cheap half of S-D3. (c) On close, if the reader moved, offer one line on the detail sheet: "Set progress to 42%?" with a single tap, rather than writing it silently.
- Size: M
- Needs a decision from the owner? Yes: whether (b), a device-local position, is acceptable under S-D3 ("do not build reader position sync" was about the server-side sync), and whether (c) is wanted at all. Also whether Chef reads in the browser, which S-D3 named as the reason to revisit.

#### 2. Getting out of the reader: Back leaves the book too, the controls vanish mid-use, and the page cannot be touched
- Where: in-app reader. No harness scene.
- Evidence: apps/bookgeek/web/src/views/BookDetailRoute.jsx:58-76 (the reader is a plain Dialog over the `/book/:id` route, with no history entry of its own); ReaderModal.jsx:116-122 (auto-hide timer depends only on `chromeVisible`), :317-341 (three full-height ButtonBase tap zones at z-index 1 over the epub.js iframe).
- Seen or inferred: CODE
- Problem: on an Android phone, the system Back gesture pops `/book/:id`, which closes the reader and the detail sheet together and drops you on the library, losing your place in the grid's context. The top and bottom chrome hide 2.5 s after they appear and tapping A+ or the theme button does not restart that timer, so a reader stepping the font size from 100% to 140% has the buttons fade out under the thumb. The tap zones cover the entire page, so links and footnotes in the book cannot be followed and text cannot be selected. There is no table of contents or chapter jump, so a book that opens at the cover (finding 1) must be paged through.
- Proposal: phone first. Give the reader its own Back entry (the suite's `useBackToClose` pattern) so Back closes the reader and leaves the detail sheet open. Restart the auto-hide timer on any chrome interaction. Shrink the tap zones to the outer 25% strips and let the centre pass through to the iframe (centre tap still toggles chrome via epub.js's own click event), so links work. Add a "Contents" button in the top bar that opens a sheet built from `book.navigation.toc`. Desktop: arrow keys already work; add Home/End or the same Contents button.
- Size: M
- Needs a decision from the owner? No.

#### 3. The reader is the one screen that is not in the bookstore
- Where: in-app reader, both reader themes.
- Evidence: ReaderModal.jsx:25-28 and useReader.js:75-99 (page #0f172a / ink #e2e8f0 dark, #f6f1e7 / #1f2937 light, links #2563eb / #60a5fa), :363-421 (stock close icon, "A−"/"A+" text buttons, Material Brightness icons).
- Seen or inferred: CODE
- Problem: the dark reader page is Tailwind slate blue with bright blue links, which is the only cold colour in an app whose dark mode is "after hours, the same store under one lamp" (apps/bookgeek/DOCS/CONTEXT.md). The light page is a good warm paper; the dark one is not. The top bar is a generic e-reader bar. A reader who opens a book at night leaves the shop for a different app.
- Proposal: keep the reader quiet (no stickers on the page), but take the dark page and ink from the app's own after-hours palette (warm near-black, cream ink, bookstore-green links) and the top bar from the signboard green with cream serif title, as the detail sheet already does. Keep the warm paper light page. Keep the colours outside the app theme tokens if the reader must stay independent of the app mode, as the file comment intends.
- Size: S
- Needs a decision from the owner? No.

#### 4. The detail sheet has two close buttons stacked on top of each other
- Where: book detail sheet, phone, at the top right of the hero.
- Evidence: bookgeek-03-detail-light.png, bookgeek-03-detail-dark.png, bookgeek-03d-detail-comic-download-light.png (the X is drawn twice, slightly offset); apps/bookgeek/web/src/views/BookDetailModal.jsx:250-255 (`DetailHero ... showClose={isPhone}`) plus packages/ui/src/surfaces/GeekSheet.jsx:351-367 (the sheet always renders its own close).
- Seen or inferred: SEEN in screenshot, CODE confirms
- Problem: a doubled glyph looks broken on the first screen of every book, and a screen reader hears two "Close" buttons in a row. Once the hero scrolls away (03b, 03c) only one is left, so the two also disagree on position.
- Proposal: drop the DetailHero close (`showClose={false}`) and keep the sheet's own, which stays pinned as you scroll; style it through the sheet header's `data-geek-sheet="close"` hook as GameGeek does.
- Size: S
- Needs a decision from the owner? No.

#### 5. Shared and stock surfaces fall back to plain Material, and that is where BookGeek and GameGeek look alike
- Where: library toolbar (Filters, Sort, ⋯ pills), active filter chips, the Filters sheet, the Sort menu, Add book, Edit metadata, Save this view, the comic Download sheet, the account menu, Settings, Delete forever.
- Evidence: bookgeek-01-library-light.png (grey outlined pills), bookgeek-06e-active-chips-light.png (grey outlined chips), bookgeek-06d-filters-sheet-light.png, bookgeek-04-add-light.png, bookgeek-08-edit-metadata-draft-light.png, bookgeek-06i-save-view-light.png, bookgeek-03d-detail-comic-download-light.png, bookgeek-06-settings-light-desktop.png. Compare gamegeek-16-active-chips-light.png, where the same chips are ink-outlined cyan stickers.
- Seen or inferred: SEEN
- Problem: the brief says a signature motif should be on every screen. These screens have none: a full-screen white form with grey outlined fields, a stock checkbox list, a stock menu. They are also the screens built on the shared collection skeleton, so with the paint gone the two apps' bones show through. Save this view is a full-screen dialog for one text field.
- Proposal: through `apps/bookgeek/web/src/theme/theme.js` only, never `packages/collection`: (a) toolbar pills and filter chips as small green aisle-sign boards or kraft price tags (no tilt; it is UI); (b) every sheet and dialog title sits on a short wood plank rule, the way the detail cover does; (c) the Filters sheet's group headings as aisle signs, which the drawer already uses ("Shelves", "Saved views"); (d) Save this view becomes a bottom sheet with the name field and Save, not a full-screen page; (e) Settings sections headed with aisle signs and the maintenance jobs as secondary (outlined) buttons, so the page is not five identical green slabs. Phone and desktop alike.
- Size: M
- Needs a decision from the owner? No (it strengthens the identity through the app theme).

#### 6. You cannot rate a book from its own page
- Where: detail sheet; library cards.
- Evidence: bookgeek-03-detail-light.png (the hero line "Reading · ★★★★☆ · 336 pp · 2014" is text); apps/bookgeek/web/src/views/detail/DetailHero.jsx:28-37 (display only); EditMetadataDialog.jsx:150-171 (the only rating control on the detail path); components/BookCard.jsx:215-222 with StarRating.jsx header (five stars share a 100px strip, 20px each); utils/rating.js:16-20 (stars only on Read-type shelves or already rated).
- Seen or inferred: SEEN and CODE
- Problem: finishing a book and rating it is a daily-ish job. From the book's page it is ⋯ → Edit metadata → a star → Save, inside a form that edits the household's shared catalogue. From the grid it is a 20px-wide star on a phone, which the component itself notes is a compromise. GameGeek puts Rate in its detail action bar.
- Proposal: phone first. Make the hero's star line the control (the existing StarRating at "hero" size, about 220px wide, so each star is 44px), with the meaning line under it. Keep tap-on-current-rating as a no-op, as the card does. Move rating and Last read out of Edit metadata (they are per-reader, and the form is shared catalogue data). Desktop: same control in the same place.
- Size: S
- Needs a decision from the owner? No.

#### 7. "Send" emails the book to a Kindle on one tap, with no confirmation and an unclear label
- Where: detail sheet action bar.
- Evidence: bookgeek-03-detail-light.png (Send between Read and Shelf); BookDetailModal.jsx:390-398; hooks/useBookDetail.js:255-274 (posts immediately).
- Seen or inferred: SEEN and CODE
- Problem: "Send" does not say where to, and it sits in the thumb's best spot beside Read, so a mis-tap emails a file to a device with no undo. Three ideas overlap with no explanation: Send, the "On Reader" shelf, and the device basket in ⋯. Heather is the most likely to hit it by accident.
- Proposal: label it "Kindle" (or "To Kindle"). On tap, a small bottom sheet: "Send to <kindle address>?" with Send, and after success one tap to "Move to On Reader". Phone and desktop the same.
- Size: S
- Needs a decision from the owner? Yes: whether a successful send should offer, or do, the move to On Reader.

#### 8. The "owned" tick reads as "done" and wraps onto its own line
- Where: library grid and list rows.
- Evidence: bookgeek-01-library-light.png ("Unread ✓"), bookgeek-01b-library-list-light.png, bookgeek-03e-detail-closes-light.png (Lock In: the ✓ wraps alone under the stars); components/BookCard.jsx:225-227 (14px CheckIcon, meaning only in `titleAccess`).
- Seen or inferred: SEEN
- Problem: next to a shelf word, a tick reads as "read" or "done". "Unread ✓" is a contradiction to anyone who does not know it means "we have the file". On a phone there is no hover to reveal the title. When stars are present it wraps to a lonely line, which adds a row of height to that card and breaks the plank rhythm.
- Proposal: phone first. Drop it from the card, or replace it with a tiny printed word that fits the shop ("in stock") and only show the opposite case ("need to find") which is the actionable one. Keep it in the list view as a labelled column on desktop.
- Size: S
- Needs a decision from the owner? Yes: is "owned" worth showing on every card at all.

#### 9. Unread and Want to read look like the same shelf
- Where: shelf strip, drawer, shelf sheet, Add book's default shelf.
- Evidence: bookgeek-02-drawer-light.png (Unread 61, Want to read 27), bookgeek-04-add-light.png (default "Want to read"); views/detail/ShelfSheet.jsx:25-60 (labels only, no descriptions); apps/bookgeek/DOCS/CONTEXT.md:105 ("Unread is a real shelf value" = owned, not started).
- Seen or inferred: SEEN and CODE
- Problem: Heather started with every book unread. Without a hint, "Unread" and "Want to read" are synonyms, and the shelf picker gives no help. GameGeek's shelf sheet already solves this with a one-line meaning under each shelf (gamegeek-20-shelf-sheet-light.png).
- Proposal: add a one-line meaning under each shelf in the shelf sheet, in the owner's words (for example Unread "On the shelf, not started"; Want to read "Don't have it yet, or want it next"). Phone and desktop the same.
- Size: S
- Needs a decision from the owner? Yes: the wording of each shelf's meaning.

#### 10. The shelf strip shows five of nine shelves on a phone with no hint there are more
- Where: library top, phone.
- Evidence: bookgeek-01-library-light.png (All, Reading, On Reader, Unread, Read; the strip ends flush at the edge); bookgeek-02-drawer-light.png (also Want to read, Abandoned, Need to find, Comfort reads).
- Seen or inferred: SEEN
- Problem: the last visible tab ends exactly at the screen edge, so nothing suggests the strip scrolls. Want to read and the custom shelves are reachable only via the drawer or by guessing a swipe.
- Proposal: phone. Let the strip end mid-tab (a fixed right inset so the sixth tab peeks), or fade the right edge into the background. Desktop already has the sidebar.
- Size: S
- Needs a decision from the owner? No.

### Smaller findings

Library
- The FAB sits over the bottom-right cover on every screen and hides that card's shelf talker ("42% in — n…") (bookgeek-06j-scroll-restore-light.png). Add bottom padding under the grid equal to the FAB, or hide the FAB on scroll down. SEEN.
- A seeded sticker can land on a generated cover's title: the "WANT TO READ" tag covers "The Road to Jonestown" (bookgeek-03e-detail-closes-light.png, desktop 01 too). Bias placement toward the top corner band when the cover is generated. SEEN.
- Active filter chips overflow sideways with no fade: "Filters · 7" but three chips visible, the third cut at the edge (bookgeek-06e-active-chips-light.png). SEEN.
- The focus outline on a returned-to card (03e) wraps cover, title and author but not the shelf/stars row, so it cuts through the card. SEEN.
- Fallback covers print title and author, then the caption prints them again under the plank; with generated covers a phone screen shows about two books. Consider hiding the caption title when the cover is generated. SEEN.

Detail
- "Language: en" and "Goodreads 21418013" are raw codes; show "English" and make the Goodreads id a link, or drop it from the phone view (bookgeek-03b-detail-source-tags-light.png). SEEN.
- Dates are US numeric (8/26/2014, 3/2/2026) while GameGeek writes "Jun 15, 2020". Use the short month form. SEEN.
- The Progress slider spans the sheet in a scrolling surface; a vertical scroll that starts on it can drag progress. SUSPECTED (needs a device).
- Last read inline editor is a native mm/dd/yyyy field with a select-all highlight on "mm" (bookgeek-03c-detail-last-read-light.png); a "Today" shortcut would cover the common case. SEEN.

Add / edit
- Add book asks "Manga or comic?" with only two answers (bookgeek-04-add-light.png; the scene taps Manga, the toggle starts empty in views/AddBookDialog.jsx:145-158). For an ordinary novel the question reads as required and has no "Neither"; label it "Is it a manga or comic? (optional)" or move it under the file picker. SEEN and CODE.
- Edit metadata has both "ISBN" and "ISBN13", while the detail shows one ISBN (bookgeek-08-edit-metadata-draft-light.png). SEEN.
- The "AI-drafted" chip beside "Draft description & tags" is cramped and its icon touches the text (08). SEEN.

What next / AI
- "AI-drafted by llama-3.1-8b-instant" is a model id in user copy (bookgeek-07-what-next-light.png); "Suggested by the library assistant" reads better, with the model in a tooltip or Settings. SEEN.
- "Start reading" buttons are indented about 12px further than the text column above them (07). SEEN.

Settings
- Every maintenance job is a full-weight green button (Merge duplicates, Rescan library, Scan comics folder), so the page has no hierarchy (bookgeek-06-settings-light.png). SEEN.
- Recently deleted rows truncate the title to "The Hitchhiker'…" while the meta wraps onto three lines ("gone for good Dec / 12 · files too") because Restore takes a fixed 120px column (06n). On phone, put Restore under the text or as a small text button. SEEN.
- Already in SUITE_TODO §12 and still holds: "gone for good <date>" is wrong for Tankarr-held volumes.

### Screens with no harness scene (unaudited)
- The in-app EPUB reader (the screen this review was asked to weigh most).
- Shelf sheet from the detail, More sheet (⋯), Change cover (CoverTools), Upload / attach file.
- Delete book confirm from the detail (only Delete forever in Settings is scened).
- Device basket: select mode in the library and the basket result sheet.
- Send to Kindle in progress, success and error lines.
- Phone search open state and a no-results search.
- Empty library (first run) and the load error / loading states; offline page.
- Settings top on the phone (Kindle address, default shelf, custom shelves); scenes 06 and 06m start scrolled.
- Login splash.

### How this app handles shared concerns
- Login: suite LoginSplash; its copy still says "read EPUBs in the browser" (App.jsx:249), which now matches; the old "Sync Progress" claim is gone.
- Navigation: signboard top bar (menu, search, app grid, avatar); drawer on phone, sidebar on desktop with shelves and saved views; aisle-sign shelf strip on phone.
- Search: icon in the top bar on phone, full field with "/" shortcut on desktop.
- Add: green FAB on phone, yellow "Add book" on the signboard on desktop; full-screen form.
- Delete / undo: delete from the detail ⋯ with a confirm; soft delete for 30 days with Restore and Delete forever in Settings; no toast undo.
- Toasts: suite toast, bottom, with a close button (bookgeek-06m-comics-scan-light.png).
- Empty: Bargain bin crate with a sign and a clear-filters action.
- Error: toasts for detail actions; a full-page "Could not load your library" for the list.
- Loading: not scened.
- Settings: a page at /settings, reached from the avatar menu, with Recently deleted and AI inside it.
- Theme: dark mode toggle in the avatar menu on phone, moon icon in the top bar on desktop.
- Dates and numbers: US numeric dates in the detail (8/26/2014), short month in Recently deleted ("Nov 12"); counts as plain numbers; progress as % with "about p. 141 of 336".

### Works well — keep
- The plank under every grid row and under the detail cover; the seeded sticker mix that never jumps; stickers tilt, UI does not.
- The shelf talker ("42% in — no spoilers!", "Staff pick!") as the one handwritten thing.
- The bargain-bin empty state and the aisle-sign section heads in the drawer.
- "about p. 141 of 336" under the progress slider: a number with a unit a reader can check against the paper book.
- The detail's sticky Read · Send · Shelf · ⋯ bar in the thumb zone, and a comic's bar swapping to one Download button.
- Filters sheet live counts and the "Show 2 books" button that states the result before you commit; sort direction in words ("Shortest first").
- Recently deleted copy: what is kept, for how long, and that "files too" will go.
- Settings → AI copy: says exactly what is sent and what is not.
- Reader font size and theme remembered per device, with safe-area padding and reduced-motion respected.

### Bugs noticed in passing
- Reader progress rail never fills and the % never shows (no `book.locations.generate()`); finding 1.
- Two close buttons on the detail sheet on phone; finding 4.
- "Page N of M" in the reader is the page within the chapter, not the book; finding 1.

---

## GameGeek — design and UX review

### Verdict
GameGeek is in good shape and its identity is the loudest in the suite. Ink outlines, hard shadows, sticker statuses and Bungee reach the library, the shared toolbar and chips, the detail hero, Settings and the empty state ("CONTINUE?_"). The owner's own meanings show up where they matter: the shelf picker and the "how did it end?" choices carry his words, and ratings show their taste-model line. Hours are gone from cards, rows, the detail and the CSV, so that pending offer is already done. The biggest gains are a few visible collisions on the phone (Add a game's heading over its field, the detail action bar under the close button), a shelf model where "Couch co-op" pushes a game's real status off its card, and a handful of sheets that drop back to soft, stock-looking lists inside an app that is otherwise all ink.

Do GameGeek and BookGeek still feel like different places? Yes, clearly. GameGeek even dresses the shared `@geeksuite/collection` pieces (pills, chips, the "Show N games" button) in its own ink, which BookGeek does not. They share only the skeleton: the same toolbar row, count line, chip row, filter sheet and sort menu, and the same "What should I … next?" sheet. Nothing here needs changing in the shared package.

### Top findings (ranked, at most 12)

#### 1. Add a game: the heading sits on top of the search field's label, and the close X sits on its border
- Where: Add a game sheet, phone.
- Evidence: gamegeek-04-add-search-light.png (the floating label "Game title" is cut in half under "ADD A GAME"; the ✕ overlaps the field's top-right border).
- Seen or inferred: SEEN in screenshot
- Problem: the first thing you see when adding a game looks broken, and the ✕ is hard to hit because it shares its spot with the field's outline; a tap there can focus the field instead of closing.
- Proposal: phone. Give the field at least 12px of top margin below the heading so the floating label clears it, and keep the sheet's close in the header row beside the title rather than overlapping the body. Desktop: check the same dialog; the margin fix applies there too.
- Size: S
- Needs a decision from the owner? No.

#### 2. The detail's sticky action bar slides under the sheet's close button
- Where: game detail sheet, phone, once scrolled.
- Evidence: gamegeek-18-detail-tags-light.png ("More" runs into the ✕ at top right); apps/gamegeek/frontend/src/views/detail/ActionBar.jsx:31-48 (sticky, `top: 0`, three equal columns across the full width) and views/detail/GameDetail.jsx:171-181 (the sheet's close floats over the content at z-index 3).
- Seen or inferred: SEEN, CODE confirms
- Problem: when the bar pins, the More button's right half is under the close button. A thumb reaching for More can close the sheet instead, and the label is unreadable.
- Proposal: phone. Reserve the close button's width on the right of the pinned bar (padding-right of about 56px), or put the close inside the bar as a fourth cell once it is pinned. Desktop is the same component; the same padding works.
- Size: S
- Needs a decision from the owner? No.

#### 3. "Couch co-op" is a shelf, so it replaces the game's real status
- Where: library grid and list, shelf sheet, drawer.
- Evidence: gamegeek-01-library-light.png and gamegeek-01b-library-list-light.png (Animal Crossing's status sticker reads "Couch co-op", so you cannot see if it is Playing, Backlog or Finished); gamegeek-20-shelf-sheet-light.png (Couch co-op listed among the statuses, with no meaning line); apps/gamegeek/DOCS/PLAYNITE_IMPORT.md:128-130 (the import never moves a game on a custom shelf to Playing).
- Seen or inferred: SEEN, docs confirm the import side
- Problem: a game can sit on one shelf. Putting it on Couch co-op erases "Playing = installed and ready" for that game, and the Playnite import then stops managing it, so a reinstalled co-op game never comes back to Playing. The owner already uses tags for this kind of thing ("Couch night" on Hades, gamegeek-18-detail-tags-light.png), and the filters already have a Played facet and tags.
- Proposal: treat custom shelves as lists that sit beside the status (a second, smaller sticker or a tag), or steer "Couch co-op" to a tag and a saved view. Phone first: the card's status sticker always shows one of the built-in statuses.
- Size: M (UI only if it becomes a tag and a saved view; L if custom shelves become a second field)
- Needs a decision from the owner? Yes: is Couch co-op a status for him, or a list he wants a game to be on as well as Playing/Backlog.

#### 4. Several sheets drop back to soft, stock-looking lists inside an all-ink app
- Where: Move to shelf sheet, Find metadata sheet, the install decision tiles, the Playnite preview's stat tiles, the account menu.
- Evidence: gamegeek-20-shelf-sheet-light.png (plain list rows, tiny colour squares, grey selected band); gamegeek-13-find-metadata-light.png (plain list, a green outlined "Best match" pill in a colour the app does not otherwise use); gamegeek-21-install-decision-light.png (thin rounded outlines, no ink weight or shadow); gamegeek-11-playnite-preview-light.png (soft rounded tiles, while the Metadata card a screen later uses ink-outlined tiles, gamegeek-12-metadata-card-light.png).
- Seen or inferred: SEEN
- Problem: these are the moments where the owner makes a decision about a game, and they look like a different app. Two tile styles for the same kind of number on the same Settings page is also an inconsistency.
- Proposal: through `apps/gamegeek/frontend/src/theme/theme.js` and the app's own components: each shelf row in the sheet shows the real status sticker (the same one the card wears) instead of a colour square, and the selected row gets an ink outline and hard shadow rather than a grey band; the install-decision answers and the preview tiles use the Metadata card's ink tile; "Best match" becomes a lime sticker with ink text (neon as a fill). Phone and desktop alike.
- Size: M
- Needs a decision from the owner? No.

#### 5. On the phone, the trailer strip comes before your status, rating and notes
- Where: game detail sheet, phone.
- Evidence: gamegeek-25-detail-media-light.png ("MY STATUS" begins about 1,500px down the 2x screenshot, after Media and three link buttons); gamegeek-27-detail-links-only-light.png; views/detail/GameDetail.jsx:134-152 (Media spans the full width before Status, Rating, Playthroughs, Copies, Notes).
- Seen or inferred: SEEN, CODE confirms
- Problem: the daily jobs on this sheet are change status, rate, and write the verdict. The action bar covers status and rate, but the rating's taste-model line, progress, last played and Notes & review are below a media strip that is the same every visit. Rate in the action bar scrolls past the media to reach the stars.
- Proposal: phone. Order Status, Rating, Notes & review, then Media, then Copies, Details, Household. Desktop keeps two columns; put Media at the top of the right column instead of across both.
- Size: S
- Needs a decision from the owner? No.

#### 6. The status button always shows a bookmark, and "Status" and "Shelf" name the same thing
- Where: detail action bar; My status section; shelf sheet.
- Evidence: gamegeek-03-detail-light.png (bookmark over "Playing"), gamegeek-28-media-loading-light.png (bookmark over "Finished"), gamegeek-02-drawer-light.png (Playing is a play circle, Finished a check, On hold a pause, Backlog a bookmark); views/detail/ActionBar.jsx:9, 51 (`BookmarkBorder` for every shelf, aria "Status: …"); gamegeek-25-detail-media-light.png ("MY STATUS" with a row "Shelf"), gamegeek-20 ("MOVE TO SHELF").
- Seen or inferred: SEEN, CODE confirms
- Problem: a Finished game wearing the Backlog icon says the wrong thing at a glance. Two words for one idea on one screen is small but daily.
- Proposal: use the drawer's per-shelf icon in the action bar (or the status sticker itself). Pick one word; "Shelf" matches the drawer, filters and sheet title, so the section becomes "My shelf" and the aria label "Shelf: Playing. Change".
- Size: S
- Needs a decision from the owner? No.

#### 7. Phone search: the back arrow sits to the right of the field
- Where: library with search open, phone.
- Evidence: gamegeek-22-no-match-light.png (field on the left with its own ✕, then a ← arrow, then the app grid and avatar); components/TopBar.jsx:15, 36-50.
- Seen or inferred: SEEN
- Problem: Back is expected at the top left. Here it is in the middle of the bar, next to the field's own ✕, so there are two ways out that look alike and the arrow points away from where it sits.
- Proposal: phone. Put the ← at the far left where the menu icon was, field after it, keep the ✕ inside the field for clearing text only. The app grid and avatar can hide while search is open to give the field the width.
- Size: S
- Needs a decision from the owner? No.

#### 8. List rows lower-case the month ("Played sep 22")
- Where: library list view.
- Evidence: gamegeek-01b-library-list-light.png ("Played jan 1", "Played sep 22", "Played apr 1"); apps/gamegeek/frontend/src/components/GameRow.jsx:24 (`last.toLowerCase()`, written for "Today"/"Yesterday").
- Seen or inferred: SEEN, CODE confirms
- Problem: looks like a typo on every row with a date older than a week.
- Proposal: lower-case only the relative words ("today", "yesterday", "3 days ago"); leave month names as formatted ("Sep 22").
- Size: S
- Needs a decision from the owner? No.

#### 9. The Progress slider has no clear meaning for a game and sits in the scroll path
- Where: detail, My status section.
- Evidence: gamegeek-25-detail-media-light.png (Playing at 70%), gamegeek-27-detail-links-only-light.png (Backlog at 0%, the thumb half off the card's padding), gamegeek-28-media-loading-light.png (Finished at 100%, thumb past the card edge).
- Seen or inferred: SEEN; accidental drags SUSPECTED (needs a device)
- Problem: "70%" of a game has no unit the owner tracks (he does not track hours, and Playthroughs already record how far a run went). The full-width slider in a scrolling sheet invites a drag when the thumb meant to scroll. At 0% and 100% the knob overhangs the card.
- Proposal: if he does not use it, remove it (Playthroughs carry completion). If he does, make it a tap-to-edit value ("70% · Change") instead of a live slider on the phone, and inset the track by the knob's radius.
- Size: S
- Needs a decision from the owner? Yes: does he use per-game progress at all.

#### 10. Server-side and model jargon in screens Heather can see
- Where: Add a game, Settings → Metadata & covers, What should I play.
- Evidence: gamegeek-04-add-search-light.png ("…arrive once IGDB keys are set on the server."), gamegeek-12-metadata-card-light.png ("IGDB and RAWG need API keys in GameGeek's server settings"), gamegeek-24-what-next-light.png ("AI-picked by llama-3.1-8b-instant").
- Seen or inferred: SEEN
- Problem: three lines of admin advice push the search results down on the phone every time you add a game, and they tell the person adding a game to do something only the owner can do. A raw model id reads as an error code.
- Proposal: phone first. On Add a game, show one line ("Searching the Steam store") and move the IGDB note to Settings only. On What should I play, "Picked by the play assistant", with the model in Settings → Play assistant.
- Size: S
- Needs a decision from the owner? No.

### Smaller findings

Library
- The phone toolbar spends a 44px slot on Export (download icon) beside the view toggle (gamegeek-01-library-light.png); BookGeek tucks export into ⋯. Export is rare; consider moving it into a ⋯ or Settings on the phone. SEEN.
- The shelf strip ends mid-tab ("Ab…" at the edge), which correctly hints at more; BookGeek's does not. Keep. SEEN.
- In dark mode the cards' hard shadows are coloured (lilac, cyan, magenta) while light mode uses ink; both read well. SEEN, no change.
- The light-mode avatar is pale pink "CC" on deep magenta (gamegeek-01-library-light.png); worth a contrast check, it looks under 4.5:1. SEEN.

Detail
- The heart beside the title is the only red in the app and reads as an alert colour against the lime and magenta; a magenta or ink heart would sit in the palette (gamegeek-03-detail-light.png). SEEN.
- "Time to beat 22 h story · 48 h + extras · 95 h 100%" is store metadata, not hours played, so it does not break the no-hours decision; left alone. SEEN.
- Delete confirm is nine lines on a phone (gamegeek-05-delete-confirm-light.png). Two short sentences would do: "Hades will be removed for everyone, with their shelves, ratings and notes. Playnite won't re-add it; restore it from Settings → Deleted games." SEEN.

Settings
- A "Chef" tooltip from the avatar stays on screen over the Playnite preview and Metadata card (gamegeek-11-playnite-preview-light.png, gamegeek-12-metadata-card-light.png). On a touch device a tooltip shown on tap can stick. SUSPECTED (needs a device).
- Settings is the only top bar without search (gamegeek-06-settings-light.png); BookGeek keeps search on Settings. Fine either way; noting for suite comparison. SEEN.

What should I play
- Picks have no visible action; the whole row opens the game. BookGeek shows "Start reading" per pick. A small "Open" or "Move to Playing" per row would make the next step obvious. SEEN.

### Screens with no harness scene (unaudited)
- Manual add form ("Enter 'hades' manually" → GameForm).
- Edit game, Copies dialog, Cover tools, Unlink metadata, the More sheet.
- Playthroughs section and the Playthrough dialog; Notes & review section.
- First-run empty library (LibraryEmpty with no games, as opposed to no matches).
- Save this view dialog on the phone (the icon is in the toolbar in 16 and 22, the dialog is not scened).
- Settings: Platforms, Shelves, Taste model, Storefronts and Appearance cards below the fold.
- Loading and error states for the library and the detail; login.

### How this app handles shared concerns
- Login: suite LoginSplash (not scened).
- Navigation: plain cream top bar with an ink rule (menu, search, app grid, avatar); drawer on phone with shelves then account (avatar, Settings, Sign out); sidebar on desktop with shelves, saved views, and the account at the bottom.
- Search: icon opens a full-width field in the bar on phone; "/" shortcut field on desktop.
- Add: magenta FAB on phone, "ADD GAME" button in the bar on desktop; a sheet that searches Steam, with "Enter manually" and a pointer to the Playnite import.
- Delete / undo: More → Delete with a confirm that explains the Playnite effect; restore from Settings → Deleted games with per-game notes on what restore brings back; no toast undo.
- Toasts: not seen in these scenes.
- Empty: "CONTINUE?_" floppy card with "Show all games" and "Add a game".
- Error: not scened; the metadata card counts Errors as a tile.
- Loading: grey placeholder tiles in Media (gamegeek-28); "Running… Looking things up — 812 left…" for the metadata job.
- Settings: a page reached from the avatar menu and the drawer; ink cards per topic.
- Theme: avatar menu "Light mode / Dark mode" on phone, moon icon on desktop.
- Dates and numbers: "Jun 15, 2020", "Sep 22", relative "Today", "3 days ago"; the list row lower-cases months (finding 8); ratings "5 / 5".

### Works well — keep
- The Arcade Sticker library: ink-outlined cards, generated covers with platform badges, status stickers, the shelf strip with hard shadows.
- The shared toolbar, chips and "Show N games" button wearing GameGeek's ink and neon fills with ink text, which keeps the shared skeleton from looking generic.
- The shelf sheet's one-line meanings in the owner's words ("Played it; haven't admitted I've abandoned it yet", "Abandoned is abandoned").
- The rating's taste-model line under the stars, and a Clear button instead of tap-to-clear.
- The "Not installed anymore — how did it end?" choice and the Playnite preview's plain-English warning before anything leaves the library.
- Deleted games: who deleted it, when, and exactly what restore brings back.
- The "CONTINUE?_" empty state, with both ways forward.
- The media viewer: "2 of 7", large ink-outlined prev/next in the thumb zone.
- Hours are gone from cards, rows, the detail and the export (comments at GameCard.jsx:13, StatusSection.jsx:3, exportGamesCsv.js:19). The pending offer to remove them is already done; nothing to confirm.

### Bugs noticed in passing
- GameRow.jsx:24 lower-cases month names ("Played sep 22"); finding 8.
- GameRow.jsx:5 comment says "the game's page has them" (hours); it no longer does. Comment only.
- apps/gamegeek/DOCS/PLAYNITE_IMPORT.md:131-132 says the auto-move to Backlog "replaced" the "how did it end?" question (2026-10-09), but InstallDecisionBanner.jsx is still built and scened (gamegeek-21). Either the doc or the banner is stale; worth one check.
- Avatar tooltip sticking over Settings content after a tap (SUSPECTED; see Smaller findings).

---

## NewsGeek — design and UX review

Evidence: today's harness run `tools/mobile-harness/out/par-newsgeek/newsgeek/` (48 scenes, phone and desktop, both themes), `tools/mobile-harness/apps/newsgeek/scenes.mjs`, code under `apps/newsgeek/frontend/src` (paths below are relative to it), `DOCS/NEWSGEEK_PLAN.md`, `apps/newsgeek/DOCS/CONTEXT.md`, and the NewsGeek section of `DOCS/SUITE_REVIEW_2026-11.md`. All four findings in that section have been fixed since (resume refresh, scroll memory, cursor paging, "Couldn't fetch older stories"); scenes 46–48 show the new states. Not reported as missing: feed hygiene step 2, story clustering, the story page, Saved, and app-side read state (all planned for N1/N2). Images are left out on purpose ("Text first. No images in v1", plan "Screens"), so image handling is not a finding.

**The look.** The plan calls it "County Gazette" (plan "Decisions → Identity"; `theme/theme.js:1-23`): a modern small-town weekly. Newsprint `#F4F0E6`, ink-black Newsreader serif headlines, Libre Franklin small-caps section labels, hairline and heavy rules in place of cards, one civic-blue spot colour kept for "official", and dark mode drawn as "the same paper at night". The motif (a thick-over-thin double rule under the top bar, small-caps labels, heavy section rules) appears on every screen, in both themes, on phone and desktop. The few places it slips are listed in finding 8.

### Verdict
NewsGeek is one of the best-crafted apps in the suite. The identity is strong and consistent, the type is comfortable to read, dark mode is a real paper at night and not an inverted page, and the error, empty and resume states are written in the paper's own voice. The biggest gains are on the reading path itself. On the phone, half of the first screen is chrome before the first headline. Only the headline text opens a story, so the three-line excerpt under it does nothing when tapped. A story card is about 215 px tall, so the "done in five minutes" paper is about 11 phone screens long. Sources, the second daily screen, does not scale to 88 sources: there is no way to find one by name, and the source page lacks the two things a reader most wants there.

### Top findings (ranked, at most 12)

#### 1. The first screen is mostly masthead, and Everything repeats it
- Where: Everything `/everything`, Today `/`, section page `/s/:section`
- Evidence: `newsgeek-01-latest-light.png`, `-08-latest-free-to-read-light.png`, `-23-latest-filtered-light.png`, `-29-today-empty-light.png`, `-30-section-local-light.png`; `views/LatestView.jsx:224` (`<Masthead edition="Everything, newest first" />`), `components/Masthead.jsx:132-176`, `views/TodayView.jsx:181-184`
- Seen or inferred: SEEN
- Problem: on a 390 × 844 phone, the space between the top bar (bottom edge at about 65 px) and the tab bar (top edge at about 607 px) is 542 px. On Everything, the nameplate, the county line, the dateline, the section tabs and the Free to read row take the first 275 px, so the first story starts at about 340 px and only one story shows. With a source filter on (scene 23), the first headline starts at about 395 px. On Today, the same block ends at about 287 px, about 40% of the first screen. The page name is also printed twice: the top bar says "Everything" and the dateline says "EVERYTHING, NEWEST FIRST". On the section page, the top bar says "Local" and a 44 px heading says "Local" again. The nameplate is the front page's signature, and it loses force when it appears on every list.
- Proposal: phone first. Keep the full masthead on Today only. On Everything and the section pages, drop the nameplate and county line and start with one compact dateline row, with the date on the left and the tabs right under it. On Today, move the Free to read switch into the dateline row, next to "Today's paper · Updated 9:31 AM", so it stops taking a row of its own (about 45 px). Together this brings the first Everything headline up to about 160 px and Today's up to about 240 px. Desktop already sets the date and the edition on one line (`newsgeek-01-latest-light-desktop.png`); keep that, and drop the nameplate on Everything there as well.
- Size: S
- Needs a decision from the owner? yes: is the nameplate for Today only, or is it the brand on every list?

#### 2. Only the headline text opens a story; the excerpt and the rest of the card do nothing
- Where: every story card (Today, Everything, section pages)
- Evidence: `components/ArticleItem.jsx:72-107`: the `<Link>` wraps only `article.title`, and the excerpt is a plain `Typography`. Screens: `newsgeek-26-today-light.png`, `-01-latest-light.png`
- Seen or inferred: CODE
- Problem: on the phone, the excerpt is the largest block of text in a card: three lines of 17 px serif, about 80 px tall. A thumb that lands on it, or on the gap between the publisher line and the headline, gets nothing. That gap is the natural place to tap in a news list, so the reader tries again and has to aim for the headline. A short headline such as "Weekly jobless claims fall…" is a target of about 340 × 50 px inside a 215 px tall card.
- Proposal: phone first. Make the headline, the excerpt and the empty space around them one tap target that opens the story. Leave the ⋯ menu, the why-chips and the "Also in" links as their own targets above it. A stretched link, an `::after` on the headline link that covers the card, is the cheapest way. The suite has hit this before: the harness tap-target rule measures the element, not its `::after`, so either extend the link's own box over the excerpt (put the excerpt inside the `<a>`) or check the rule against the result. Desktop: the same, plus a hover state on the whole card (a `shade` band) so the mouse shows what is clickable.
- Size: S
- Needs a decision from the owner? no

#### 3. The front page is long for a five-minute read: about 2.5 stories per phone screen
- Where: Today
- Evidence: `newsgeek-26-today-light.png`, `-27-today-sections-dark.png`, `-35-today-also-in-light.png`, `-28-today-end-light.png`; `components/ArticleItem.jsx:56` (`py: 4`), `:100` (3-line clamp), `:108` (chips on their own row, `mt: 2`); `views/TodayView.jsx:76` (`mt: 10` between sections)
- Seen or inferred: SEEN (sizes measured from the screenshots, total estimated)
- Problem: a typical card is about 215 px tall: a 16 px publisher and time line, a 2–3 line headline, a 3-line excerpt, a row of why-chips, and 16 px of padding above and below. A card with no excerpt is about 140 px. Each section adds about 140 px for its flag, its "More …" link and a 40 px gap. At about 25 stories, Today runs to roughly 6,500 px, which is 11–12 phone screens. The plan promises "~25 stories, not 150 headlines, and an end to the list", and the end is there, but it takes a lot of thumb travel. Some of the chips also repeat what the section already says: every story under STATE carries an "Arkansas" chip (`-26`, `-28`), and that chip takes a whole row.
- Proposal: phone first. (a) Clamp the excerpt to 2 lines on `xs`, and keep 3 lines for the lead story. (b) Put the why-chips on the publisher and time line when they fit, instead of on a row of their own. (c) Drop a why-chip that only repeats the section's own name (an "Arkansas" chip under State). That needs an agreed rule; see below. (d) Cut the gap between sections from 40 px to 24 px. Together these bring a card to about 160 px, or 3.5 stories per screen. Desktop stays as it is: it already fits about 4 stories in the 672 px column.
- Size: S (a, b, d); M if (c) needs a gateway rule
- Needs a decision from the owner? yes: whether a chip that repeats the section counts as noise. The plan says "if it can't be a chip it isn't in the score", so this changes only what is shown, not the ranking.

#### 4. Sources does not scale to 88: no way to find one, and the rows are tall and repeat themselves
- Where: Sources `/sources`
- Evidence: `newsgeek-04-sources-admin-light.png`, `-05-sources-reader-dark.png`, `-10-sources-others-light.png`, `-12-sources-suggested-light.png`; `views/SourcesView.jsx:74-112` (SourceRow), `:42` and `:223` (status filter chips only, no search)
- Seen or inferred: SEEN
- Problem: each row takes about 140–160 px on the phone, so 3–4 rows fit on a screen and 88 sources are about 25 screens. To turn off "Malvern Daily Record", the reader has to scroll an alphabetical list. Each row also says the same thing more than once. "ON" sits beside a switch that already shows on. "Broken · State · 0 this week" is followed by "⛓ Broken example.com last OK Nov 9", so the status appears twice. The kind badge ("JOURNALISM") sits on the name line when there is room and drops to its own line when a PAYWALL or METERED badge is present (`-10`: The Verge versus Hope Star), so the left edge is ragged. The page also sorts the same list two ways at once: status filter chips (All, Needs attention, Discovered, Active, Broken) and membership sections (In your paper, From other readers, Turned off, Suggested).
- Proposal: phone first. (a) Add a "Find a source" field under the heading that filters every section as you type (the list is already in memory). (b) Cut a row to two lines: the name, then the switch on the right; and below, one line of gothic metadata: "State · 0 this week · ⛓ Broken since Nov 9". Drop the "ON/OFF" text (the switch already has an `aria-label`), drop "JOURNALISM" from the row (it is the default kind; show only Official and Aggregator), and keep PAYWALL/METERED at the end of the metadata line. (c) Move the status filter chips behind the summary line ("11 active · 1 failing · 1 broken"): tapping a count filters the list, which frees a 44 px row. Desktop: the same row works, and the find field can take `/` as a shortcut.
- Size: M
- Needs a decision from the owner? no

#### 5. A source's own page cannot turn the source on or off, or show its stories
- Where: Source page `/sources/:id`
- Evidence: `newsgeek-06-source-failing-light.png`, `-09-source-paywall-light.png`, `-16-source-adder-light.png`; `views/SourceDetailView.jsx:304-306` (only SubscribeSwitch, Priority and admin/adder actions); grep finds no `onForMe` toggle and no `/everything?source=` link in that file. The Source sheet has both: `components/SourceSheet.jsx:201` ("More from this source") and "In my paper" (`newsgeek-21-source-sheet-direct-light.png`)
- Seen or inferred: CODE + SEEN
- Problem: a reader who taps a name in Sources lands on a page with I subscribe, Priority, and for admins Check now, Edit, Status and On for everyone. The page has no "In my paper" switch, though that is the one thing the list row does, and no way to see what this paper has been printing. The sheet you reach from a story has both. So the same source has two settings surfaces that do different subsets of the job, and the page reached from Sources is a dead end for the most common question, "what does this source actually send me?".
- Proposal: phone first. Give the page the sheet's top block, in the same order and layout: "In my paper" and "I subscribe" as full-width rows with the switch on the right (as in the sheet), then Priority, then a "Recent stories" list of the last 5 headlines with "More from this source →" at the end. Admin tools (Check now, Edit, Status, On for everyone) go below a heavy rule under an "At the desk" flag. Desktop: the same, in the column.
- Size: M
- Needs a decision from the owner? no

#### 6. No Share or Copy link on a story
- Where: the ⋯ menu on every story
- Evidence: `newsgeek-19-article-menu-light.png`, `-20-article-menu-empty-dark.png`; `components/ArticleMenu.jsx:39-60`; grep finds no `navigator.share` or clipboard write anywhere in `src`
- Seen or inferred: CODE + SEEN
- Problem: on a phone, sending a local story to the other person in the house is one of the main things a news app is for. Today it takes ⋯ → Open at publisher → wait for the publisher's page → the browser's own share. On a paywalled or ad-heavy local site, that page can be slow or blocked.
- Proposal: phone first. Add "Share…" as the second item in the ⋯ menu. It calls `navigator.share({ title, url })` with the original publisher URL, never an open-with URL. Where `navigator.share` is missing (most desktops), the item reads "Copy link" and shows a "Link copied." toast.
- Size: S
- Needs a decision from the owner? no

#### 7. Pages print their title twice, and heavy rules stack into doubled bars
- Where: Sources, Settings, the section page, the Source page
- Evidence: `newsgeek-04-sources-admin-light.png` (top bar "Sources" + 44 px "Sources"), `-18-settings-light.png` (top bar "Settings" + "Settings", then two heavy rules about 25 px apart), `-16-source-adder-light.png` (heavy rule closing the actions, then a heavy rule opening FEEDS), `-30-section-local-light.png` ("Local" twice)
- Seen or inferred: SEEN
- Problem: on the phone the second title costs about 100–130 px before any content, and the stacked rules read as a drawing mistake rather than a paper's column rule. Settings is reached by a back arrow and its top bar already says "Settings".
- Proposal: phone first. Below `md`, drop the in-page H1 on Sources and Settings (the top bar is the title), or keep it and make the top bar title empty on those pages. Pick one rule suite-wide for this app. On Sources, keep the "11 active · 1 failing · 1 broken" line and the Add button as the page head. Never let a block's closing heavy rule sit on top of the next section's opening heavy rule: the section flag's top rule is enough.
- Size: S
- Needs a decision from the owner? no

#### 8. A few stock-Material shapes break the Gazette's square, ruled look
- Where: the "Showing: …" filter chip, text fields and selects, the ⋯ menu, the "N new stories" bar
- Evidence: `newsgeek-23-latest-filtered-light.png` (fully rounded pill with a 2 px ink border), `-18-settings-light.png` and `-44-settings-reading-light.png` ("Add a place" select), `-06-source-failing-light.png` (the Status select), `-36-source-path-rules-light.png` (form fields), all about 8–12 px radius against the theme's 2 px (`theme/theme.js:142`, where the override evidently loses to the shared theme); `-19-article-menu-light.png` (rounded, drop-shadowed menu); `components/NewStoriesBar.jsx:77` (`borderRadius: '22px'`, `boxShadow: 3`)
- Seen or inferred: SEEN (bar: CODE)
- Problem: everything else in the app is square-cornered with hairlines (why-chips, badges, buttons, Priority segments, status filter chips). These four pieces are the only rounded, shadowed objects, and they look borrowed from another app. The filter pill is the loudest thing on the filtered Everything page.
- Proposal: phone first. Set the "Showing" chip to the same 2 px-radius outlined tag as the status filter chips, with an × on the right. Make the outlined-input radius actually apply, by targeting `.MuiOutlinedInput-notchedOutline` as well, and check it in both themes. Give the ⋯ menu a hairline border and no shadow, like a slip of `stock` paper. Draw the "new stories" bar as a square stop-press slip (ink ground, 2 px radius, hairline instead of shadow); its own comment already calls it "a stop-press slip".
- Size: S
- Needs a decision from the owner? no

#### 9. Free to read behaves differently on Today and Everything
- Where: Today and Everything
- Evidence: `views/LatestView.jsx:162` and `:244-246` show "14 paywalled stories hidden" (`newsgeek-08-latest-free-to-read-light.png`); `views/TodayView.jsx` reads no `hiddenPaywalled` (grep), and its empty text is always "the presses are warming up" (`:205-209`, `-29-today-empty-light.png`)
- Seen or inferred: CODE + SEEN
- Problem: with Free to read on, Today quietly prints fewer stories and never says so. If it hides all of them, the reader is told that the presses are warming up, which is false and points them nowhere. On Everything, the hidden count sits on its own line above the switch it explains (`-08`), so the cause is printed before the control.
- Proposal: phone first. On both pages, print the count under the switch, in the same row group: "Free to read · 14 paywalled stories hidden". When the paper is empty because of the filter, say "Every story today needs a subscription. Turn off Free to read to see them." and offer the switch right there. This needs the front-page payload to carry the hidden count. If it does not yet, that is a small additive gateway change, deployed gateway first.
- Size: S (M if the gateway field is needed)
- Needs a decision from the owner? no

#### 10. Opening the app can land mid-paper, and the harness never shows the top of Today with stories
- Where: Today, on any load the router reports as POP
- Evidence: `components/AppMain.jsx:32-41` restores the saved scroll position whenever `navType === 'POP'`, and a fresh page load is POP in react-router. The scroll is kept in sessionStorage (`hooks/scrollMemory.js:22`). `newsgeek-26-today-light.png` (scene "today", `goto: '/'`) opens scrolled into the State section, and so do `-19`, `-20` and `-35`. No scene shows the masthead above a lead story.
- Seen or inferred: SEEN in the harness; SUSPECTED on a device
- Problem: on a phone, sessionStorage survives a reload, and on Android usually survives a PWA brought back from the recents list. A reader who opens the paper in the morning can land wherever they stopped the night before, with the "N new stories" bar as the only clue. For the review, the most important screen in the app, the top of the front page with its lead, has no audited still.
- Proposal: phone first. Restore the scroll only when the saved position is recent, for example less than 30 minutes old (store a timestamp next to `scroll`), or only when the front page's `generatedAt` has not changed. After that, a morning open starts at the masthead. In the harness, clear sessionStorage before scene 26, or give scene 26 its own browser context, so "today" is the top of the page.
- Size: S
- Needs a decision from the owner? no

#### 11. Opened stories barely change colour
- Where: every headline
- Evidence: `components/ArticleItem.jsx:82` (`'&:visited': { color: 'text.secondary' }`); `theme/theme.js:36-37` (light: ink `#1B1A17` → inkSoft `#47433B`; dark: `#EDE7DA` → `#CDC5B4`)
- Seen or inferred: CODE (no scene shows a visited link)
- Problem: on a phone, at 21 px bold, the two inks are almost the same, so after returning from a story the reader cannot see what they have already opened. That matters most on Everything, a long list re-read across the day. App-side read state is planned with the story page (plan "Read state"), but until then `:visited` is the only signal.
- Proposal: phone first. Set visited headlines in `inkFaint` and weight 600 instead of 700. Browsers allow only colour changes on `:visited`, so the weight change needs the planned read state; the colour alone is a start. Check both themes against the contrast test (`__tests__/theme/gazetteContrast.test.js`). When read state lands, a small "Read" note in the publisher line is the clearer mark.
- Size: S
- Needs a decision from the owner? no

#### 12. Settings saves in two different ways, and edits can be lost
- Where: Settings `/settings`
- Evidence: `views/SettingsView.jsx:68` and `:196` (open-with links need an explicit Save; the button is grey until something changes, `newsgeek-24-settings-publishers-dark.png`); every other control on the page (Home places, Open stories in a new tab, Publishers) and in the sheets saves at once; grep finds no `useBlocker` or `beforeunload`
- Seen or inferred: CODE + SEEN
- Problem: on the phone, Settings is one long page (Home places, Reading, Open-with links, Publishers). A reader who edits a link template, then flips "Open stories in a new tab" and taps Back, loses the edit silently, because the toggle above it had saved by itself.
- Proposal: phone first. Save each link when its field loses focus, if it is valid, and say "Saved" under the field. Remove the page-level Save. If explicit Save stays, show an "Unsaved changes — Save / Discard" bar pinned above the tab bar while the links are dirty.
- Size: S
- Needs a decision from the owner? no

### Smaller findings

**Today and Everything**
- Everything's section tabs list All, Local, State, National, World and Tech, but not Around Arkansas, which Today prints as its last section (`utils/vocab.js:30`, `newsgeek-01-latest-light-desktop.png`). Two lists of sections for one paper. CODE + SEEN.
- On the phone, the section tabs cut "WOR…" off at the right edge with no fade or arrow (`-01`). A cut-off label is a common scroll hint, but a fade on the right edge would read as deliberate. SEEN.
- The OFFICIAL card puts the time on its own line under the badge and publisher (`-01`, "12m ago"), while every other card has the time on the publisher line. On narrow screens, set the time after the publisher and let it wrap only when it has to. SEEN.
- Each story's time is its own tab stop (`components/TimeAgo.jsx:19`, `tabIndex={0}`) and comes before the headline, so a keyboard user tabs through publisher time, headline and ⋯ for every story, with the time first. Move the absolute time into the headline link's hidden text and drop the tab stop. CODE.
- Desktop: the excerpt runs to about 90 characters a line in the 672 px column (`-01-latest-light-desktop.png`). Capping the excerpt at about 62ch (and leaving the headline full width) would read better. SEEN.
- Desktop: there are no keyboard shortcuts for a list you read top to bottom (j/k to move between stories, o to open). Optional. CODE.
- There is no manual refresh on the phone; resume refresh and the "N new stories" bar cover most of it. Pull-to-refresh is in the plan's N2 Briefing, so it is noted here, not reported. CODE.

**Story menu and Source sheet**
- The same setting has three names: "In my paper" (sheet), "ON/OFF" (Sources row) and "In your paper" (Sources section head). For an aggregator publisher the sheet says "Hide this publisher", which is reasonable because it is a different action. Settle on "In my paper" for the switch. SEEN (`-21`, `-04`).
- The Source page sets "I SUBSCRIBE" as a small-caps flag with the switch on the left (`-06`, `-16`); the sheet sets "I subscribe" as a row label with the switch on the right (`-21`). One control, two layouts. SEEN.
- The ⋯ button sits about 8 px from the headline's first line and the headline wraps early to make room for it (`-26`, "Magnolia council sets a budget / hearing…"). If finding 2 makes the card tappable, the ⋯ could sit on the publisher line instead and give the headline the full width. SEEN.

**Sources and Add a source**
- The Add sheet is good (paste button, preview with the feed choice and three headlines, "Already here — Turn it on"). One gap: "Try another link" is a grey filled button (`-13`, `-15`), the only grey filled button in the app; use the outlined ink style. SEEN.
- Retire takes a source out of everyone's paper with one tap, no confirmation, and a toast with no Undo (`views/SourceDetailView.jsx:119-124`, `:180`). "Bring back" exists on the page, but the toast should carry Undo. CODE.
- The Source page's heading block says "JOURNALISM ACTIVE" and admins get a Status select reading "Active" right below (`-06`, `-09`). Status shows twice for admins. SEEN.

**Settings**
- Home places reorders with three 44 px icon buttons per row (up, down, remove) (`-18`). That is fine for 7 places. If the ring grows, a drag handle is the usual pattern, but the buttons are more accessible; keep them. SEEN.
- Under Publishers, "Sources I subscribe to" rows are links with no Remove, while "Publishers I subscribe to" rows have Remove (`-24`). Two ways to undo the same kind of thing. SEEN.

### Screens with no harness scene (unaudited)
- The top of Today with stories: the masthead above the lead story (see finding 10; every Today scene opens scrolled).
- The "N new stories" bar (`components/NewStoriesBar.jsx`), on Today and on Everything.
- Loading states: the Today spinner (`views/TodayView.jsx:186-190`), the route fallback (`App.jsx:53`), and "Fetching older stories…".
- Free to read on Today (no hidden count; see finding 9) and the Today empty state caused by Free to read.
- The section pages for State, National, World and Tech, and "Older stories" on a section page (only Local and Around are scened).
- Add a source → "Enter the feed by hand", filled in, and its validation errors (scene 07 shows only the link).
- Settings → an invalid open-with template and the save error (`views/SettingsView.jsx:89`).
- Retire and Bring back on the Source page, and their toasts.
- The login splash and signed-out state (shared `LoginSplash`).
- The ⋯ menu on desktop and the Source sheet's lower half on the phone ("More from this source", "Source details").
- A visited headline (finding 11).

### How this app handles shared concerns
- **Login:** shared `LoginSplash` from `@geeksuite/ui` (`App.jsx:164`); not scened here.
- **Navigation:** phone has a 3-tab bar (Today · Everything · Sources) with the active tab marked by an ink rule above it; desktop has a GeekShell sidebar (Today, Everything, then a "Desk" group with Sources; Settings and Sign out in the footer). Sub-pages (source, section, settings) get a back arrow on the phone that falls back to a sensible parent on a deep link (`components/navConfig.js:50`).
- **Search:** none, for stories or sources (finding 4 for sources).
- **Add:** one Add button on Sources opens a bottom sheet on the phone and a dialog on desktop: paste, Find feed, preview, Add.
- **Delete/undo:** nothing is deleted. Hiding a publisher and turning a source off are switches that reverse themselves; Retire has "Bring back" but no Undo in the toast.
- **Toasts:** shared `GeekToastProvider`. Errors are specific ("Couldn't turn X on. Try again.", "Couldn't change Free to read."); success is "Saved." / "Retired. Nobody's paper polls it now."
- **Empty:** in the paper's voice ("Nothing on the front page yet — the presses are warming up…", "That's everything we've kept. Older stories age out after 90 days."); misleading only when Free to read caused it (finding 9).
- **Error:** shared `GeekLoadError` with the paper's copy ("The paper didn't arrive.", Try again); "Couldn't fetch older stories." with Try again at the foot of the list.
- **Loading:** small grey spinner in the column; no skeleton.
- **Settings:** a full page (phone: account menu → Settings with a back arrow; desktop: sidebar footer). Per-source settings live in the Source sheet (⋯ → Source settings) and on the Source page.
- **Theme toggle:** desktop top bar (sun/moon); phone has it in the account menu.
- **Dates and numbers:** relative times "12m ago" / "3h ago" with the absolute Chicago time on long-press; masthead "Wednesday, November 18, 2026" (always America/Chicago); "Updated 9:31 AM"; source health "last OK Nov 9" / "last OK 25m ago"; counts as "31 articles in the last 7 days" on the Source page but "40 this week" on the Sources row (two phrasings).
- **Update:** cache-first PWA with the shared `GeekUpdateIndicator` "Updating…" (`main.jsx:39`).

### Works well — keep
- The County Gazette identity: Newsreader headlines, Libre Franklin small-caps labels, the thick-over-thin rule under the top bar, heavy section rules, hairlines instead of cards. It holds on every screen and both themes, and dark mode is warm stock (`#1C1A16`) with off-white ink, not black.
- The one spot colour is disciplined. Civic blue appears only for "official", always together with the word OFFICIAL and a left rule, so colour is never the only signal (`ArticleItem.jsx:11-12`).
- Today has an end: "That's today's paper." with "Everything, newest first →". The lead story is set a size up, and every story says why it is there.
- "Also in KARK +2" folds duplicate wire copies into one card without hiding the other outlets (`-35`).
- Resume behaviour does not reorder the list under the thumb: a reader at the top gets the new paper quietly, and one further down gets a stop-press bar (`usePaperRefresh`, `NewStoriesBar`). "Updated 9:31 AM" in the dateline makes a stale page visible.
- Screen-reader text on each headline says where the link goes and whether it opens in a new tab (`ArticleItem.jsx:85-87`). Tab focus rings use ink, and every target is 44 px.
- The Add a source flow: paste button, two found feeds to choose from with item counts and freshness, three headlines to judge by, and a clean "Already here — Turn it on" path.
- The Priority control (★ Favorite / Normal / Less) with a one-line explanation under it.
- Excerpt reading comfort on the phone: 17 px serif at 1.6 line height in `inkSoft`, about 40 characters per line, oldstyle figures turned on.
- The error copy ("The paper didn't arrive.") and the empty copy are in character and say what is going on.

### Bugs noticed in passing
- The Settings open-with links have no unsaved-changes guard, so Back after an edit drops it without a word (finding 12).
- The outlined-input radius override in `theme/theme.js:142` does not take effect: fields render at about 8–12 px radius, not 2 px (finding 8).
- A fresh page load restores the old scroll position, because the initial load counts as POP (`AppMain.jsx:39`; finding 10).

---

## StoryGeek — design and UX review

### Verdict
StoryGeek has one of the strongest identities in the suite: wax-pinned notices, the drop cap, the candle that writes, the d20 roll card and the canon scroll with wax-seal provenance all land on the phone and in both themes. The engineering under the long turn is now excellent (client ids, persisted drafts, resume polling, honest hand-back messages), but the screen does not tell the player any of that: a one-to-three-minute wait looks exactly like a five-second one, and the player never learns that leaving is safe. The biggest gains are making the wait legible, guarding the one destructive command (`/back`), giving the phone more of its height back for the story, and settling on one "new tale" flow. The open desktop item still holds.

### Top findings (ranked, at most 12)

#### 1. The long wait has no clock, no expectation and no "safe to leave"
- Where: play surface, while a turn is written (scene 11) and while another device's turn runs (scene 15)
- Evidence: storygeek-11-gm-writing-dark.png, storygeek-11-gm-writing-light-desktop.png, storygeek-15-turn-in-progress-dark.png; apps/storygeek/frontend/src/components/play/WritingIndicator.jsx:14-38; pages/StoryPlay.jsx:398-511 (180 s timeout from api.js:25)
- Seen or inferred: SEEN (static state) + CODE (no timer anywhere)
- Problem: a turn chains two GM calls and an extraction and can take up to three minutes. The indicator is a fixed sentence and three ghost lines; nothing changes between second 2 and second 170. On a phone the player cannot tell "working" from "stuck", so they lock the phone, reload or resend. The code already survives all of that (draft with client id, `waitForTurn` polling, "Your turn did land" toast), but the player is never told it is safe, so they will not trust it.
- Proposal (phone first): add an elapsed counter and plain expectations to the indicator: "The Game Master is writing… 0:42", with a second line "Turns take one to three minutes. You can leave; it will be here when you come back." After 120 s swap the line to "Taking longer than usual — still writing." Keep the candle. Desktop identical.
- Size: S
- Needs a decision from the owner? no

#### 2. `/back` rewinds the tale with no confirmation and no undo
- Where: composer, Commands menu → `/back`
- Evidence: storygeek-12-commands-light.png ("Return to your latest checkpoint."); pages/StoryPlay.jsx:398-426 sends it like any turn; backend/src/controllers/storyController.js:293-310 restores the checkpoint snapshot over the transcript
- Seen or inferred: CODE
- Problem: every turn after the checkpoint is replaced by the snapshot the moment Send is pressed. Picking `/back` from the menu writes it into the box, so one more tap on Send (or Enter) loses real fiction and real AI spend. It is the only destructive action in the app without a confirm, while deleting a whole tale has a confirm, an Undo toast and 30 days in Recently deleted.
- Proposal (phone first): when the input starts with `/back`, open a small sheet before sending: "Return to 'Before the gate' (turn 8)? Turns 9–12 will be removed." with Return / Keep playing. Better still, let `/back` open a checkpoint picker (the data is already in `/list-checkpoints`). Desktop: same as a centred dialog.
- Size: S (confirm), M (picker)
- Needs a decision from the owner? no

#### 3. On the phone a third of the play screen is chrome
- Where: play surface, phone
- Evidence: storygeek-04-play-dark.png, storygeek-04-play-light.png, storygeek-08-composer-dark.png; pages/StoryPlay.jsx:707-758; components/navConfig.jsx:89 (top bar title "At the Table")
- Seen or inferred: SEEN
- Problem: the shell bar "At the Table" (~60 px), the tale title and subline (~55 px) and the scene strip with four tools (~52 px) take about 165 px of a 664 px viewport before the first line of story, and the composer takes another ~75 px. The story gets about 60% of the screen, less with the keyboard up. "At the Table" tells the player nothing the title row below it does not.
- Proposal (phone first): on `/play` below `md`, let the tale's own header be the bar: back arrow, title, the ⋯ tools, and drop the shell title row; or collapse the title + subline into the scene strip when the transcript is scrolled up (it comes back on scroll down). Target: first story line at about 110 px. Desktop unchanged.
- Size: M
- Needs a decision from the owner? yes — whether the play route may hide or replace the shell top bar on the phone

#### 4. The four phone tools are icons whose meaning a thumb cannot discover
- Where: scene strip on the play surface, phone and desktop below 1536 px
- Evidence: storygeek-04-play-dark.png, storygeek-04-play-dark-desktop.png; pages/StoryPlay.jsx:653-705
- Seen or inferred: SEEN + CODE
- Problem: Party is a group icon (fine), Journal is a quill-and-scroll in accent colour, Bookify is an open book, EPUB is a download arrow. The open book reads as "journal" and the download arrow as "save". The tooltips that explain them never appear on touch, and at 1280 px desktop the same icons show because the worded tools only start at `xl`.
- Proposal (phone first): keep Party and Journal as icons but give Journal its word ("Journal") on the strip, and fold Bookify and EPUB into one ⋯ "Take the tale away" menu (Read as prose, Download EPUB). On desktop at `lg` show the worded Journal and the ⋯ menu.
- Size: S
- Needs a decision from the owner? no

#### 5. Two "new tale" forms that disagree with each other
- Where: list FAB / "New Tale" button → dialog; sidebar "Begin a Tale" → `/create`
- Evidence: storygeek-02-new-tale-dialog-dark.png, storygeek-14-create-dark.png, storygeek-14-create-light-desktop.png; pages/StoryList.jsx:359-411; pages/StoryCreation.jsx:42-57, 107-201
- Seen or inferred: SEEN + CODE
- Problem: the dialog asks for a prompt and says the title is optional ("The AI will suggest one"); the page requires a title, offers hooks, "Roll for Inspiration" and "Additional Details". The same job has five names (New Tale, Begin a Tale, New Adventure, Begin the Tale, Begin). On the phone `/create` puts four hook cards first, so the form starts more than a screen down.
- Proposal (phone first): one flow. Keep the full-screen dialog from the FAB, add a horizontal row of hook chips and the d20 "Roll for inspiration" above the prompt, keep Title optional. Point the sidebar row at the same dialog (or drop it), and use one verb everywhere ("Begin a tale").
- Size: M
- Needs a decision from the owner? yes — which of the two forms survives

#### 6. Desktop three columns: the open item still holds
- Where: play surface at 1280 px
- Evidence: storygeek-04-play-dark-desktop.png, storygeek-11-gm-writing-light-desktop.png; pages/StoryPlay.jsx:67-71, 833-849
- Seen or inferred: SEEN
- Problem: 220 px of shell sidebar (five links) + 240 px left rail + 264 px right rail + gaps leave the page about 500 px wide and the prose about 450 px, roughly 55 characters a line. That is readable, but the parchment page is narrower than on a phone in landscape, and the right rail already scrolls on its own (threads are cut off at the bottom). SUITE_TODO §3's "loses 220 px to the sidebar" is accurate today.
- Proposal: on `/play` only, let the shell sidebar become the temporary drawer (as on the phone) between `lg` and `xl`; the back arrow and the This Tale rows cover navigation. That returns ~220 px to the page. Alternatively fold the right rail into its sheet below `xl`, as it already folds below `lg`. Do not add a rail (standing decision).
- Size: M
- Needs a decision from the owner? yes — which width gives way: the shell sidebar or the right rail

#### 7. "Characters" in the sidebar is a dead end
- Where: sidebar → This Tale → Characters (`/characters/:id`)
- Evidence: pages/CharacterSheet.jsx:21-37 ("Character management is being inscribed. Use the /char command…"); components/navConfig.jsx:57-66
- Seen or inferred: CODE (no scene)
- Problem: a top-level nav row on every play screen leads to a placeholder; the real cast already lives in the Party & Threads panel.
- Proposal: remove the row until the codex exists, or point it at the Party sheet.
- Size: S
- Needs a decision from the owner? no

#### 8. Completed tales still say "Continue" and "The opening scene is still being set"
- Where: Your Tales cards
- Evidence: storygeek-01-list-dark-desktop.png (The House on Ashfield Lane, Complete, 88 turns); pages/StoryList.jsx:282-320
- Seen or inferred: SEEN
- Problem: any tale without a current situation shows the "still being set" line, including an 88-turn finished one, and the action is always "Continue".
- Proposal: for `completed` show "Read" (and open the transcript or Bookify); for a tale with turns but no situation show its last narration line, not the setting-up text.
- Size: S
- Needs a decision from the owner? no

#### 9. Exports run long with almost no feedback
- Where: Bookify dialog, EPUB tool
- Evidence: storygeek-09-bookify-dark.png; pages/StoryPlay.jsx:350-363, 617-636, 911
- Seen or inferred: CODE
- Problem: Bookify can take as long as a turn but shows only an indeterminate bar. EPUB shows nothing at all on the phone: the icon just goes disabled, then a file appears (or a toast fails) minutes later.
- Proposal: Bookify: the candle and "Binding the tale… 0:35" in the dialog body. EPUB: an info toast "Binding the EPUB — this takes a minute" and a success toast when the download starts.
- Size: S
- Needs a decision from the owner? no

#### 10. Per-entry clock times add a line to every turn and no sense of day
- Where: transcript
- Evidence: storygeek-04-play-dark.png ("05:01 AM", "05:15 AM", "05:30 AM"); components/play/TranscriptEntry.jsx:11
- Seen or inferred: SEEN
- Problem: each player entry spends a full line on a letter-spaced time with no date, so a campaign played over weeks reads as one morning, and the phone loses ~20 px per entry.
- Proposal (phone first): drop the per-entry time on the phone; insert a small day rule ("Tuesday 17 November") when the date changes. Desktop can keep times on hover.
- Size: S
- Needs a decision from the owner? no

#### 11. The list header and cards are roomy for a phone
- Where: Your Tales, phone
- Evidence: storygeek-01-list-dark.png, storygeek-01-list-light.png; pages/StoryList.jsx:171-190
- Seen or inferred: SEEN
- Problem: "Your Tales" appears in the top bar and again as the page title with an overline and a count line (~160 px), and each card is ~260 px, so two tales fit. With a handful of tales this is fine; it is the first screen of every session, though.
- Proposal (phone first): drop the repeated page title below `md` (keep "4 adventures are waiting for you." as the lede), and tighten card padding from 20 px to 16 px. Desktop unchanged.
- Size: S
- Needs a decision from the owner? no

### Smaller findings

Play surface
- A command the player sends is drawn as an in-character action ("Corvin Hale · You — /recall what do we know about Mira", storygeek-04-play-dark.png). Style command lines as table talk (smaller, no italic, no name). SEEN.
- Tooltips reappear when focus returns to their button after a sheet closes ("Bookify — the tale as prose" over the prose in storygeek-09-bookify-dark.png; "Commands" in storygeek-15-turn-in-progress-dark.png). May be a harness artifact; check on a device. SUSPECTED.
- The scene strip truncates the time of day ("The Weighing-House · du…") on a 390 px phone. Drop the time from the strip; it is in the sheet. SEEN.
- In the "turn being written elsewhere" state the Send button shows a near-invisible dot rather than a spinner (storygeek-15-turn-in-progress-dark.png). SEEN.

Panels and sheets
- Scene card tag "INTACT" next to Day/dusk/rain is unexplained (storygeek-05-rail-sheet-left-dark.png). Say what is intact or drop it. SEEN.
- Party & Threads nests cards inside a card inside a sheet (storygeek-06-rail-sheet-right-light.png); the inner borders could go on the phone. SEEN.
- The sheet's close X sits about 10 px below the title baseline (storygeek-05, 06). That is the shared GeekSheet; note only. SEEN.

Creation
- Hook icons mix colour emoji (Void Drifter) with line glyphs (crossed swords, candle) (storygeek-14-create-dark.png). Pick one. SEEN.

List and deleted
- "Recently deleted" appears twice on desktop: in the sidebar and as a link under the grid (storygeek-01-list-dark-desktop.png). Keep the page link on the phone only. SEEN.

### Screens with no harness scene (unaudited)
- `/characters/:storyId` (Character Codex placeholder)
- `/settings` (Game Master model pin)
- `/login`
- Play: load error (`GeekErrorState` "The tale would not open"), the narrator-unavailable system line, a failed turn toast, the "your turn is still being written" variant, checkpoint created/restored/listed system lines, `/char` and `/info` output, story ended
- Bookify loading and error states; EPUB in progress
- Journal with nothing known; Recently deleted when empty
- `/create` on the phone below the hooks (the form itself)
- Desktop scenes for 02, 03, 05–08, 12, 17

### How this app handles shared concerns
- Login: shared suite SSO via `LoginPage` → baseGeek.
- Navigation: GeekShell sidebar on desktop (Tales; This Tale while a tale is open), hamburger drawer on the phone; no bottom bar; in-page back arrow on the play header.
- Search: none.
- Add: phone FAB "New Tale" (`useGeekPrimaryAction`), desktop header button, plus the sidebar's separate `/create` page.
- Delete / undo: confirm dialog ("Spare It" / Delete) → toast with Undo → Recently deleted for 30 days with a countdown → "Delete forever" confirm.
- Toasts: GeekToastProvider; used for turn outcomes ("Your turn did land…"), copy, export errors.
- Empty: themed d20 empty state with one CTA ("Begin your first tale").
- Error: `GeekErrorState` with Retry for load failures; toasts for transient ones.
- Loading: centred spinner for list and play; candle indicator for turns.
- Settings: `/settings` (AI model pin), reached from the account menu.
- Date and number formats: cards "Nov 17, 2026" (en-US forced); transcript times locale two-digit; "41 turns · 12 rolls".

### Works well — keep
- The identity on every screen: wax pins in genre colours, Cinzel titles, Alegreya prose, the drop cap, the candle, the d20 roll card, the canon scroll with N/O/Y wax-seal provenance. Both themes read well.
- Turn recovery: client ids, the draft that remembers an in-flight turn, polling with an easing delay, rebuilding the transcript from the record, and messages that tell the truth ("Your words are back — sending them again is safe").
- The composer rides the keyboard and only refocuses after the player's own send; a fresh reply scrolls to its first line, not its last.
- Rails collapse to full-height sheets and the phone keeps the location on screen as the strip that opens them.
- The Commands menu gives each command a sentence instead of a 12 px hint line.
- Delete → Undo → Recently deleted with "Removed for good in 27 days (Dec 15, 2026)".

### Bugs noticed in passing
- The New Tale dialog's Title placeholder says "The AI will suggest one", but a blank title is sent as "Untitled Story" (pages/StoryList.jsx:99 and 396; the backend does not generate one).

---

## FlockGeek — design and UX review

### Verdict
FlockGeek works and is calm, and the harvest sheet in the thumb zone was the right move, but the one daily job still takes five to seven taps and starts from zero every morning: no remembered pen, quick counts that skip the flock's real range, and a Home screen that never says whether today has been logged. Visually it is the weakest identity in the suite. The theme file calls it "Field Ledger", but on screen it is amber, a serif headline font and stock Material cards and filled chips, with no motif. The biggest gains are a three-tap egg log, a "today" line on Home, compact list rows on the phone, and leaning into the ledger look. The known offline-page item no longer holds.

### Top findings (ranked, at most 12)

#### 1. Logging eggs takes 5–7 taps and remembers nothing
- Where: Home and Egg Log → FAB → Quick harvest sheet
- Evidence: flockgeek-02-harvest-sheet-light.png; components/QuickHarvestEntry.jsx:44-45 (count 0, location ""), :107-110 (auto-select only when there is one location), :112 and :224 (chips 1–6 and 12)
- Seen or inferred: SEEN + CODE
- Problem: with more than one pen (the fixture has three), every morning is: FAB, open the Location select, pick the pen, set the count, Log, which is 5 taps. The chips stop at 6 and jump to 12, so a typical 8–11-egg day (the fixture averages 8.1/day) is 6, +, + or 12, −, −, which is 7 taps. Nothing is carried over from yesterday.
- Proposal (phone first): remember the last pen per user and pre-select it; show the pens as a row of chips instead of a Select (three fit on 390 px); build the count chips around recent counts at that pen (for example last count −2 … +2, plus "Other"), or prefill the count with yesterday's number. Target: FAB → count → Log, 3 taps. Desktop inline panel gets the same defaults.
- Size: S–M
- Needs a decision from the owner? no

#### 2. Home does not say whether today's eggs are logged
- Where: Home, phone and desktop
- Evidence: flockgeek-01-home-light.png, flockgeek-01-home-dark.png, flockgeek-01-home-light-desktop.png; pages/HomePage.jsx:58-111
- Seen or inferred: SEEN
- Problem: the first screen is the date, "Good morning, Chef", a lede, two links and four tallies. The question a keeper opens the app with ("did someone already collect today?") is answered only by reading the activity list's dates, which on the phone sit half under the FAB.
- Proposal (phone first): a one-line "Today" strip directly under the greeting: "Today: not logged yet — Log eggs" (tapping opens the sheet), or "Today: 9 eggs, North Coop ✓ by Heather". Drop the "View birds / Groups" links on the phone (the tab bar already has both) to pay for it.
- Size: S
- Needs a decision from the owner? no

#### 3. The quick counts read as "days"
- Where: Quick harvest sheet
- Evidence: flockgeek-02-harvest-sheet-light.png; components/QuickHarvestEntry.jsx:164-235
- Seen or inferred: SEEN
- Problem: the order is count stepper and "÷ 1 days" on one row, then the two-line "÷ days is how many days…" caption, then the "1 2 3 4 5 6 12" chips. Sitting under the days caption, the chips read as a days picker. The ÷ days field is needed rarely (the code prefills it from the last harvest) but takes a third of the sheet.
- Proposal (phone first): put the count chips directly under the count with a small "Eggs" label; move ÷ days into one quiet line, "Covers 1 day · change", that expands to the field and caption. The "≈ x eggs/day" line stays.
- Size: S
- Needs a decision from the owner? no

#### 4. The daily action is an unlabelled icon on the phone and covers the list
- Where: Home and Egg Log FAB, phone
- Evidence: flockgeek-01-home-light.png (FAB over "Nov 17" in Recent activity), flockgeek-09-egg-log-light.png (FAB over a card's ⋯); components/QuickHarvestSheet.jsx:29-33
- Seen or inferred: SEEN
- Problem: desktop says "Log today's eggs" in words; the phone, where the job happens, has an egg glyph only, and it sits over the date column and the row menus.
- Proposal (phone first): an extended FAB "Log eggs" on Home and Egg Log if `GeekFab` takes a label; give the lists bottom padding equal to the FAB so the last row's ⋯ is reachable.
- Size: S
- Needs a decision from the owner? no

#### 5. "Field Ledger" exists only in a code comment
- Where: every screen
- Evidence: flockgeek-03-birds-light.png, flockgeek-11-groups-dark.png, flockgeek-12-locations-light.png, flockgeek-01-home-light-desktop.png; theme/theme.js:1-8, 44-104
- Seen or inferred: SEEN
- Problem: next to Candlelit Table, Signal Box or Moving Day, FlockGeek has no motif. The theme sets amber, DM Serif Display headings and IBM Plex Sans and stops there; lists are stock MUI cards, statuses are stock filled chips in Material green, cyan and blue ("active", "breeder flock", "coop"). Only Home's ruled tally grid hints at a ledger.
- Proposal (phone first): commit to the ledger: ruled paper lines and a red margin rule on list pages, column rules instead of card borders, statuses as rubber stamps or pencilled ticks in the ink palette rather than filled chips, egg counts in tally marks or ledger numerals on Home and the Egg Log. A restyle through flockgeek's own theme only.
- Size: M–L
- Needs a decision from the owner? yes — confirm "Field Ledger" as the identity (or name another) before a restyle

#### 6. Record cards on the phone are tall key/value tables headed by the wrong field
- Where: Birds, Egg Log, Hatch Log, Pairings (phone)
- Evidence: flockgeek-03-birds-light.png, flockgeek-09-egg-log-light.png, flockgeek-08-hatch-log-dark.png, flockgeek-10-pairings-light.png; components/primitives/ResponsiveTable.jsx
- Seen or inferred: SEEN
- Problem: each bird is a ~190 px card of NAME / SEX / BREED / HATCH DATE / STATUS headed by the tag ("NC-001"), so 2½ birds fit on a screen and a keeper scans for "Henrietta" in the second line. Egg cards spend rows on "Days 1", "Rate 9.0/day" and "Notes -"; hatch cards have eight rows and a date title with no label.
- Proposal (phone first): two-line rows. Birds: "Henrietta  NC-001" / "Hen · Buff Orpington · 2y 5m" with the status as a small stamp. Eggs: "Wed 18 Nov · North Coop · 9 eggs", with days and rate only when days > 1 and notes only when present. Hatch: "Set 28 Oct · 24 eggs · Incubating, day 21". Desktop keeps the table.
- Size: M
- Needs a decision from the owner? yes — whether a bird is known by name or by tag (which leads the row)

#### 7. Two list grammars inside one app
- Where: Birds / Egg Log / Hatch Log / Pairings vs Groups / Locations
- Evidence: flockgeek-03-birds-light.png, flockgeek-06a-birds-filter-sheet-light.png, flockgeek-04-birds-row-sheet-dark.png vs flockgeek-11-groups-dark.png, flockgeek-12-locations-light.png
- Seen or inferred: SEEN
- Problem: four pages put search and filters in a "Filters" sheet with a Sort pill and keep edit/delete behind ⋯; Groups and Locations show a boxed Search + Select on the page (~120 px) and a red trash icon one tap from deletion beside every row's pencil.
- Proposal: Groups and Locations adopt the Filters/Sort pills and the ⋯ row sheet; with three locations the filter box is not needed at all.
- Size: S–M
- Needs a decision from the owner? no

#### 8. Every delete is a browser `window.confirm`, with no undo
- Where: Birds, Groups, Locations, Pairings, Egg Log, Hatch Log
- Evidence: pages/BirdsPage.jsx:239, GroupsPage.jsx:93, LocationsPage.jsx:78, PairingsPage.jsx:81, EggLogPage.jsx:79, HatchLogPage.jsx:75
- Seen or inferred: CODE
- Problem: the review of 2026-11-15 noted this for the Egg Log; it is all six pages. In an installed PWA the browser's own dialog (with the site address in it) breaks the app's look, and the records are soft-deleted already, so the confirmation guards something that could be undone.
- Proposal: delete at once and show a toast with Undo (restore the soft-deleted record), the way StoryGeek and others do.
- Size: S–M
- Needs a decision from the owner? no

#### 9. "Add X" gets a row of its own, top right, on every page
- Where: Birds, Egg Log, Hatch Log, Pairings, Groups, Locations (phone)
- Evidence: flockgeek-03-birds-light.png, flockgeek-09-egg-log-light.png, flockgeek-10-pairings-light.png
- Seen or inferred: SEEN
- Problem: the add button sits alone on a ~60 px row at the top right, the farthest point from a thumb, and on the Egg Log it competes with the FAB ("Add Detailed Entry" and the egg FAB do nearly the same job).
- Proposal (phone first): use the FAB for the page's add on Birds, Hatch, Pairings, Groups and Locations; on the Egg Log, put "Detailed entry (another day)" inside the harvest sheet as a link. Desktop keeps the header button.
- Size: S
- Needs a decision from the owner? no

#### 10. Dates are three formats and bird age is hidden
- Where: Home, lists, edit dialog
- Evidence: flockgeek-01-home-light.png ("Nov 18", "WEDNESDAY, NOVEMBER 18"), flockgeek-03-birds-light.png ("6/1/2024"), flockgeek-09-egg-log-light.png ("11/18/2026"), flockgeek-05-birds-edit-dialog-light.png ("Age 2y 5m" only here)
- Seen or inferred: SEEN
- Problem: numeric US dates on the lists are slower to read than the Home style, and the most useful bird fact (age) only appears inside Edit.
- Proposal: one short format everywhere ("18 Nov 2026", "18 Nov" this year) and age on the bird row.
- Size: S
- Needs a decision from the owner? no

#### 11. Desktop bird table headers do not line up with their columns
- Where: Birds, desktop
- Evidence: flockgeek-03-birds-dark-desktop.png
- Seen or inferred: SEEN
- Problem: "Name", "Sex", "Breed", "Hatch Date" and "Status" headers are centred over left-aligned values, so each header floats between two columns.
- Proposal: left-align headers with their cells (numbers right-aligned).
- Size: S
- Needs a decision from the owner? no

### Smaller findings

Home
- The "View birds / Groups" links duplicate the tab bar on the phone (flockgeek-01-home-light.png). SEEN.
- "Hatches 12 recent" sits alone on a third tally row on the phone; a 2×2 grid without it, or with eggs/day first, is tighter. SEEN.
- The load error is clear and replaces the zeros (flockgeek-01b-home-load-error-dark.png); its detail line is set in a monospace font ("Gateway timeout") unlike the rest of the app. SEEN.

Names
- One job, five names: "Log eggs" (FAB), "Quick harvest" (sheet), "Log today's eggs" (desktop), "Harvest History" and "Add Detailed Entry" (Egg Log), "Eggs" (tab). SEEN.
- Add bird says "More Details", Edit bird says "Bird Details" for the same section; Age appears only in Edit and Origin only in Add (flockgeek-07, flockgeek-05). SEEN.

Hatch Log
- The card title is the set date with no label, followed by "HATCH DATE -" (flockgeek-08-hatch-log-dark.png). Label it "Set 28 Oct". SEEN.

Offline page (known item)
- SUITE_TODO §3 "flockgeek offline.html unstyled" no longer holds: public/offline.html has light and dark variables matching the manifest colours. One nit: in light mode the button is white on #b57b00, about 3.6:1; the app theme pins dark ink on that amber for this reason. CODE.

Leftovers
- `/dashboard` is still routed and renders scaffold cards ("API Status", "Next Steps: Add feature routes…") (pages/DashboardPage.jsx:6-25). Remove the route. CODE.

### Screens with no harness scene (unaudited)
- `/settings`, `/login`, `/register`, `/dashboard`
- Egg Log add and edit dialogs; Hatch, Pairing and Group add/edit dialogs; Add location
- The harvest sheet with a pen selected (last-harvest chip, prefilled days) and with exactly one location
- Empty states for every list; load errors on the list pages
- Desktop for Hatch Log, Egg Log, Pairings, Groups, Locations and the location dialog (scenes 08–13 are phone only)

### How this app handles shared concerns
- Login: shared `LoginSplash` → baseGeek SSO.
- Navigation: GeekShell sidebar on desktop (Flock / Records / Setup); on the phone a five-tab bottom bar (Home, Eggs, Birds, Hatch, Groups) plus the drawer for Locations and Pairings.
- Search: inside the Filters sheet (Birds, Egg, Hatch, Pairings); inline boxes on Groups and Locations; `/` focuses search or the egg count.
- Add: per-page "Add X" button at the top right; FAB for logging eggs on the phone.
- Delete / undo: `window.confirm`, no undo (records are soft-deleted server-side).
- Toasts: `useToast`, for example "Logged 9 eggs".
- Empty: not seen in any scene.
- Error: `GeekLoadError` with Retry on Home.
- Loading: not seen in any scene.
- Settings: `/settings` (theme preference), from the account menu.
- Date and number formats: mixed — "Wednesday, November 18", "Nov 18", "11/18/2026", "6/1/2024"; rates "9.0/day"; "8.1 14d avg".

### Works well — keep
- The harvest sheet itself: 56 px steppers, 44 px chips, the ÷ days rule written on the page, the last-harvest chip and prefilled days, and the sheet closing itself on success.
- Home shows an error instead of reassuring zeros when a read fails.
- The phone tab bar puts the four record types one tap away.
- The Sort sheet shows the active field and direction plainly.
- Dark mode is warm and readable; Home's ruled tally grid is the one place the ledger shows through, so build from it.
- Local-date handling (`localDateString`, calendar-day display) is correct.

### Bugs noticed in passing
- Groups shows "1 birds" (pages/GroupsPage.jsx:215; seen in flockgeek-11-groups-dark.png).

---

## BaseGeek — design and UX review

### Verdict
Signal Box is the most complete identity in the suite. The track diagram, lamps that always carry a word, the split-flap fascia, Dymo labels, screws and levers are consistent across Home, DataGeek, UserGeek, AIGeek and Settings, in both themes. The SSO login matches its "plain, like StartGeek" intent well. The weak spots are what the panel does with bad news: "3 CAUTIONS" names a count but the causes sit four or five phone screens down. The others are the phone layouts of Home and AIGeek, the Account page (the one screen that drops back to stock Material), and UserGeek, which can only add and delete. The login needs the small things a phone password manager relies on.

### Top findings (ranked, at most 12)

#### 1. The fascia says "3 CAUTIONS" but not which, and the answer is far below
- Where: Home (Signal Box), phone and desktop
- Evidence: basegeek-00-home-dark.png, basegeek-00-home-dark-desktop.png; pages/BaseGeekHome.jsx:90-151 (fascia), 214-251 (annunciator), 358-379 (panel order)
- Seen or inferred: SEEN + CODE
- Problem: the board counts faults and cautions from the lamps and the AI attention list, but it is not a link and lists nothing. On the phone the annunciator (panel 3) comes after nine station cards, four depot cards, three stacked gauges and the chart recorder, roughly five screen heights down; on desktop it is below the fold. Meanwhile every lamp in The Line is green, so the first screen says "trouble" and shows "all fine".
- Proposal (phone first): make the line-status board a button that scrolls to the annunciator (or opens AIGeek → Needs attention); when anything is lit, print the lit window names on one line under the flaps ("Provider down · Paid fallback · Catalog thin"). When a fault is lit, move the Annunciator panel above The Line.
- Size: S
- Needs a decision from the owner? no

#### 2. On the phone, The Line is a long column of green cards
- Where: Home, phone (admin and member)
- Evidence: basegeek-00-home-dark.png, basegeek-18-home-member-light.png; signalbox/SuiteMap.jsx
- Seen or inferred: SEEN
- Problem: each station is a ~90 px card (nameboard, description, ONLINE, "42ms · v1.4.2"), so nine stations take ~820 px before the depot, and the readings that change (instruments, annunciator) come after. Heather, who lands here as a launcher, scrolls past descriptions she does not need to reach bookGeek.
- Proposal (phone first): below `sm`, draw healthy stations as a compact grid of lamp + nameboard (three per row, about 200 px for nine), keeping the vertical track as the motif along the left; a station that is not green expands to the full card with its word and detail. Latency and version on tap. Desktop keeps the horizontal diagram.
- Size: M
- Needs a decision from the owner? no

#### 3. AIGeek's sticky section nav wraps to two rows on the phone
- Where: AIGeek, phone
- Evidence: basegeek-11-aigeek-status-dark.png, basegeek-12-aigeek-apps-light.png, basegeek-14-aigeek-catalog-tryit-light.png; pages/aigeek/StatusNav.jsx:27-39 (`position: sticky`, `flexWrap: 'wrap'`)
- Seen or inferred: SEEN
- Problem: "Needs attention · Usage and cost · Apps and keys / Catalog · Try it" breaks onto two lines, so the sticky bar holds ~110 px (17% of the viewport) on every scroll of the longest page in the console; the "6" badge also sits on top of the "n" of "attention".
- Proposal (phone first): one row that scrolls sideways inside itself (`nowrap`, `overflow-x: auto`), with short labels ("Attention 6", "Usage", "Apps & keys", "Catalog", "Try it") and the count as a Dymo tag after the word rather than a badge over it. Desktop unchanged apart from the badge.
- Size: S
- Needs a decision from the owner? no

#### 4. Account is the one stock-Material screen, with three Save buttons
- Where: `/account`, phone and desktop
- Evidence: basegeek-07-account-light.png, basegeek-07-account-dark-desktop.png; pages/AccountPage.jsx:58-80 (SectionCard), 296, 356, 404 (three SaveButtons, two of them `savePreferences`)
- Seen or inferred: SEEN + CODE
- Problem: rounded MUI cards with no screws, panel numbers or Dymo titles, a large flat orange avatar, US dates ("12/31/2024") where UserGeek writes "31 Dec 2024". Each card has its own Save, and "Global preferences" and "Accent color" both call the same save, so it is unclear what each button saves; leaving after editing two cards keeps only what was saved.
- Proposal (phone first): rebuild the cards as Signal Box `Panel`s with Dymo titles and the steel avatar used on UserGeek; one save for the page (a sticky "Save changes" bar that appears only when something changed), or apply-on-change like Settings already does ("There is no Save button because there is nothing to save"). Use one date format.
- Size: M
- Needs a decision from the owner? no

#### 5. UserGeek can only add and delete
- Where: `/usergeek` (Token Board)
- Evidence: basegeek-01-usergeek-dark.png, basegeek-01-usergeek-light-desktop.png, basegeek-02-usergeek-create-dark.png; pages/UserGeekPage.jsx:84, 155, 199-207
- Seen or inferred: SEEN + CODE
- Problem: there is no way to change a role, reset a password or fix a username; the only row action is a trash icon, and it is rendered on the signed-in admin's own row. Create offers username, email and password only (no role, no "generate", no show-password), and its Create button is disabled with no hint which field is missing.
- Proposal (phone first): tapping a row opens a user sheet: role (admin/user), "Set a new password", rename, and Delete inside it behind the existing confirm; no delete on your own row. In Create add a role choice and a show/generate password control.
- Size: M
- Needs a decision from the owner? yes — whether role changes and password resets belong in the console

#### 6. The login lacks what phone password managers need
- Where: SSO login (`/login?app=…`) and `/register`
- Evidence: basegeek-16-login-light.png, basegeek-16-login-dark-desktop.png, basegeek-17-register-dark.png; pages/LoginPage.jsx:102-136
- Seen or inferred: CODE + SUSPECTED (needs a device)
- Problem: the fields have no `autoComplete` ("username", "current-password", "new-password"), so iOS and Android may not offer or save the suite password, which is every app's front door. The username field will auto-capitalise on iOS. There is no show-password control. `autoFocus` opens the keyboard at once on the phone while the clock hero takes ~200 px above the card, so Sign in likely ends up under the keyboard.
- Proposal (phone first): add the three `autoComplete` values, `autoCapitalize="none"`, `spellCheck={false}`, a show-password eye; drop `autoFocus` below `sm` (or shrink the clock when the viewport shrinks). Keep the look: it matches the StartGeek intent.
- Size: S
- Needs a decision from the owner? no

#### 7. Two registration screens, and open self-registration on the household's front door
- Where: SSO login "Register" tab and `/register`
- Evidence: basegeek-16-login-light.png (tabs Sign in / Register), basegeek-17-register-dark.png ("Create a GeekSuite account", "Already have an account? Sign in"); pages/LoginPage.jsx:83-99
- Seen or inferred: SEEN
- Problem: the same job is done two ways with different layouts. More importantly, every app's login offers "Register" to anyone who reaches it, while users are otherwise created by the admin on the Token Board.
- Proposal: if registration is meant to be closed, remove the tab and route `/register` to a "Ask Chef for an account" note; if it stays, keep one screen (the tab) and redirect `/register` to it.
- Size: S
- Needs a decision from the owner? yes — should anyone be able to register?

#### 8. Provider key entry says "click away" and has an ambiguous "Done"
- Where: AIGeek → Providers
- Evidence: basegeek-11-aigeek-status-dark.png, basegeek-12-aigeek-apps-dark-desktop.png; pages/aigeek/ProvidersBlock.jsx:206, 243-257
- Seen or inferred: SEEN + CODE
- Problem: a key saves on blur ("Paste a key and click away; that is the whole setup"), while the button beside it changes from "Add key" to "Done". On a phone there is no "click away", and "Done" could mean save or cancel. A pasted secret saved by losing focus, with no visible "Saved", is the riskiest field in the console.
- Proposal (phone first): an explicit "Save key" button that commits, the other button reads "Cancel", and a one-line "Saved · …4fa" confirmation in the row. Keep save-on-blur as a convenience if wanted.
- Size: S
- Needs a decision from the owner? no

#### 9. The split-flap board breaks words on the phone
- Where: Home fascia, phone
- Evidence: basegeek-18-home-member-light.png ("ALL LINES CLE / AR")
- Seen or inferred: SEEN
- Problem: the flaps wrap per character, so the line status splits mid-word on a 390 px screen; the clock also drops below the status.
- Proposal: wrap only at spaces (one flex group per word), or use shorter messages on the phone ("ALL CLEAR", "3 CAUTIONS").
- Size: S
- Needs a decision from the owner? no

#### 10. DataGeek: a hidden tab, two duration formats, and numbered single panels
- Where: `/datageek`
- Evidence: basegeek-03-datageek-mongo-dark.png (InfluxDB behind a scroll arrow), basegeek-03-datageek-mongo-light-desktop.png ("5d 22h 19m"), basegeek-05-datageek-postgres-dark-desktop.png ("12 days 4 hours 33 minutes", panel "3 POSTGRES")
- Seen or inferred: SEEN
- Problem: on the phone the fourth store is off-screen behind an arrow although four short words fit in 390 px without the wide letter-spacing; uptime is written two ways; each tab shows a single panel numbered by its tab index (1, 3).
- Proposal: fit the four tabs (tighter tracking on the phone), one duration format ("12d 4h 33m"), and drop the panel number when a page has one panel.
- Size: S
- Needs a decision from the owner? no

#### 11. Four switches for the theme
- Where: top bar sun/moon, Settings "Night turn", Home Lever 3 "Day turn", Account "Theme" select (plus a read-only "Theme" line on the Account summary)
- Evidence: basegeek-00-home-dark-desktop.png, basegeek-15-settings-dark.png, basegeek-07-account-dark-desktop.png; pages/BaseGeekHome.jsx:282-291
- Seen or inferred: SEEN
- Problem: harmless individually, but the Account select and the Settings switch describe the same suite-wide setting in different words, and the summary card repeats it as data.
- Proposal: keep the top bar and Lever 3 (it is the motif); make Account the single place for the suite theme preference (including "system") and let Settings link to it, or the reverse. Drop the summary line.
- Size: S
- Needs a decision from the owner? no

### Smaller findings

Home
- The instruments' captions are honest ("Real ceilings only…") and the "Some readings are missing: …" caption is a good error state; keep. CODE.
- Member home offers "Your account" and "Console settings" as plain outlined buttons under The Line (pages/BaseGeekHome.jsx:381-384); a small lever pair would keep the motif. CODE.

UserGeek
- The delete button's accessible name is "delete" on every row (pages/UserGeekPage.jsx:201); name it "Delete chef". CODE.
- Long usernames wrap well on the phone (basegeek-01-usergeek-dark.png). SEEN.

AIGeek
- Provider rows repeat "sends no rate-limit headers — a 429 is the only signal" on four rows (basegeek-11-aigeek-status-dark-desktop.png); say it once in the block caption. SEEN.
- The routing card's daily-cap help ("Feature calls per bucket per day. Blank uses the door's default of 200") uses words ("bucket", "door") the rest of the page does not (basegeek-13-aigeek-routing-dark-desktop.png). SEEN.
- On the phone the catalog row puts "Override" in its own ~70 px footer per model (basegeek-14-aigeek-catalog-tryit-light.png); with dozens of models that is long. A ⋯ on the model name row would do. SEEN.

Portal
- The public portal is its own look (amber "GeekSuite", serif-less display type, "// Containerized · Polyglot") and counts "7/7 online" where Home draws nine stations (basegeek-08-portal-dark.png). If it is portfolio-facing on purpose, fine; the count should match. SEEN.

Harness
- Scenes `09-databases` and `10-databases-add` target `/databases`, which no longer exists, and produce no screenshots (tools/mobile-harness/apps/basegeek/scenes.mjs:45-60). CODE.

### Screens with no harness scene (unaudited)
- Night Watch (idle departures board) and the lamp test
- AIGeek: the top of the page on the phone (Needs attention list, Usage and cost); scenes start scrolled to Providers
- Dialogs: Mint key and its one-time key reveal, API key dialog, "More routing options" (AppConfigDialog), Remove key confirm, reset-stats confirm, delete-user confirm
- Member (`role: user`) reaching `/aigeek`, `/datageek` or `/usergeek` (RequireAdmin)
- DataGeek with a store disconnected; Redis and InfluxDB on desktop were captured, but no error cabinet
- Login with an error (wrong password, stale bundle message), session-expired return to login
- Settings below the first panel on the phone

### How this app handles shared concerns
- Login: this app is the suite SSO. `AuthFrame` copies StartGeek (thin clock, date, dark glass card, "One sign-in for every GeekSuite app") and is dark in both themes on purpose; "to continue to NoteGeek" names the calling app.
- Navigation: GeekShell sidebar (Overview / Services) on desktop, hamburger drawer on the phone, no bottom bar; Account and Settings from the avatar menu; in-page sticky jump nav on AIGeek.
- Search: none.
- Add: "Add user" outlined button in the Token Board header; "Add key" per provider; "Add app" field on AIGeek.
- Delete / undo: `ConsoleDialog` confirmation for delete user, remove key, reset stats; no undo.
- Toasts: `useToast` (discovery lever results, saves).
- Empty: "Every window dark: nothing on the AI attention list." and similar captions in panel voice.
- Error: panel captions name what is missing ("Some readings are missing: AI status (…)").
- Loading: spinners on buttons; "Waiting for the AI status." captions.
- Settings: `/settings` "Panel switches", applied at once; suite profile and preferences on `/account`.
- Date and number formats: mixed — "31 Dec 2024" (UserGeek), "12/31/2024" (Account), "Wednesday, November 18, 2026" (fascia), 24-hour box time, "$0.2217", "323,000 tokens".

### Works well — keep
- The whole Signal Box vocabulary, applied with discipline: track and stations, lamps with words beside them (status is never colour alone), split-flap, brass Dymo panel titles, screws, the lever frame of three non-destructive jobs, the ruled train register.
- Captions that explain every panel in one sentence, in the box's own voice.
- The member view trimmed to the fascia and The Line, with nothing that would 403.
- Settings that apply at once and say so.
- The login: quiet, readable, the calling app named, and visually continuous with StartGeek as intended.
- Both themes hold up; the light "day turn" keeps the black glass fascia and brass labels.

### Bugs noticed in passing
- AIGeek nav: the "6" count badge overlaps the last letter of "Needs attention" on phone and desktop (basegeek-11-aigeek-status-dark.png, basegeek-11-aigeek-status-dark-desktop.png).

---

## StartGeek — design and UX review

Evidence: phone and desktop screenshots in `tools/mobile-harness/out/par-startgeek/startgeek/` (today; six scenes); one older run with the bright test wallpaper (`out/start-scrim/startgeek/`, 2026-09-05, older code, flagged where used); code under `apps/startgeek/src`; `apps/startgeek/CONTEXT.md`. StartGeek has no light theme by design (`color-scheme: dark` only), so every "-light" screenshot matches its "-dark" twin.

### Verdict
The console look holds together: dark glass, thin numerals, one amber accent, plain error copy ("Nothing is lost"), and keyboard hints on the desktop. The desktop layout is the strongest screen. The phone is weaker: the clock and weather hero use the whole first screen, so no task is fully visible, and the dock sits translucent over the content. The command box is the page's real job, but it has no harness scenes, its task capture reads a different grammar from TodoGeek's own add box, and it reports results in a 2.5 s toast that screen readers do not hear. The known wallpaper-contrast item cannot be judged from today's screenshots, because the harness stopped drawing a wallpaper on 2026-11-13. From the code it is partly true.

### Top findings (ranked, at most 12)

#### 1. The wallpaper-contrast item: not visible in today's screenshots, partly confirmed by code
- Where: hero (clock, date, weather line), top rail (Sign out), dock labels; Photo backdrop
- Evidence: every `par-startgeek` scene shows the plain ground and no photo. `tools/mobile-harness/apps/startgeek/fixtures.mjs:72` still stubs `picsum.photos`, but the wallpaper has come from basegeek's `/api/backdrops` since 2026-11-13 (`components/BackgroundManager.jsx:52-70`), so the "bright, busy wallpaper" fixture is never drawn. The 2026-09-05 run (`out/start-scrim/startgeek/startgeek-01-console-dark.png`) shows the old fixture. Scrim alphas are in `index.css:217-223` (0.30/0.34/0.62 at top/middle/bottom, times 0.75 to 1.4). There is no text-shadow on the clock or date (`components/DateTime.jsx:27-47`). "Sign out" is 12 px in `--ink-3` `#8ca3ba` (`SessionButton.jsx:32`). The weather line has only a faint shadow (`WeatherBlock.jsx:5-6`).
- Seen or inferred: CODE, plus an older screenshot. Not visible in today's run.
- Problem: My arithmetic, not a measurement. Over a near-white photo at the top of the page, the strongest scrim (0.30 × 1.4 = 0.42) leaves a ground of about rgb(140,140,140). White text there is about 3.4:1. That is enough for the 56–96 px clock, though its weight-200 strokes are thin. It is below 4.5:1 for the 17 px date and the 12 px mono weather line. `--ink-3` text ("Sign out", the "·" separators, "Details" on desktop) drops to about 1.5:1, which is effectively invisible. "Weather glyphs" do not exist on the console today. The weather block and modal use words ("mainly clear"), so that half of the item no longer applies. The dock labels do have a text-shadow and sit on dark glass, so they are fine.
- Proposal: (a) Fix the fixture so the harness serves the bright SVG for `/api/backdrops`, and re-run before deciding anything else. (b) Raise the top of the scrim for bright photos, with a floor of about 0.5 when luminance is over 0.7. (c) Give the clock, date and Sign out the same soft text-shadow the weather block uses, and move Sign out and the separators from `--ink-3` to `--ink-2`.
- Size: S (fixture, shadows) / S (scrim floor)
- Needs a decision from the owner? No

#### 2. On the phone, the first screen shows no complete task
- Where: console, phone
- Evidence: `startgeek-01-console-dark.png` (clock at y≈115–160 css px, temperature ≈220–260, weather line ≈307, command box ≈337–392, Tasks header ≈450, the first task's "2D LATE" badge cut by the dock at ≈557)
- Seen or inferred: SEEN
- Problem: The phone's status bar already shows the time. A 96 px clock, a 72 px temperature and their sub-lines take about 300 px before the command box, and the Tasks panel adds another 70 px header ("TASKS 4 / TodoGeek ↗") with generous padding. On a phone, the useful part of a start page (the overdue task, today's two) is below the fold and under the dock.
- Proposal: Phone only (below 640 px). Put the clock and temperature on one line ("9:38 · 78° Austin") at about 40 px. Keep the date and weather details as one mono line under it. Tighten the module header padding to about 12 px. This brings the command box to about y≈170 and puts two or three tasks on the first screen. Desktop unchanged.
- Size: M
- Needs a decision from the owner? Yes: CONTEXT orders "time and date, weather, command bar" first, and the big clock is part of the look.

#### 3. "> task" reads a different grammar from TodoGeek's add box
- Where: command box, task capture
- Evidence: `src/lib/parseTaskInput.js:1` ("Copied from apps/todogeek/… keep the two files in sync"; 300 lines) against `packages/task-grammar/src/parseTaskInput.js` (507 lines, plain-word dates, `(private)`, first-character-only signifiers, the three grammar fixes from review 1.16)
- Seen or inferred: CODE
- Problem: TodoGeek's own placeholder teaches "call Dana tomorrow 2pm #work". In StartGeek, "> call Dana tomorrow 2pm" is read by the old copy, which only knows `/tomorrow`. Unless the optional AI draft steps in, the task lands today with "tomorrow 2pm" in its words. "(private)" is not read at all, so a private task typed here arrives unmasked. The same sentence gives two results in two places, and the user learns to distrust the faster one.
- Proposal: Import `packages/task-grammar` (as `createInput` already is for TodoGeek and NoteGeek) and delete the copy. In the capture toast, show what was understood ("Added for Thu 19 · 2pm · #work").
- Size: S–M
- Needs a decision from the owner? No

#### 4. The dock opens every app in a new tab from a button, not a link
- Where: dock; module headers ("TodoGeek ↗"); task rows
- Evidence: `components/DockItem.jsx:5-8` (`window.open(url, '_blank')` from a `<button>`); `TaskRow.jsx:71-74` (`target="_blank"`)
- Seen or inferred: CODE; device behaviour SUSPECTED
- Problem: StartGeek is a launcher. On the phone, opening each app into a new tab leaves a pile of tabs. In the installed StartGeek PWA it likely opens a browser tab rather than the target app's installed window (needs a device). Because the dock items are buttons, long-press "open in…", "copy link" and middle-click do not work. Screen readers announce "button", not "link".
- Proposal: Make dock items `<a href>` in the same tab, so Back returns to the start page. Keep `_blank` only on desktop if the owner prefers tabs there. Same for the module links.
- Size: S
- Needs a decision from the owner? Yes: same tab or new tab, per device.

#### 5. Capture and search results flash for 2.5 s, are not announced, and cannot be undone
- Where: command box feedback
- Evidence: `components/Toast.jsx:14` (2500 ms; no `role="status"` or `aria-live`); `CommandBox.jsx:343-351` (`captureDone`), `:331-339` (errors go to the same toast)
- Seen or inferred: CODE
- Problem: "Added to TodoGeek" and failure messages vanish in 2.5 s. That is too short to read a failure such as the partial-capture message, which tells you not to retype. Screen readers hear nothing. A mistyped capture can only be fixed by going to TodoGeek. The rest of the suite uses 6 s undo toasts.
- Proposal: About 6 s. Announce through a polite live region. Give a successful capture "Undo" and "Open" actions. Keep error toasts until dismissed.
- Size: S
- Needs a decision from the owner? No

#### 6. Ticking a task on the console gives no feedback and no undo
- Where: Tasks module, the round "dot" button
- Evidence: `components/TaskRow.jsx:47-55` (sends the status change and refetches; any error that is not an auth failure is silently dropped)
- Seen or inferred: CODE
- Problem: A tap on a 12 px dot with a 44 px invisible hit area can tick the wrong task. The row then disappears on refetch with no trace and no Undo. A failure looks exactly like "nothing happened".
- Proposal: Fill the dot, strike the words for about 700 ms (an echo of TodoGeek's moment), then show the toast "Done · Undo". Report failures in the same toast.
- Size: S
- Needs a decision from the owner? No

#### 7. The dock is see-through over scrolling content
- Where: dock, phone
- Evidence: `startgeek-01-console-dark.png` and `-02-dock-dark.png` (the task text "Finish the startgeek mobile pass !high #work" shows through behind "NOTES TODO FITNESS"; "pass !high #work" peeks out below the dock)
- Seen or inferred: SEEN
- Problem: The labels overlap readable task text, so both are harder to read. A 12 px label over a 14 px line of text is the worst case.
- Proposal: Make the dock glass more opaque on the phone (about 0.85 instead of the panel's 0.58), or fade content out under it with a 24 px gradient on the page's bottom padding.
- Size: S
- Needs a decision from the owner? No

#### 8. On the phone the command box hides most of what it can do
- Where: command box, phone
- Evidence: `startgeek-01-console-dark.png` (placeholder reads "Search, or type > task", then the GOOGLE chip); `CommandBox.jsx:609` (full text "… > task, < note, ? suite search, ?? ask")
- Seen or inferred: SEEN
- Problem: Notes, suite search and Ask are invisible on the phone unless you open "?". The GOOGLE engine chip takes about 70 px of the box on a screen where the web engine matters least.
- Proposal: Phone: a shorter placeholder, "Search · > task · < note", and the engine chip as a small icon. Or, when the box gains focus, show a row of four prefixes under it (> task · < note · ? suite · ?? ask) that insert the character when tapped.
- Size: S
- Needs a decision from the owner? No

#### 9. The weather line is jargon, and sunrise and sunset ignore the clock setting
- Where: hero weather line; weather modal
- Evidence: `startgeek-01-console-dark.png` ("H 78 · L 60 55% RH W 6 MPH": stats joined by spaces only, `WeatherBlock.jsx:35-39, 66`); `-03-weather-modal-light.png` ("SUNSET 19:20" while the clock shows "9:38 AM"; `WeatherModal.jsx:9-13` always uses 24 h); "mainly clear" on the console versus "Mainly Clear" in the forecast
- Seen or inferred: SEEN and CODE
- Problem: "RH" and "W" are instrument abbreviations. Without separators, "60 55%" reads as one number. The 12/24 h setting is broken inside the app's own modal.
- Proposal: "H 78 · L 60 · 55% humidity · wind 6 mph". Format sunrise and sunset through the same clock setting. Use one case for conditions.
- Size: S
- Needs a decision from the owner? No

#### 10. The late badge breaks across lines
- Where: Tasks module, phone
- Evidence: `startgeek-01-console-dark.png` ("2D" at the end of one line, "LATE" on the next, inside a split box); `TaskRow.jsx:87-90` (no `whitespace-nowrap`)
- Seen or inferred: SEEN
- Problem: A broken red box reads as a rendering fault on the task the user most needs to see.
- Proposal: `whitespace-nowrap` on the badge. On the phone, consider "2d late" in red text without the box, as TodoGeek does.
- Size: S
- Needs a decision from the owner? No

#### 11. Fitness shows "-- / 2,100 kcal" over a large empty panel
- Where: Fitness module, desktop
- Evidence: `startgeek-01-console-dark-desktop.png`; `components/FitnessModule.jsx:39-42`
- Seen or inferred: SEEN
- Problem: "--" could mean loading, nothing logged or an error. About 100 px of the panel is empty because it is sized to match Tasks. (The scene itself has drifted: the fixture sends `caloriesConsumed`, while the module reads `calories`, so the populated state is never audited.)
- Proposal: "Nothing logged yet" in words, with "Log a meal ↗" into FitnessGeek. Fix the fixture so the scene shows the real state.
- Size: S
- Needs a decision from the owner? No

#### 12. Several live apps cannot be reached from the launcher
- Where: dock
- Evidence: `src/config/apps.jsx:7-13` (Notes, Todo, Fitness, Books, Games, News); CONTEXT.md: ThingGeek was in the dock until 2026-11-15
- Seen or inferred: CODE
- Problem: ThingGeek (live, used by Chef and Heather), StoryGeek, FlockGeek and BaseGeek have no way in from the start page. The MUI apps' grid switcher is not here. A launcher that leaves out live apps sends people back to bookmarks.
- Proposal: A seventh dock item, "More", opening a small sheet of the remaining apps. The dock row stays at six on the phone.
- Size: S
- Needs a decision from the owner? Yes: Chef chose the six on 2026-10-09 and 2026-11-15.

### Smaller findings
- The weather modal's 7-day forecast scrolls sideways with a clipped fourth column ("M(", "Mainly") and no other cue (`03-weather-modal-light.png`). A fade at the right edge, or a 2 × 4 grid on the phone, would help. SEEN.
- The weather modal covers the dock and the rail. Close is top-right only, at about 44 px; a phone user has to reach the top corner. A swipe down or a bottom "Close" would help. SEEN.
- When the session is unreachable there are two Retry controls (rail "Not connected · Retry" and the panel's Retry, `06`). Acceptable, but the rail one alone would do. SEEN.
- The settings sheet is titled "MODULES" but its button is labelled "Blocks and backdrop". "Click for details" is used on touch devices too (`04-settings-dark.png`). SEEN.
- "Sign out" is the second most prominent control on the page, in the top-right corner a thumb reaches for. On the phone it could go into the settings sheet. SEEN.

### Screens with no harness scene (unaudited)
- Command box in use: typing "> " (task mode label, draft preview), "< " (note), "? " (suite search results), "?? " (Ask answer card), a capture toast, a failed capture.
- Help modal (`HelpModal.jsx`).
- Calendar module (off in the fixture).
- Signed-out console.
- Weather unavailable ("Weather unavailable").
- Settings sheet below the fold (backdrop and clock choices, calendar feeds).
- Any scene with an actual wallpaper (see finding 1).
- The suite's SSO login page styled to match StartGeek (lives in BaseGeek; not reviewed here).

### How this app handles shared concerns
- Login: "Sign in" in the rail sends you to BaseGeek SSO. The signed-out console still shows clock, weather, web search and dock.
- Navigation: a single page. The dock launches the apps in new tabs. There is no suite app-grid switcher.
- Search: the command box, with the web engine by default; "?" searches the suite, "??" asks AI (opt-in).
- Add: "> task" to TodoGeek and "< note" to NoteGeek from the command box, using its own copy of the grammar (finding 3).
- Delete and undo: no undo anywhere (findings 5, 6).
- Toasts: a pill at the bottom, 2.5 s, not announced.
- Empty: modules with no data hide entirely ("Modules with nothing to show stay hidden regardless").
- Error: LoadProblem panels with plain copy and Retry ("Couldn't load today… Nothing is lost").
- Loading: the rail says "Connecting…"; modules appear when ready.
- Settings: a sheet, stored in this browser only, opened with "," or the rail icon.
- Dates and numbers: "Wednesday · November 18, 2026", 12 h clock by default, sunrise and sunset always in 24 h (finding 9), temperatures in °F with "mph" and "hPa".
- Theme: dark only, by design. Ignores the suite light/dark setting.

### Works well — keep
- Error copy: "Couldn't load today. Tasks, fitness and reading didn't load. Nothing is lost." and "Couldn't reach your account… will show once it answers." Honest and calm (`05`, `06`).
- The desktop layout (`01-…-desktop`): clock left, weather right, keyboard hints (`/`, `Tab`, `Esc`, `,`), and tasks beside fitness and reading at one height.
- One amber accent, Geist and Geist Mono, thin tabular numerals: a distinct identity that is not Material.
- Settings copy that explains consequences, especially the Ask privacy paragraph.
- The adaptive scrim idea (sample the wallpaper, darken more for bright photos). It needs a floor and a working harness fixture, not a rethink.
- Dock labels always visible under the icons, with a shadow.

### Bugs noticed in passing
- Harness fixture drift: the wallpaper route stubs `picsum.photos` but the app now calls `/api/backdrops`; the fitness fixture sends `caloriesConsumed` but the module reads `calories` (`tools/mobile-harness/apps/startgeek/fixtures.mjs:72` and the `TODAY.fitness` fixture).
- `WeatherModal.jsx:9-13` `hhmm` ignores the 12/24 h clock setting.

---

