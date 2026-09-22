# Work log — September 2026

What shipped, why, and what it cost. Newest first.

Outstanding work lives in [`SUITE_TODO.md`](SUITE_TODO.md); this file is the
record of what is already done, so neither has to be reconstructed from git log.

Each entry names the commit, the finding it closes (where one exists), and
anything a future reader would otherwise have to rediscover.

---

## 2026-09-22

### NoteGeek — Tidy removed

Chef: *"I think we should remove tidy. I think compose does a better job than
tidy."* Then, plainly: *"Compose is what I wanted when I asked for tidy."*

I raised one objection before cutting, because on paper they are different
jobs — Tidy was a FORMATTER (keep your words, fix the markdown), Compose is a
SYNTHESISER (rewrite into something new). His second message answered it
completely, so the objection died there rather than becoming a debate.

The record Tidy actually had: it truncated a long note to ~63% and wrote the
stump back with no undo (2026-09-21), then 400'd on groq because I raised its
token cap, and even repaired it mostly declines. Against that, "keep my exact
words, just fix the formatting" is a capability nobody was reaching for.

Gone: `tidy.js`, its suite, the `tidyMarkdown` mutation, `TidyMarkdownResult`,
`tidyMarkdownArgsSchema`, the toolbar button and its two frontend tests.

Two things deliberately kept:

- **The reasoning, in `compose.js`'s header.** Compose is designed as Tidy's
  opposite and the contrast is *why* it has the shape it has. The comparisons
  are now past tense and point at `git log` rather than at a file that is not
  there.
- **The unknown-reason fallback in the history panel.** `tidy` left the
  `changeReason` enum and the label map, and the dialog renders a reason it has
  never heard of as itself. There is a test for that now, because retiring a
  label must not make old rows unreadable — and because a future feature should
  be able to write its own label without a frontend change. (No stored version
  ever carried `tidy`: Tidy wrote through the ordinary save path, which labels
  itself `edit`. The label was aspirational all along.)

`DOCS/GRAPHQL.md` was stale by two days, so it got the whole NoteGeek surface
rather than just the deletion: `noteVersions`, `noteVersion`,
`restoreNoteVersion`, `composeNote`, `changeReason`, and the new stat fields.

`DOCS/AIGEEK_SIMPLIFICATION.md` still lists `notegeek:tidy_markdown` and was
left alone on purpose — it is a dated read-only analysis (2026-09-19), and
editing a snapshot to match today falsifies the record.

2392 gateway tests, 279 notegeek tests, build exits 0.

### NoteGeek — Compose was routed to a 7B model, and shipped its loop as a document

Chef pasted ~2,400 characters of terminal output into a note, hit Compose, and
got back a "document" that said

```
N. Confirm the issue: [Issue 1000](https://github.com/notegeek/notegeek/issues/1000)
```

thirty-eight times — with an invented URL, ending mid-link where it hit the
token ceiling. Reproduced exactly, from his own paste recovered out of the
session transcript.

**Root cause: routing, not the prompt.** `runAIFeature` had no way to say what
a call needs, so Compose — multi-document synthesis, about the hardest thing
this codebase asks of a model — took whatever the app's rotation offered. That
was `groq/allam-2-7b`, a 7B row that `aiNeedResolver.js`'s own header already
records as having answered an English prompt in Arabic. The same input, same
prompt, on the row `prose:deep` resolves to (`ollama/gemma4:31b`, golden-set
score 1) produced a correct 1.8k document with a table, a code fence and two
honest open questions. The prompt was never the problem.

Three changes, in increasing order of how long they will matter:

1. **`need:` reaches in-process features.** Only the HTTP door could resolve a
   capability into a model; `runFeatureCore` can now too, degrading to the
   ordinary walk when nothing meets the need and never letting a resolver
   failure cost the caller their call. This closes part of
   `AIGEEK_CAPABILITY_ROUTING.md` §3.4 for every in-gateway feature, not just
   this one. Compose asks for `prose:deep`.

2. **A fan-out resolves its need once.** `resolveNeed` reads the catalog from
   Mongo each time, and a map-reduce compose issues up to nine calls. The cache
   holds the *promise*, not the answer — the first version cached the answer and
   a two-chunk compose still queried twice, because a fan-out starts every call
   in the same tick and they all miss together.

3. **`looksDegenerate()` — the one that lasts.** A looping answer is now thrown
   away whatever produced it, because routing degrades when good rows are
   cooling and every model loops on a bad day. This is tidy.js's length floor in
   the only form available here: Compose cannot check that content survived, but
   it can check that the answer is not the same sentence forty times. The guard
   sees through the numbering that made all thirty-eight repeats look distinct,
   and ignores short and structural lines so that real tables and checkbox lists
   pass.

Also: `stats.truncated` (the model ran out of room mid-answer) and the model's
name in the dialog. "Which model wrote this" is the first question anyone asks
about a disappointing result, and nothing on screen answered it.

Verified end to end on the live gateway with Chef's original paste: 1,835
characters, `model: gemma4:31b`, `truncated: false`, no degeneracy — inside the
existing 25 s timeout, so that was left alone rather than raised on a hunch.

---

## 2026-09-21

### NoteGeek — every note gets history, and Compose builds a document from scraps

`deeffb53` (gateway), `8091c0de` `9d8b7c0a` `1684b94f` (web + tests)

Two features that only make sense together.

**History.** NoteGeek had none, which is why the Tidy truncation a few hours
earlier was *permanent*. Every meaningful update now snapshots the previous
state into `noteversions` first — 50 per note, newest kept. The pieces that
matter:

- A save that changes nothing is not a version. Autosave on blur, an
  idempotent AI result and a re-save of identical text would otherwise scroll
  the real history out of retention inside a single editing session. Tags-only
  changes don't count either — cheap to redo, noisy to version.
- A snapshot that fails returns `null` rather than throwing. Losing a history
  entry is bad; losing the user's edit *because* the history entry failed is
  worse.
- An encrypted note's content is ciphertext in both places, so a restore
  round-trips without the server ever holding plaintext.
- A restore snapshots the CURRENT state first, so restoring to the wrong
  version is itself undoable.
- The list query omits `content` on purpose; bodies are fetched one at a time.
  50 versions of a long note is a payload nobody asked for.
- Deleting a note deletes its history. Otherwise delete didn't delete.

The `reason` label (`edit` / `tidy` / `compose` / `restore`) is the part that
earns its keep: it's how you tell "I typed over this" from "Tidy ate this",
which is the thing you're actually hunting for after an AI action.

**Compose.** The thing Tidy was never for. Paste in chat messages, half an
email, a ChatGPT answer and three brain-dumps; get back one organised
document. Map-reduce over the material — segment into fragments, batch, extract
per batch, compose the whole — so it survives input far larger than a context
window. Under ~10k chars it takes the single-call path instead.

Compose is **lossy by design** (merging, reordering and dropping is the job),
so unlike Tidy it never writes back over its source, which may be the only
copy of something pasted from another app. The result is previewed; `Save as a
new note` is primary and `Replace this note` is secondary and sits left of it,
so the muscle-memory click is the safe one. Replace is only defensible at all
*because* history now exists.

`chunksFailed` is stated **before** the document, not after. A batch that
failed means material missing from something that still looks complete, and
that changes what the reader is looking at.

Works on text, markdown and code notes — not the canvas types, which have no
plain text to read. Rich-text content is converted with `DOMParser`, not a tag
regex.

Three landmines for the next reader:

- `NoteHistoryDialog` is mounted only while open. Mounted closed it still ran
  `useLazyQuery`, which needs an Apollo client even when skipped — that blew up
  three unrelated page tests whose harness mocks `useQuery` and `useMutation`
  but not `useLazyQuery`.
- MUI copies a Tooltip's `title` onto the wrapper span, so
  `getAllByLabelText('Version history')` matches the span as well as the
  button — and therefore never sees a duplicated button. Query by role.
  (`9d8b7c0a`: my scripted edit had shipped the History button twice in the
  bottom bar and not at all inline, which is the row NoteEditorPage actually
  passes `onHistory` to.)
- The `notegeekContentCeilings` sanitize-timing test was set at 500 ms and
  failed CI at 572 ms while passing locally at 173 ms in the same commit. It
  guards against a return to the *16-second* path; the bar is 2 s now. A
  wall-clock assertion on a shared runner measures the runner too.

Verified live after deploy: `noteVersions`, `noteVersion`, `composeNote` and
`restoreNoteVersion` all answer on the gateway, and `noteversions` exists in
`noteGeek` with both indexes built (`noteId_1_createdAt_-1`,
`userId_1_noteId_1`). The one thing not verified end to end is a real
snapshot — that needs Chef's own session. Editing any note should take the
collection above 0.

### NoteGeek — Tidy 400'd, and I caused it

`c5d2e1a7`

The fix below raised the token cap to a flat 8000. groq answered **400** — a
fixed ask that large exceeds what some models emit — then the request timed
out at 12s and the fallback returned the note unchanged, which the UI
reported as "already clean". Silent destruction traded for silent failure.

Now the ask is sized to the note (input + 60% headroom, floored, capped at a
provider-safe 4000), and the frontend checks `provenance.source === 'fallback'`
before claiming anything was inspected.

**Backed out, and worth remembering.** The 400's reason was invisible because
`AdapterError` discards `error.response.data`, with a comment saying the body
"is read for nothing, not even a log line". I read that as an oversight and
made it append the provider's explanation. It is a SECURITY INVARIANT —
`aiAdapters.test.js` pins it with a fixture whose body contains an API key
fragment, an org id and a project id, plus an 80-character
`trimProviderText` limit. My change would have written keys into the logs
automatically. Two tests caught it; reverted whole.

Same shape as the /usage-routes lesson: *"X is read for nothing"* and *"X must
not be read"* are different claims, and here the comment stated the first
while the tests enforced the second. Read the tests before repairing a gap a
comment describes.

### NoteGeek — Tidy was silently destroying long notes

`28d9a29d`

`TIDY_MAX_TOKENS` capped the OUTPUT at ~12k characters, and a tidy's output
is about as long as its input — so a 19k note came back cut off at ~63% and
that stump replaced the note. Undetectable: `finish_reason` never reaches
the module, so a guillotined response looks complete.

Now refuses up front past `MAX_TIDY_CHARS`, and discards any result under
80% of the input length. The prompt was also a rewriter ("tighten phrasing",
"reorganize language"), which is why it mangled notes that were already
clean — and the guard meant to catch that was exact string equality against
an LLM response, so it never fired.

**The general lesson:** an output token cap on a transform whose output is
proportional to its input is an INPUT limit in disguise. If the chain cannot
see `finish_reason`, length is the only truncation signal available — and
something has to check it.

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
