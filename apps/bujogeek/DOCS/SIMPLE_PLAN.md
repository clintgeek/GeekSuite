# BuJoGeek — stupid simple

*Written 2026-09-27 from a conversation with Chef. Status: **spec, awaiting Chef's go on
Phase 1.***

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
  - The five bujo symbols keep working when typed as the first character, and are shown as
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
  repeat. Non-task kinds get their bujo glyph.
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

## Phases
1. **Simplify.** Nav down to Today / Upcoming / Done plus search. The add box with the live
   preview, the inline editor, one-tap and swipe actions, undo, pinned tag chips, and the
   removed screens redirecting. The fixes from review §4 that survive (id-based focus, one
   tap for tomorrow) come along. **This is the phase that makes it stupid simple.**
2. **Repeats and reminders:** plain-word repeats, the Repeats select, next-occurrence
   display, per-occurrence reminders (§2.4), and the one-time push prompt.
3. **Identity.** BuJoGeek gets its own look, distinct from GameGeek (Arcade Sticker),
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
