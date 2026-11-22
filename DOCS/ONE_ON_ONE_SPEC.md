# 1:1 notes in NoteGeek — spec

**Status:** built 2026-11-22. Chef's sign-off was "lets build now and then tweak", so this is
a first cut to be corrected in use, not a frozen contract.

## 1. Intent

Chef (2026-11-22): "I manage people. I do it with my tablet in my hand. Right now I have to
take live notes and manually rewrite them into something that fits the specific shape of
manager-toolbox. Maybe even if NoteGeek could just handle searchable 1:1 info. I really don't
use manager-toolbox anymore because it became too cumbersome. I still need those notes and
logs though." And: "i already use fd/1on1/(person) as the tag system".

The handwriting is the record. Nothing is rewritten into a form.

## 2. Requirements

Proposed by Sage from the conversation, accepted by Chef as a starting point.

1. **Start a 1:1 in a couple of taps.** "New 1:1" lists the people under the 1:1 tag,
   longest-unmet first, plus a box for a new name. Picking one opens a handwritten note titled
   `YYYY-MM-DD Name 1:1`, tagged `<1:1 tag>/<person>`. Nothing is saved until there is ink.
2. **A 1:1 sheet.** The new note starts on a printed sheet: their topics, my topics, notes,
   actions. It is an ordinary template sheet (`TEMPLATES_SPEC.md` §2a): removable, and
   available from the Paper menu on any sketch.
3. **Open items follow the person.** Tasks sent from a 1:1 ("Send tasks to TodoGeek") carry
   the person's tag. A note tagged for a person shows "Open with Name (n)" above the page:
   TodoGeek's pending tasks with that tag, each tickable. Expanded on a new 1:1, collapsed on
   a saved one, absent when there is nothing open.
4. **The person's page is a log.** The tag page for `<1:1 tag>/<person>` is headed by when you
   last met, the open items, "New 1:1", and a search of only that person's notes.
5. **The people page shows who you are behind on.** The 1:1 tag's own page lists each person
   with the date of their last 1:1, longest ago first.
6. **The tag is a setting.** Settings → 1:1s → "1:1 tag"; default `fd/1on1`.

## 3. Out of scope

- Importing manager-toolbox's data (Chef: "we'll deal with the import later").
- Pulse ratings, fixed sections, report tiers, cadence rules, review cycles.
- A lasso in NoteGeek. Tasks come from journal-marked lines, as before.
- A per-note "do not transcribe" switch.
- Calendar, reminders, anything that reads a work system.

## 4. Invariants

- Existing notes are never rewritten or re-tagged. Notes already under `fd/1on1/...` are the
  log from the first day.
- Every other tag page looks and behaves as it did.
- No task is created without the Send dialog's confirmation.
- Nothing new is stored on the gateway: people, counts and "last met" are read off notes and
  their tags (`createdAt` of the newest note with the person's tag).

## 5. Known limits (first cut)

- "Last met" is the newest note's creation date, not a date read from the title.
- Open items are an exact-tag match on TodoGeek's `tasks(status: "pending", tags:)`; blocked
  ("parked") tasks are not shown.
- The people query reads every note under the 1:1 tag (ids, tags, dates only).
- A person is the first segment under the 1:1 tag; a display name is the tag with capitals
  (`sam-lee` → "Sam Lee").
- Automatic transcription sends each page to the outside model, as for any sketch, and is
  capped at 30 pages a day.
- A page is read about 90 seconds after the last stroke while it is open, a few seconds after
  it is closed, and otherwise by the background reader the next time NoteGeek or GeekDay is open
  on any device (apps/notegeek/DOCS/AUTO_TRANSCRIBE_SPEC.md, "Background reader", 2026-11-22).
  Until that date a page on a template sheet, which every 1:1 page is, was never read at all.
