# Work log — September 2026

What shipped, why, and what it cost. Newest first.

Outstanding work lives in [`SUITE_TODO.md`](SUITE_TODO.md); this file is the
record of what is already done, so neither has to be reconstructed from git log.

Each entry names the commit, the finding it closes (where one exists), and
anything a future reader would otherwise have to rediscover.

---

## 2026-09-21

### BuJoGeek — §3.1 indexes and four UX gaps

`74c15b89`, `b8458bcd`, `6b7c89f6`, `73694862`

- **One-tap "move to tomorrow" on Today** (§4.1). Review has had the one-tap
  version since it shipped; it was never offered where the decision is made.
  Tomorrow is relative to the DAY BEING VIEWED, not to `new Date()`, because
  Today has day navigation.
- **Keyboard focus follows the task, not the row** (§4.3). Focus was an array
  index re-clamped only on a LENGTH change, and the list re-sorts on every
  edit — so a same-length reorder left it pointing at a different task and
  the next `x`/`d` acted on that one.
- **Indexes** (§3.1). `{createdBy, dueDate}` on the most-executed query in the
  app, plus the series-master lookup and `JournalEntry {createdBy, date}`.
  Verified with explain: FETCH-with-in-memory-filter before, `IXSCAN` after,
  and all confirmed present on the deployed container.

  **Correction to the review and to my own commit message:** `Template` was
  described as having no index. That is true of the MODEL, but the live
  collection carries legacy indexes from an older schema
  (`createdBy_1_type_1` and two others) that already served the filter — so
  it was not doing full scans, and the gain from the one added is the sort on
  a two-row collection. It also builds lazily: the resolver imports that
  model with a dynamic `await import(...)`, so autoIndex does not run until
  the templates query is first hit. Worth knowing before trusting "no index
  declared" to mean "no index exists".
- **Three small gaps** (§4.4, §4.7, §4.8): deleting a habit took its whole
  history with no confirm; Plan and Tags never registered the g-chords; the
  help screen advertised a ⌘K command palette that does not exist.

**A process failure worth keeping.** The test suite went green while
`pnpm build` failed on a duplicated prop binding — no test imported the three
Today sections, and vitest only compiles what a test reaches. The build was
also piped to `tail`, so the shell saw tail's exit code and the `&& git
commit` fired regardless. Two holes lining up. Fixed by a shallow smoke test
over the three sections, and by checking build exit codes without a pipe.


### NoteGeek — pipe tables render as tables

`c33ce90c`

`<ReactMarkdown>` was called with no `remarkPlugins` in **both** markdown
surfaces, so only CommonMark was parsed — and CommonMark has no tables. A pipe
table came out as one paragraph of literal pipes, every row folded onto a
single line.

The giveaway: both call sites already carried full `& th` / `& td` styling.
Someone had written the CSS for tables the parser could never produce.
NoteGeek was the only markdown surface in the suite without `remark-gfm`;
BuJoGeek and StoryGeek both pin `^4.0.1`, which is what was matched.

`remark-breaks` deliberately NOT added — see SUITE_TODO.

notegeek 243 tests across 34 files, vite build clean.

### BuJoGeek — §1.1 and §1.4, closing all of §1 and §2

`7328d278`, `d747a7ff`

**Evening due times.** A task due 8pm US-Central is stored 01:00Z the next
day, so it fell outside today's UTC window and rendered on tomorrow's page —
while its push reminder, which is instant-based and correct, fired at 8pm and
linked to a page that did not contain it.

The obvious repair is worse than the bug: swapping the UTC window for the
local one drags every one of tomorrow's date-only tasks onto today, because a
date-only task is stored at UTC midnight and that instant sits inside the
local evening west of UTC. Verified before writing the fix.

So the clause is a union — date-only rows matched by ENUMERATING the span's
UTC midnights, timed rows matched against the local window with those
midnights excluded. Overdue needed the same treatment or the bug would have
moved rather than gone.

`tzOffsetMinutes` is per-DATE, not per-now, so a page showing a day across a
DST boundary asks with the right offset. Omitting it still behaves as before.

**Sort parity.** The gateway ordered undated tasks `(b.priority) - (a.priority)`
— descending, and 1 is High, so Low sorted above High. The exact bug
`TaskList.jsx:105` records having fixed on the client, still alive on the
server. Visible because lists load in gateway order and re-sort canonically on
the first mutation, so they reordered under the user.

### BuJoGeek — the recurrence group, disarmed before first use

`6b60f92c`

All latent: the live database held zero series masters. Closed as a set
because they arm together the moment a repeating task exists.

- **Expansion was unbounded** — `new Date(0)` to `new Date(8640000000000000)`.
  One open-ended daily rule expands to **2,912,443 occurrences in 12.5
  seconds**, measured, on the gateway every app in the suite shares. Bounded
  to a year either side.
- **Overrides inherited the master's date** — completing Tuesday's occurrence
  filed it under the series' start date.
- **Double tap made two rows** — a partial unique index now refuses it, plus a
  busy state so it is not attempted.
- **Recurring reminders fire once** — documented, not fixed. See SUITE_TODO.

**The index hazard repeated and was caught by probing, not reasoning.**
`seriesId` and `originalDueDate` both declare `default: null`, so all 363
tasks carried explicit nulls. Both versions were run against the live
collection first: the plain unique index was **refused with E11000**, the
`$type`-filtered partial one built. `$exists` would not have helped — it
matches null. Same shape as the blood-pressure `measured_at` near-miss.

### BuJoGeek — the first group

`f591de2a`, `aaac66e0`

- Weekly spread's Sunday column was structurally empty (a three-way
  disagreement: UI computed Monday, context re-derived Sunday, gateway snapped
  to Sunday again). Fixed by EXTRACTING the boundary, since it was written
  twice — patching one copy is how the filter and the expansion drift apart.
- Habit streak read 19 at 1pm and 0 at 9pm, same day, no data change.
- Review marked cards handled even when the mutation failed; root cause was
  `deleteTask` returning `undefined` for success, failure and user-cancel
  alike.
- Today's Blocked shelf rendered "nothing is waiting on anyone" over a failed
  query.

### BookGeek — CSV export of the current view

`81717045`

Exports what the filters MATCH, not the rows rendered — the grid pages 50 at a
time, so rendered rows are usually a prefix. The server caps `limit` at 100,
so the loop reads page size off the response rather than the request.

Escaping is the whole job: RFC 4180 quoting, formula-injection defusing
(`=`, `+`, `-`, `@` — much of this library was imported, not typed), and a BOM
so Excel reads UTF-8.

---

## 2026-09-20

### FitnessGeek — the accuracy sweep

`0071cc02` … `5c3fabf1`

Four parallel reviews, seven commits. The theme: **this app was confidently
wrong in the reassuring direction.**

- **The calorie target was computed in the wrong units.** Mifflin-St Jeor
  takes kg and cm and was fed pounds and inches, in both copies — inflating
  every BMR by 11–45%, worse the heavier the person. Someone asking for
  1 lb/week was handed roughly maintenance. Now one implementation with the
  units in the parameter names.
- **Goals were written to one store and read from another.** `nutritiongoals`
  held 0 documents while `usersettings` held the real plans, so Reports said
  "No active nutrition goals recorded" forever and every AI insight ran blind.
- **Describe-and-log silently dropped dishes** the model could not identify —
  200 `{success: true}` with the item in neither `logged` nor `skipped`.
- **OpenFoodFacts sodium was 1000× low** on the search path only, and per-100g
  values were stored as per-serving amounts on both.
- **The server decided what "today" was** — streak, Garmin daily, reports
  window, weekly target.
- **Failed saves looked like successes** on weight and BP.
- Type below the 12px floor, tap targets below 44px, and three wrong numbers
  (a progress bar that counted backwards, an edit that zeroed fiber, a float
  artifact).

### FitnessGeek — blood pressure gains `measured_at`, households become visible

`57fcfe9c`

The migration had to run BEFORE the schema deployed: `measured_at` is required
and Mongo reads a missing field as null, so the first autoIndex build would
have failed on 79 identical `(userId, null)` pairs.

Also: a backfill that FILLS a field kills every `if (!field)` fallback written
for its absence. The backfilled instants are UTC midnight, which renders as
7:00 PM the previous day in Central — all 79 historical readings would have
shown a fabricated time, and the edit dialog would have moved the reading's
date on save.
