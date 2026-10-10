# TodoGeek — stupid simple

*Written 2026-09-27 from a conversation with Chef. Status: **Phase 1 plus the Red Pen
identity approved and building** (Chef, 2026-09-29: "I love it, do it.").*

Chef: "At this point I just use the todo list features. The rest of it seems overly
complicated maybe. It needs simplifying and made stupid simple." He wants both a workflow
rework and a visual identity, in that order.

## What the data says (production, 2026-09-27)

- **One user (Chef), 378 tasks:** 365 done and 4 open. Almost everything is work: `#work`
  224, `#offTicket` 65, `#manager` 56, `#fd` 46, `#meeting` 45. The rest are personal
  projects (`#hobbyCoding`, `#geekSuite`, `#farmLife`, `#camping`).
- **Used:** due dates 251, tags 343 (27 distinct), priority 157 (1–3). The first-character
  symbols get some use: `@` 60, `-` 17, `?` 17, `!` 13.
- **Never or barely used:**
  - habits 0, journal entries 0, collections 0;
  - recurring tasks 0, reminders 0, due *times* 0;
  - subtasks 1, migration 7, blocked 2, backlog 2.
- **Use comes in bursts, then stops:** 84 tasks in May 2025, then none from September 2025
  to January 2026. Restarting means wading back through spreads, migration and review.

## Chef's decisions (2026-09-27)

- **Scope:** both the workflow and the look, workflow first.
- **Symbols:** "I've really kind of fixed this with the modifiers on the other end: /day time
  is schedule, !high is priority, ^note goes here etc. Maybe we keep [task + note] though.
  Keep traditional bujo possible."
  - The typed modifiers are the interface. The UI shows task vs. note.
  - The five symbols keep working when typed as the first character, and are shown as
    a small leading glyph. There's no picker.
- **Recurring and reminders:** "I'd like to use them if they weren't so complicated to
  figure out." Keep them, and make them obvious.
- **Adding:** an **always-visible add box**.

## The shape: one box, three views

### The add box
- **Placement:** it sits at the top of Today on desktop, and on a phone it stays fixed
  above the keyboard or bottom nav. Type, press Enter, done. Focus stays in the box for
  the next one.
- **Grammar:** the existing `utils/parseTaskInput.js` grammar, unchanged: `/dates`, times,
  `!priority`, `#tags`, `^note`, `$^note` (to NoteGeek), first-character symbols. Additions:
  - **plain-word dates** without the slash, only when unambiguous at the start or end
    (`tomorrow`, `friday`, `next week`). The slash forms stay canonical;
  - **plain-word repeats:** `every day`, `every weekday`, `every monday`, `every 2 weeks`,
    `every month`, `every 15th`. The existing `(daily)` / `(weekly)` / `(monthly)` keep
    working.
- **A live parse preview:** chips under the box show what it understood as you type, e.g.
  `Tomorrow 9:00` · `#work` · `High` · `Repeats every Monday` · `Note`, with the remaining
  text as the task. **This is what makes the grammar discoverable.** A `?` next to the box
  shows the full cheat sheet.

### Three views
- **Today:**
  - *Overdue* (collapsed to one line with a count, with a **"Move all to today"** action);
  - *Today*, sorted by priority and then time;
  - *Anytime* (no date).
- **Upcoming:** the next 14 days grouped by day, then "Later" by month. Empty days aren't
  shown.
- **Done:** by day, newest first, searchable. Un-completing is one tap.
- **Filters:** tags are the only organisation. A row of **pinned tag chips** (Chef picks
  them, e.g. *work*, *personal*) filters any view with one tap. There's also search.

### A task row
- **What it shows:** checkbox, text, and small chips for date/time, tags, priority and
  repeat. Non-task kinds get their signifier glyph.
- **Tapping** expands it **inline**, with no dialog, to edit the text, a date and time
  picker, tags, priority, the note, and **Repeats**.
- **One-tap actions:**
  - desktop: hover buttons for done, tomorrow and pick a date, plus keys (`x`, `t`, `d`,
    `e`). Focus follows the **task id**, not the list position (review §4.3);
  - phone: swipe right for done, swipe left for tomorrow, long-swipe left to pick a date.
- **Undo, not "are you sure?":** every change (done, move, delete) shows an **Undo** toast
  for about 6 seconds. That replaces the confirmation dialogs.

### Repeats and reminders, made obvious
- **Repeats** is a single select in the inline editor: *Never · Daily · Weekdays · Weekly on
  (day) · Monthly on (date) · Every N days/weeks*. There's no RRULE text anywhere in the UI.
- **Completing a repeating task** shows the next one straight away in Upcoming ("Next:
  Mon 6 Oct").
- **Reminders:** giving a task a time shows a **"Remind me"** switch, which sends a push
  notification at that time.
  - **Repeating reminders fire for every occurrence.** That closes review §2.4.
    `remindedAt` becomes "the occurrence this reminder was sent for".
  - **Missed windows:** if the server missed the time by more than an hour, it skips that
    one rather than sending it late.
- **Push setup** is one "Turn on reminders" prompt the first time a reminder is set. There's
  no settings maze.

### Out of the UI (data untouched)
Habits, journal, collections, templates, the weekly and monthly spreads, migration, review,
blocked, subtasks and backlog lose their routes, nav entries and entry points. Old URLs
redirect to Today.
- **Nothing is deleted from the database.** The one subtask and the two blocked tasks show
  as ordinary tasks, and `~blocked` still parses, as a `#blocked` tag.
- **The dead code is deleted in Phase 4,** once Chef has lived without it.

## Identity: "Red Pen" (Chef, 2026-09-29)

Black ink on white paper, and one red pen for crossing things off. It's stark, fast and
calm, and unlike every other app in the suite. The look is built around a to-do app's best
moment: crossing something off. It ships **together with Phase 1, as one revertable
commit** (Chef's rule: a large redesign lands as one commit, and independent fixes go in
their own).

1. **One typeface:** Inter Tight, self-hosted. No serif, no mono, no italics, and tabular
   numerals. The runtime Google Fonts links (Fraunces, Plex Mono, Source Sans) go.
2. **Three colours:** ink about `#121212`, paper about `#FBFBF8`, and one red about
   `#C8202A` (5.9:1 on paper). Everything secondary is grey. Night mode is near-black paper
   with off-white ink, and the red stays red, lightened only as far as contrast needs.
3. **The signature:** ticking draws a quick hand-drawn red strike through the words and
   fills the square with red. The row then greys and slides into Done, with Undo. It's the
   only animation in the app, and it's instant under reduced motion.
4. **Rows:**
   - a square checkbox and 17–18px words;
   - time or "tomorrow" in grey on the right;
   - tags as plain grey `#work` text, not chips;
   - overdue as red words ("2 days late"), not a pink card.
5. **Priority** is a proofreader's mark: a red bar or `!` in the left margin, not a chip.
6. **Symbols** (`-` `@` `?` `!`, typed as the first character) appear as a small grey
   glyph in the margin, and only when used. Plain tasks show nothing.
7. **The add box shows its parsing in your own sentence:** the parsed parts are underlined
   as you type (dates and times in red, `#tags` grey, priority as the red margin mark). This
   **replaces the chip-row preview** described under "The add box" below.
8. **Today's header is a desk calendar:** a huge day number, "Sunday · September" beside it,
   and one plain line ("4 to do · 2 done"). "Carried over" collapses to one line with
   **Move all to today**.
9. **Upcoming is a timetable:** big day numerals in a left column and tasks to the right.
   Empty days are skipped.
10. **Icon:** the done-bullet mark, with the tick in the red pen.

## Phases
1. **Simplify.** Nav down to Today / Upcoming / Done plus search. The add box with the live
   preview, the inline editor, one-tap and swipe actions, undo, pinned tag chips, and the
   removed screens redirecting. The fixes from review §4 that survive (id-based focus, one
   tap for tomorrow) come along. **This is the phase that makes it stupid simple.**
2. **Repeats and reminders:** plain-word repeats, the Repeats select, next-occurrence
   display, per-occurrence reminders (§2.4), and the one-time push prompt.
3. **Identity.** TodoGeek gets its own look, distinct from GameGeek (Arcade Sticker),
   BookGeek (Midnight Reader) and NoteGeek (Lab Notebook). A direction is proposed with
   screenshots before any build.
4. **Delete the dead code** once Chef is happy: the removed screens, their resolvers where
   unused by other apps, and review §3's performance items that no longer apply.

## Done when (Phase 1)
- Adding `call Dana tomorrow 2pm #work !high` from the phone takes one field and Enter, and
  the preview showed every part before Enter.
- A task can be marked done, moved to tomorrow, and undone, each in one gesture on a phone
  and one key on desktop.
- No screen outside Today / Upcoming / Done / search is reachable from the UI. Old URLs
  land on Today, and no data is lost.
- Harness is a11y-clean on phone and desktop; tests are red/green checked.

## As built (Phase 1 + Red Pen, 2026-09-29)

Decisions the spec left open, and how they were made. One commit; `git revert` takes all of it back.

### One corpus
- **Every view reads `allTasks` and slices it on the client** (`frontend/src/utils/penViews.js`), through
  a new `PenContext` on top of the existing `TaskContext`. `dailyTasks` drops blocked, backlog and undated
  collection tasks from the log; with those screens gone, their tasks must show as ordinary ones, and one
  list also means a change on one view is right on the next without a refetch. It re-reads when the tab
  comes back after a minute away.
- **Repeats:** `allTasks` expands a series a year either side of today. Overdue keeps only a series'
  latest missed occurrence (what the daily log's carry-forward did); Upcoming's "Later" shows a series once,
  at its next occurrence. Search shows it once.
- **Blocked** tasks (status `blocked`) are ordinary open tasks: they appear by their due date and can be
  ticked or moved. Backlog and collection tasks likewise. No data is changed to make that so.
- **Cancelled** tasks appear in Done, words struck through in grey, labelled "cancelled"; the square
  puts them back on the list.

### The add box
- **No date typed → today, date-only.** A date without a time → date-only. A typed time → the instant.
  The old box sent today at 09:00 local, which the gateway reads as a due *time*, so every quick-added task
  carried a phantom "9:00" and was eligible for a 9am push. Repeating entries keep the old 09:00 anchor so
  the first occurrence agrees with the RRULE (Phase 2's business).
- **Plain-word dates:** `today`, `tomorrow`, `monday`–`sunday`, `next week`, `next month`,
  `next <weekday>`, as the first or last words of what is left after the other tokens; optionally with a
  time after (`tomorrow 2pm`, `friday at 9:30am`) or, at the end, before (`2pm tomorrow`); at the end they
  may follow `on`/`by`/`due`, which go with them. Not read mid-sentence, not after `for`, `until`, `since`,
  `every`, `last`, `this`, `from`, `of`… (they are *about* the day), not as the whole task, not as a
  possessive, never a bare number as a time. Days resolve like the slash forms (a weekday is its next
  occurrence after today). A slash date wins; the word then stays text.
- **The signifier is the first character only.** The parser took the first `* @ - ! ?` anywhere in the
  line, so "follow up re: Q3-plan" became a note and "Buy milk?" a question, contradicting its own doc
  comment and the old box's highlighter (which only coloured position 0).
- **`~blocked [reason]`** files the task tagged `#blocked`, the reason kept in its note as
  "Blocked: …". No block mutation is sent.
- **Screen readers:** the understood parts are a sentence on `aria-describedby` ("Task: call Dana. Due
  tomorrow at 2 pm. High priority. Tagged work."); a polite live region says what was added.
- **Where it sits:** Today only. In the page on desktop; docked above the bottom nav on phones (and above
  the keyboard, via `visualViewport`); hidden while a row's editor is open. It takes focus on desktop only
  when Today is empty (keys are the faster way into a list); `/` and Ctrl+N reach it anywhere; Escape
  leaves it.
- **Not carried over:** the old box's `#` tag autocomplete. Worth adding back if Chef misses it.
- **An entry dated for another day** gets an "Added for tomorrow · Undo" toast, since it will not appear
  on the page he is looking at.

### Rows and actions
- **Keys:** `j`/`k`, `x` done, `t` tomorrow, `d` pick a date, `e`/Enter edit; `g t`/`g u`/`g d`/`g s` go
  to Today/Upcoming/Done/Search (the second key of a chord is ignored by the rows). Delete is in the
  editor; the old `d` = delete and `c` = cancel keys are gone.
- **Undo, for everything that changes a task:** done, not-done, moved, "move all", delete, and an add for
  another day. 6 seconds. Undo restores the previous status or due date exactly. **Delete is deferred**:
  the row hides at once and the mutation is sent when the toast expires, so Undo loses nothing; a tab
  closed inside the window keeps the task. Deleting an occurrence of a repeat deletes that occurrence only.
- **Moving** sends only `dueDate` (a timed task keeps its clock time on the new day). It no longer stamps
  `migrated_future`, which also stopped moved tasks' reminders (the sweep only reads `pending`).
- **Swipes** are touch-only (a mouse drag is not a swipe): right ≥ 72px done, left ≥ 72px tomorrow, left
  past half the row (at least 160px) pick a date. The row follows the finger and shows what letting go
  will do; short of a threshold, nothing happens.
- **Pick a date** is a sheet: Today, Tomorrow, the weekend, next Monday, any day (the browser's date
  input), or Anytime.
- **The inline editor** uses the browser's date and time inputs (no date-picker bundle), sends only
  changed fields, and shows Repeats only on a task that already repeats (the old None/Daily/Weekly/Monthly
  select, with the old "this one or the series?" dialog).
- **Priority marks:** High a full-height red bar, Medium a short red bar, Low a short grey bar.

### Pinned tags
- Stored in `User.appPreferences.todogeek.pinnedTags` (array of strings) through `useTodoPreferences` →
  `PATCH /api/users/preferences/todogeek`, which merges, so only `pinnedTags` is sent. No gateway or schema
  change. Up to 12, case-insensitive. Which chip is active is per session and shared by all views; it
  filters every list and Today's counts with it.

### Retired
- Review, Plan (weekly, monthly, backlog), Templates, Tags, Collections, Habits, Journal, Settings, and the
  legacy `/tasks/*` URLs redirect to `/today` (`RETIRED_PATHS` in `components/layout/navConfig.jsx`). Their
  files, resolvers and data are untouched (Phase 4). Settings went too: theme is the top-bar toggle,
  reminders the sidebar switch; the account menu has no Settings row.

### Red Pen
- **Palette** (`frontend/src/theme/pen.js`, all measured, pinned by `__tests__/theme/redPenContrast.test.js`):
  light — paper `#FBFBF8`, surface `#FFFFFF`, fill `#F3F3EF`, ink `#121212`, grey `#5C5C58`, muted
  `#686864`, red `#C8202A` (5.5:1 paper, 5.1 fill); night — paper `#141413`, surface `#1C1C1B`, fill
  `#1F1F1E`, ink `#EDEDE8`, grey `#A3A39D`, muted `#9C9C96`, red `#E85250` (5.0 paper, 4.5 fill). The MUI
  accent is the ink; red is only the pen. Toast tones are greys, error is the red, alerts carry no icon.
- **Type:** Inter Tight via `@fontsource/inter-tight`, latin 400/500/600/700 (four woff2, precached),
  tabular numerals. The Google Fonts links are gone.
- **The strike** is a hand-drawn SVG path painted as the words' background with
  `box-decoration-break: clone` (one stroke per wrapped line) and drawn by growing `background-size` from
  0 to 100% in 320ms; the square fills red with a white tick. The row holds its place for 700ms, then
  leaves for Done. Under `prefers-reduced-motion` there is no transition and no hold.
- **The only animation:** the route fade (`GeekAppFrame`) was replaced with an equivalent frame that does
  not fade; the loading shimmer with a still line.
- **The sidebar** is the page's paper in both modes, active row in ink with a red margin bar.
