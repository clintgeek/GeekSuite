# NoteGeek + TodoGeek — review and improvement plan (2026-11-15)

Goal (Chef): perfect phone, tablet and desktop use in both apps. This is the
plan, in order of impact. Nothing here has been built.

## How this was made

Seven parallel reviews of `main` at `809cc03b`, then a merge:

| Review | Covered |
|---|---|
| NoteGeek app shell | routes, lists, viewer, editors (not sketch), search, settings, PWA |
| NoteGeek sketch stack | tldraw editor, toolbar, paper, pen, auto-transcribe, Send tasks, journal reading |
| NoteGeek gateway | notes, versions, search, indexer, transcription pipeline |
| TodoGeek UI | the four live screens and their components |
| TodoGeek data | `TaskContext`/`PenContext`, the shared grammar, gateway, NoteGeek hand-off |
| Screenshots ×2 | every harness screenshot of both apps |

**Confidence marks** on each item:

- **✔** I re-checked it in the code (or ran it) after the review.
- **R** the reviewer verified it in code; I did not re-check.
- **?** not settled by reading code; needs a device or a measurement.

**Limits you should know about**

- **No tablet has ever been tested.** The harness has two viewports: a phone
  and 1280×900. Everything said about 600–1100 px is from reading code.
- **TodoGeek's screenshots date from 29 October**; visual findings there are
  about the app as it looked then.
- Nothing was run on the Lenovo or the S26. The device checklist is at the end.
- One reviewer finding was discarded: the "off-theme tag drawer" is a stale
  25 September screenshot, not a live screen.

Effort: **S** under 2 h · **M** up to a day · **L** several days.
Apps: **N** NoteGeek · **T** TodoGeek · **G** gateway · **UI** shared `packages/ui`.

## The short version

1. **Both apps can lose or corrupt what you wrote.** That outranks every layout
   question. Tier 1 is 21 items, mostly small.
2. **The pen experience has real bugs**, the worst being that the whole sketch
   is serialised on every pointer frame. Tier 2.
3. **Neither app has a tablet layout.** Each has one breakpoint (900 px) and
   chooses by width, never by input type. A touch tablet in landscape gets
   mouse-sized targets; in portrait it gets a stretched phone. Tier 4.
4. **Desktop is a phone column in a wide window** in both apps. Tier 4 and 7.
5. **TodoGeek is four screens** (Today, Upcoming, Done, Search). Plan, Review,
   Collections, Tags and Habits redirect to Today; their code is still in the
   tree and still muddies `TaskContext`.

---

## Tier 1 — Lost work and wrong data

Do these first. Ordered by how likely they are to bite in daily use.

### 1.1 TodoGeek: a task timed at 6 pm (7 pm in summer) becomes a date-only task for the next day ✔
- **Where:** `apps/todogeek/frontend/src/utils/dueDate.js:71` (`hasDueTime`), `packages/task-grammar/src/createInput.js`, `reminderService.js`, `taskService.js:255-326`.
- **What:** "date only" is encoded as exactly UTC midnight. 6 pm Central *is* UTC midnight (confirmed: `2026-11-21T00:00:00.000Z`). "pick up kids today 6pm" shows as "tomorrow", leaves Today, and never reminds.
- **Fix:** add an explicit `hasDueTime` field; as a stopgap never send a timed value on exact UTC midnight. **Effort S–M.**

### 1.2 NoteGeek: unsaved edits live only in memory, and nothing saves when the app is backgrounded ✔
- **Where:** `NoteEditorPage.jsx:866-875` (2 s debounce); no `visibilitychange`/`pagehide` anywhere in NoteGeek; `HandwrittenEditor.jsx:251-263` drops its pending 400 ms snapshot on unmount.
- **What:** switch to the camera, take a call, or tap Back within ~2 s of the last word or stroke, and Android can freeze the PWA before the save. Home capture and share-target text are the same.
- **Fix:** flush on hidden/pagehide and on unmount; mirror drafts to IndexedDB keyed by note id, clear on server ack, offer "restore unsaved changes". **Effort M.**

### 1.3 NoteGeek: a failed or offline save is never retried when the connection returns ✔
- **Where:** `NoteEditorPage.jsx:868-875` — the timer only re-arms when `dirty/content/title/tags` change.
- **What:** write on the train, "offline" shows, signal returns, nothing is sent.
- **Fix:** retry when `online` flips true and on return to visible. **Effort S.**

### 1.4 NoteGeek: two devices on one note — the later save silently replaces the earlier ✔
- **Where:** `resolvers.js:582-586` (`findOneAndUpdate({_id, userId})`, no base version); client sends the whole note on every autosave; the editor can also seed itself from a stale Apollo cache (`NoteEditorPage.jsx:205-242`).
- **What:** tablet idle on a note, phone adds a paragraph, one keystroke on the tablet writes the old body back. Sketches lose strokes.
- **Fix:** `baseUpdatedAt` on `updateNote`, CONFLICT with the server copy, "keep mine / theirs / both"; seed the editor only from a network-fresh result; re-check on return to visible. `foldInApply` already does the conditional write. **Effort M + M.**

### 1.5 NoteGeek: version history only covers the last few minutes R
- **Where:** `versions.js:29-35`, `models/NoteVersion.js:81` (50 per note, one per autosave).
- **What:** fifty typing pauses evict yesterday's version — so 1.4's "recover from History" is weaker than it looks. A sketch stores up to 5 MB per version (≤ 250 MB per sketch, in Mongo and backups).
- **Fix:** coalesce (one per ~10 min plus session start), keep dailies for 30 days, never prune the snapshot before a large shrink. **Effort M.**

### 1.6 TodoGeek: ticking or deleting a repeating task right after creating it acts on the whole series R
- **Where:** `TaskContext.jsx:620-622`, `taskService.js:1014-1052`, `:480-484`.
- **What:** "vitamins (daily)" ticked straight away completes the series master: it vanishes from every view and never repeats. Delete removes the series.
- **Fix:** refetch after a create that returns a master (or return the first occurrence); gateway refuses status changes on a master without ALL_INSTANCES. **Effort S.**

### 1.7 TodoGeek: deleting a moved/edited/completed occurrence brings it back R
- **Where:** `taskService.js:1020-1028` — nothing is pushed to the master's exdates. `SIMPLE_PLAN.md` promises the opposite.
- **Fix:** push `originalDueDate` to exdates in the same write. **Effort S.**

### 1.8 TodoGeek: completing an overdue repeat reveals the one before it, back up to a year R
- **Where:** `taskService.js:375-388, 530`; `penViews.js:88-97, 231`.
- **What:** a daily missed five days shows "1 day late"; tick it and "2 days late" appears, and so on. Search shows the *oldest* occurrence.
- **Fix:** one "late" row per series; completing it skips the earlier misses. **Needs your call on the rule** (see Decisions). **Effort S.**

### 1.9 TodoGeek: a refresh that started before an add can overwrite it R (timing ?)
- **Where:** `TaskContext.jsx:505` — `setTasks(responseData)` with no sequencing.
- **What:** open the app after a minute away, type at once; the big `allTasks` reply lands after the create and the new task disappears until the next refresh. You type it again: two tasks.
- **Fix:** mutation sequence counter; drop or re-run fetches older than the last local write. **Effort M.**

### 1.10 Both: a retried create makes a duplicate; a stalled request freezes the add box R
- **Where:** `packages/api-client/src/index.js:225-226` (no timeout/retry), `taskService.js:765-775` (no idempotency), `AddBox.jsx:90-92`, NoteGeek's send loop `NoteEditorPage.jsx:646-660`.
- **Fix:** client-generated `clientId` with a unique `{createdBy, clientId}` index; ~15 s fetch timeout. NoteGeek sends `hash(sketchId + lineKey)`. **Effort M.** Fixes 1.11's worst case too.

### 1.11 NoteGeek → TodoGeek: "already sent" breaks when a transcript is corrected or re-read ✔ (partly)
- **Where:** `journalLines.js:57-65` (key = kind + words), `sketchTranscript.js:300-305` (read-merge-`$set`, confirmed — loses keys under concurrent calls).
- **What:** fix "Bbo"→"Bob" in the Send dialog (not saved as a correction), later re-read the page: the line is offered again, ticked, and Send creates a second task.
- **Fix:** `$addToSet`; store the sent text and match loosely ("Probably already sent", unticked); save Send-dialog edits as corrections; server idempotency from 1.10. **Effort M.**

### 1.12 TodoGeek: an expired session or a failed load looks like "Nothing due today" R
- **Where:** `attachUser.js:105-118` + `resolvers.js:133-137` (anonymous → `[]`, HTTP 200); `PenContext.jsx:72-77` sets `loaded` after a failed fetch.
- **Fix:** UNAUTHENTICATED error for anonymous task queries; never replace a non-empty list with an empty one from a doubtful request; render "Couldn't reach your list · Retry". **Effort S.**

### 1.13 TodoGeek: inline edits are discarded silently R
- **Where:** `usePenRows.jsx:27-30` — tapping the row's words again, or another row, drops the form.
- **Fix:** collapse = save when something changed; Escape/Cancel still discard. **Effort S.**

### 1.14 TodoGeek: the add box erases what you type during the save round trip R
- **Where:** `AddBox.jsx:79-101` — `setValue('')` after the await.
- **Fix:** clear only if the value still equals what was submitted. **Effort S.**

### 1.15 TodoGeek: a task added under an active tag filter vanishes R
- **Where:** `PenContext.jsx:261-278` ignores `tagFilter`.
- **Fix:** append the active tag as a removable ghost `#work`, or toast "Added, not tagged #work · Show". **Effort S.**

### 1.16 TodoGeek grammar: three ways a typed line becomes the wrong task R (probes run)
- `buy /tomorrow 2 loaves` → due 02:00, words "buy loaves" (`parseTaskInput.js:155, 388-404`).
- `/mar 5` typed in November → last March, already overdue; the existing test asserts this (`parseTaskInput.test.js:81-86`).
- `read example.com/2024 notes` → a due date, and the URL is mangled.
- **Fix:** slash path requires am/pm or hh:mm; roll past dates forward; require whitespace before `/`; reject invalid dates. **Effort S.** Affects handwritten tasks too.

### 1.17 Sketch: a new stroke can be wiped by the editor reloading its own snapshot ✔ (logic) ? (frequency)
- **Where:** `HandwrittenEditor.jsx:120-127, 244-248`.
- **What:** pause ~400 ms between words (normal), and the first stroke of the next word can disappear. Plausibly the "fragmented strokes" symptom.
- **Fix:** only reload content that came from outside (History restore). **Effort S.**

### 1.18 Sketch: an inserted or pasted image can make the sketch unsaveable ✔
- **Where:** `<Tldraw>` has no `maxImageDimension`/`maxAssetSize`; `saveGuards.js` then refuses every save with "Try removing some strokes".
- **Fix:** `maxImageDimension={1600}`, size check before insert, name images in the message. **Effort S.**

### 1.19 NoteGeek: delete is permanent and takes the history with it R — decision
- `resolvers.js:633-661`. `CONTEXT.md` §11 records "no trash" as deliberate. Against "notes never lost" I'd reverse it: `deletedAt`, hidden like archived, purged after 30 days, Undo toast. Also: Delete is the dialog's autofocus button (`DeleteNoteDialog.jsx:55`), so Enter deletes. **Effort S–M.**

### 1.20 NoteGeek: "New note" while on an autosaved new note keeps editing the old one; `/notes/new` never becomes the real id R
- **Where:** `App.jsx:49-53`, `NoteEditorPage.jsx:205, 761-766`.
- **What:** a reload, an OS kill, or the post-deploy reload opens a *blank* note; back/forward never contains it.
- **Fix:** swap the address to `/notes/<id>/edit` without remounting; key the reset on `location.key`. **Effort M.**

### 1.21 Smaller integrity items R
- **T** Changing a series' time for "all" doesn't move it (`taskService.js:867, 943-948`). **M**
- **T** Repeats drift an hour at DST — known (§2.5), still open. **M**
- **T** `createTask` accepts `status: completed` without `completedAt` — NoteGeek's `x` lines use this; also accepts client `isSeriesMaster` (invisible task). **S**
- **T** Any recurrence text is accepted; `FREQ=SECONDLY` would expand tens of millions of rows on the shared gateway. **S**
- **T** Quick tick/un-tick can leave screen and server disagreeing (response order). **M** ?
- **N** A crash mid-claim leaves `processing`; Convert readings are then paid for and thrown away (`sketchTranscript.js:257`, no age check ✔). Every push restarts the gateway. **S**
- **N** Indexer can mark a sketch indexed against an older transcript (`indexer.js:88-92`). **S**
- **N** A sketch autosave can write old transcript text back into word search (`Note.js:199-205`). **S**
- **N** Erased ink and old corrections stay searchable forever (`sketchText.js:63-70`). **S**
- **N** A photo note whose reviewed-text save fails is unsearchable forever — accept the text in `createNote`. **S**
- **N** A tag typed but not confirmed is dropped on blur (`TagSelector.jsx:33-36`). **S**
- **N** Home capture strips line breaks, double-saves on double tap, fails silently (`QuickCaptureHome.jsx:92-162`). **S**
- **N** Title field fills with "Untitled Note" two seconds into writing (`NoteEditorPage.jsx:733, 771`). **S**
- **T** A private task's words leak through the date sheet on desktop (`DatePickSheet.jsx:28` ✔), and hiding switches off below 900 px (`PrivacyContext.jsx:43-44`) — a half-screen window during a screen share. **S + S**

---

## Tier 2 — Pen and sketch (the tablet centrepiece)

### 2.1 The whole sketch is serialised on every pointer frame ✔
- **Where:** `HandwrittenEditor.jsx:175-186` — an unfiltered `store.listen` runs `getSnapshot()` + `JSON.stringify` + a full string compare on every pointer event, hover included. `getSnapshot()` is deprecated and warns each call.
- **What:** on a 2 MB sketch that is 2 MB of stringify per frame on the main thread: pen lag and dropped points.
- **Fix:** listen with `{scope:'document', source:'user'}`; serialise inside the 400 ms timer; dirty flag instead of string compare. **Effort S.** Biggest single win for writing feel. (Frame cost ?)

### 2.2 In fullscreen, every picker and tooltip is invisible ✔
- **Where:** popovers in `DrawingToolbar.jsx`/`Paper.jsx` portal to `document.body` (no `container` prop), outside the fullscreen element.
- **What:** tap the pen dot in fullscreen: nothing shows, but a modal is open and eating taps. Fullscreen is the mode you asked for.
- **Fix:** pass the editor container to Popover and Tooltip. **Effort S.**

### 2.3 Palm rejection starts only after the first pen stroke, every time a sketch opens R
- tldraw's pen mode is session state; each mount starts with it off, so a resting palm draws first.
- **Fix:** remember "this device has a pen" and turn pen mode on at mount; a "Finger draws" toggle. **Effort S.**

### 2.4 A resting palm can press the toolbar; there is no left-handed option R ?
- The bar is ordinary buttons at bottom centre; palm rejection covers the canvas only.
- **Fix:** in pen mode ignore touch on the toolbar; a position setting (bottom / top / left / right) per device. **Effort M.**

### 2.5 The phone bar has no Eraser, Redo or Select — decision
- Below 720 px: Move, Write, Pen, Paper, Undo, Fullscreen. You chose this bar; I'd keep it and add **Eraser** plus one **More** popover (Select, Redo, Highlighter). The side button is the only eraser today, and it's unverified on Samsung and taken by the OS on Lenovo. **Effort S.**

### 2.6 The 15-tool bar is wider than its space in some windows R
- The bar is ~716 px; the switch is a *viewport* query at 720 px, but from 900 px the 220 px sidebar takes room. At 900–935 px the last buttons fall off.
- **Fix:** choose by container width (ResizeObserver); overflow into More. **Effort S–M.** (Lenovo portrait width ?)

### 2.7 Long sketches become unreadable to the model, silently R ?
- `sketchExport.js:252-314` fits the whole page into 2000 px. At three screens tall, handwriting is 6–9 px high; the read fails and that hash is marked `failed` — never searchable.
- **Fix:** read in horizontal bands at a minimum scale and join; at least warn. **Effort M–L.** This is the meeting-notes case.

### 2.8 Transcription state bugs R
- An edit made while a read is in flight can come back `current: true` for old text; Send tasks then misses the new line (`useAutoTranscribe.js:91, 127`). **S**
- An export error re-exports and re-uploads every 2 minutes forever (`:99-102`). **S**
- Photo and locked notes are exported and uploaded after markup only to be told `off`. **S**
- Convert and Send tasks don't await their save and never update the status; the same page can be paid for three times (`NoteEditorPage.jsx:493, 604`). **S**
- Failed calls and `AI_CAP` days count as attempts; six capped days mark a sketch `failed`. **S**
- The sketch hash is recomputed on every read, blocking the shared gateway 70–425 ms each (measured on a 7.7 MB snapshot); the spec said to store it. **M**

### 2.9 Journal reading mistakes R (probes run)
- `! * call bob` → task text "* call bob". `* * *` → a task. `x 3 sets of 10` → done. `> 5 kg flour` → migrated. `1. call bob` → never offered. `[ ]buy milk` (no space, which is how the prompt writes it) → dropped.
- "Keep as plain text" uses a different, smaller mark table than Send tasks.
- **Fix:** one shared mark table; strip a second mark; require a letter after `x > <`; accept `[ ]` without a space; offer numbered lines unticked. **Effort S.**

### 2.10 Relative dates are read against the day you press Send R — decision
- Monday's "call Bob tomorrow", sent Wednesday, lands Thursday. Undated lines land on today.
- **Fix:** anchor to the transcript's date when the page is older; show "Written Mon 16 Nov · dates read from then" with a switch. **Effort S.**

### 2.11 Sketch usability R
- Reopening always starts at the origin at 100 % — you pan back to where you were writing. Keep the camera per note; add zoom-to-fit to the phone bar. **S**
- Saved sketches open with the pen armed, cropped rather than fit (screenshots `10-editor-sketch`). Open in view mode, arm on first pen contact. **S**
- Status line: `failed` says "needs retry" but never retries and has no button; detail is in a tooltip (long-press on touch). Make it tappable with "Transcribe now" / "View text". **S**
- Corrections vanish from Convert after one more stroke (kept for search only). Carry them forward by line diff. **M**
- Chrome above the canvas is ~35 % of a phone screen and worse in landscape; fold Back/title/tags/menu into one row or tuck on first stroke. **M**
- The bar ignores the gesture-bar safe area (`bottom: 16`). **S**
- Pen button can leave the eraser stuck on if the lift happens outside the container (`penButton.js:94-120`). **S** ?
- Text tool: top bar hides and returns, shifting the canvas under the text. **S** ?
- Ink swatch is dark-on-dark in dark mode on light paper (`03q-sketch-paper-dark`). **S**
- Paper choice leaks between sketches and differs per device — documented decision; I'd write the effective paper into the sketch on first ink. **S**
- `/labs/pen` labels a mid-stroke button press as "eraser" though nothing acts on it; logic is copied, not imported. **S**

### 2.12 Missing for a pen-first note-taker
Lasso select · scribble-to-erase · two-finger-tap undo · pages or a page boundary · export PNG / share · "view / copy transcript" without Convert · search-hit location inside a sketch · a preset strip of 2–3 favourite pens · pressure on/off.

---

## Tier 3 — Phone, daily friction

### NoteGeek
- **3.1 Every note open waits on the network; offline nothing opens.** `loading` is true even with cached data; error is checked before data (`NotePage.jsx:101, 122`); no cache redirect; cache is memory-only. Show spinner only when `loading && !data`, add a `note(id)` cache redirect. **S** (persistence is 7.1) R
- **3.2 Android Back** goes to `/notes` regardless of origin, or out of the app after a share/shortcut (`NoteViewer.jsx:139`, `NoteEditorPage.jsx:940`). One `goBack()` helper. **S** R
- **3.3 Checklists are pictures.** Ticking one item = open, Edit, find the line, retype `[x]`. Tappable boxes in the viewer; continue lists on Enter in the editor. **M** R
- **3.4 New note needs three taps before you can type**; no autofocus; Enter in the title does nothing. **S** R
- **3.5 Home flashes skeletons on every visit**, fetches 50 full notes to show 12, hides its errors; a delete triggers an unbounded refetch of every note (`noteStore.js:185`). **S** R
- **3.6 Scroll position, filter and sort are lost** when you come back from a note. **M** R
- **3.7 Version history is unusable on a phone** (260 px list inside a ~296 px dialog; raw JSON for code and mind maps). **M** R
- **3.8** Compose dialog not full-screen; viewer bar has six icons with Delete beside Archive; share-target failure is a dead end with no Retry; Notes header row (count + Select + Tags + three sorts) is cramped; wrong empty state under a filter. **S each** R
- **3.9** Code editor fights the keyboard (no `autocapitalize/autocorrect off`) and traps Tab. **S** R
- **3.10** Mind map: tooltip advertises a Tab shortcut that doesn't exist; edit needs double-click; 8 px handles. **S–M** R
- **3.11** Review dialogs: primary "Compose it" alone on a second row; helper text clipped; model id shown as a chip (`12b`, `13c`). **S**
- **3.12** `[[` link picker preselects "New note" over the existing match — Enter creates a duplicate (`18a`). **S**

### TodoGeek
- **3.13 Undo and error toasts sit on the docked add box, and behind the keyboard.** The Dock never registers toast clearance; `TaskContext` runs a second snackbar stack. **S** R
- **3.14 The inline editor is taller than the phone**; Save is off-screen and the keyboard opens on every tap (`InlineEditor.jsx:64` autofocus). Bottom sheet with a sticky footer; autofocus only with a fine pointer. **M** R
- **3.15 Only ~3 tasks fit above the add box.** Date hero ~220 px + chips ~100 px + a top bar that repeats the page title. Collapse the hero on scroll; chips in one scrolling row (`TagChips.jsx:55` wraps). **M**
- **3.16 Rows leave 140–200 px for the words**: a permanent 44 px grip on every row plus a nowrap date label. Reorder by long-press or a Reorder mode; date under the words. **M** R
- **3.17 The add box is one line** and crops what you're typing; Private is an unlabelled icon on phone. Auto-grow to two lines, parsed preview line. **M** R
- **3.18 Moves aren't optimistic**: swipe, row snaps back, lingers a round trip, vanishes; "Move all" runs one by one. **M** R
- **3.19** Tick a task whose editor is open and the add box disappears (`TodayPage.jsx:259`). **S** R
- **3.20** Scroll position carries between tabs; tapping the active tab doesn't scroll to top. **S** R
- **3.21** Left-swipe on a done row promises "Tomorrow" and does nothing. **S** R
- **3.22** No confirmation for an add dated today (row is off-screen behind the keyboard). **S** R
- **3.23** Swipe actions are one bare word on a solid block, no icons, undiscoverable; no haptics. **S**
- **3.24** Upcoming clips "Tomorro"; rows ~225 px tall (`05-upcoming`). **S**
- **3.25** Pins and Help sheets have no close button on phone; Help shows keyboard keys to a phone. **S**
- **3.26** Reminders switch lives only in the hamburger drawer. **S**

### Both (shared fix)
- **3.27 Android Back never closes a sheet, dialog, menu, editor or select mode — it leaves the page or exits the PWA.** ✔ no `popstate`/`pushState` in either app or `packages/ui`. One `useBackToClose(open, onClose)` in `packages/ui`, wired into GeekSheet and GeekDialog. **M**, benefits every app.

---

## Tier 4 — Tablet and desktop layout

Foundations first; each later item leans on them.

- **4.1 Add tablet viewports to the harness** — 800×1280 and 1280×800, coarse pointer. Without it every tablet change is unverified. **S–M**
- **4.2 One `useFormFactor()` hook** `{phone, tablet, desktop, coarse}` in `packages/ui`. Today: NoteGeek switches at 900 px except MarkdownEditor (600) and TagSelector (600); only one file asks about pointer type. **S**
- **4.3 Size by pointer, not width.** From 900 px NoteGeek shrinks targets to 24–32 px (tag chevrons, ⋯, toolbar) — on a touch tablet in landscape. TodoGeek's hover actions need a *primary* fine pointer, so a tablet with a trackpad has no row actions (`PenRow.jsx:225`; use `any-hover`). **M**
- **4.4 Navigation rail (~72 px) from 600 to ~1200 px** in place of drawer-below / 220 px-sidebar-above. Constrain TodoGeek's dock and sheets to the 720 px measure. **M**
- **4.5 NoteGeek two-pane: list | note** from ~840 px landscape, **tags | list | note** from 1200 px. Fixes scroll loss (3.6) and Back confusion (3.2) by construction. Today a 720 px list sits in empty space and every open is a navigation. **L** — the biggest tablet and desktop gain.
- **4.6 TodoGeek two-pane at ≥ 1100 px:** Today on the left; editor or the next few days on the right. Today's 720 px column leaves ~170 px empty each side and the editor reflows the list. **M–L**
- **4.7 TodoGeek week strip / week board on Upcoming** — seven columns, drag between days. Skipped days are invisible today. **L**
- **4.8** NoteGeek Split view is squeezed into the 680 px column (two 316 px halves on any monitor) and sticks on after rotation (`MarkdownEditor.jsx:67, 339`). **S**
- **4.9** With the keyboard up on a landscape tablet the top bar stays (tuck is phone-only); a big phone in landscape can cross 900 px and get the sidebar in 412 px of height. Tuck on `coarse && keyboard`; no permanent sidebar under ~500 px tall. **S**
- **4.10 Desktop keyboard.** NoteGeek has `/`, Ctrl+S, Ctrl+P, Esc only: add new-note, J/K + Enter in lists, Esc to leave the editor, Ctrl+K switcher (`noteTitles` exists). TodoGeek: add-from-anywhere only works on Today though the docs say everywhere; add priority keys, multi-select, roving focus (j/k "focus" is visual only; six Tab stops per row). **M + M**
- **4.11** NoteGeek desktop rows have no right-click or hover actions, and a slow mouse click enters select mode (`useLongPress`). **S–M**
- **4.12** `/search` shows two search boxes on desktop (three entry points). **S**
- **4.13** TodoGeek add box isn't sticky on desktop; sidebar carries no counts or pinned tags; it steals focus when Today empties (`TodayPage.jsx:211`, pops the keyboard on a tablet). **S**

---

## Tier 5 — Search quality and speed

- **5.1 The note list sends full content of up to 200 notes** — multi-MB sketches included — on every visit ✔ (`queries.js:4-17`, `NoteList.jsx:161`, non-lean unprojected find). Server `preview` field, projection, drop `content` from lists. **M**
- **5.2 Notes past the newest 200 can't be reached from the list**; A–Z sorts only those 200 ✔. Keyset paging; sort on the server (already supported, never sent). **S–M**
- **5.3 Word search indexes markup** for rich text, code and mind maps — "target", "language", "label" match every such note. Same fix the sketch work made. **S–M** R
- **5.4 No title weighting; no prefix or typo matching.** "gar" finds nothing. Weights `{title:10, tags:5, wordText:1}`; title-prefix as a third ranked list. **S + M** R
- **5.5 Snippets:** none for sketches even when the transcript matched; raw JSON for code; first 200 characters rather than around the hit; highlights inside words ("Sun**day**"). **S** R
- **5.6** No index fits the list query — add `{userId, pinned:-1, updatedAt:-1}`. **S** R (plan ?)
- **5.7** Every autosave on desktop refetches all tags and every note's tags (`cacheUpdates.js:39-72`); each sketch autosave moves the whole sketch ~3 times. Evict tags only when tags changed; slim the autosave response. **S–M** R
- **5.8** Every index write drops the user's whole vector cache; one slow embedding pauses search and indexing for everyone for 30 s–15 min (`semantic.js:387-391`). **M + S** R
- **5.9** Chunks may exceed the embedding model's 512-token context (sizes were tuned for the previous model). Check, then lower. **S** ?
- **5.10** Search query has no length limit; the fold-in picker sends up to 12 000 characters. **S** R
- **5.11** NoteGeek main bundle is 1.47 MB; every page is eagerly imported, including Pen Lab and the markdown renderer. Lazy routes. **M** R
- **5.12** TodoGeek: every change re-renders every row — `usePenRows.jsx:24-25` depends on the whole `pen` object ✔, defeating `memo`. **S**
- **5.13** TodoGeek reloads the whole task history on every return, with ±1 year of virtual rows per series. Fine today (0 repeats), multiplies when repeats arrive. **M–L** R
- **5.14** TodoGeek sees other devices' changes late or never: no focus/online refetch, a visible desktop tab never refetches, manual order never re-syncs. **S** R

---

## Tier 6 — Polish and consistency

- **N** Viewer shows the title twice (title + matching first H1) on every markdown note. **S**
- **N** Five different left gutters on one screen (18/24/36/48 px). **S**
- **N** Three dialog grammars for the same job on phone; rename-tag is a full screen for one field. **M**
- **N** Photo notes show raw `--- page 1 ---`, a literal `->`, unhighlighted `[?]`. **S**
- **N** Suggestions panel pushes the note below the fold, offers tags already applied, shows the model id. **S**
- **N** Wide tables and code blocks clip with no scroll cue. **S**
- **N** Select mode stacks action bar + tab bar (23 % of the screen). **S**
- **N** Viewer tag chips are clickable `<span>`s (not focusable, ~20 px). **S**
- **N** Font-size setting saves on every slider step and does nothing for Markdown below 16. **S**
- **N** Photo tray: primary action below the fold; four same-weight icons per page. **S**
- **N** Glance and suite-tags show raw sketch JSON as a snippet (`glance/resolvers.js:87-91`). **S**
- **T** Done is the same red as high priority and overdue; a page of finished work looks urgent — decision. **S**
- **T** Priority is a thin bar of varying height with no legend. **S**
- **T** Notes and events get a checkbox, count as to-dos, and carry over forever; migrated/scheduled have no glyph. NoteGeek sends `-` and `@` lines into this — decision. **M**
- **T** Private tasks are redacted on desktop and plain on phone — decision. **S**
- **T** Hover actions overprint the time (`41-private-revealed`); date field clips its last digit; clipped highlight on the expanded "carried over" header; blue clear-icon in Search; drag has no drop line and no visible lift in dark mode. **S each**
- **T** Timed tasks earlier today aren't marked as passed; "0 to do · 0 done" while loading; Search silently caps done matches at 100. **S each**
- **T** Recurring-edit dialog: Escape also discards the edit (`InlineEditor.jsx:52-54, 135-140`). **S**
- **Both** Empty, loading, error and offline states have no harness scenes at all.

---

## Tier 7 — Bigger bets

1. **Offline-first, both apps.** Persist the last good data (IndexedDB) and render it marked stale; an outbox for create / tick / move / save, keyed by the `clientId` from 1.10. Absorbs 1.2, 1.3, 1.12, 1.14, 3.1. **L each.** The single change that makes a phone PWA trustworthy.
2. **One reading-and-writing surface for prose notes.** Open Markdown straight into a rendered state, tap to edit. Removes the viewer/editor double route, two action sets, duplicated preview styles, and a tap from every phone edit. **L**
3. **Capture from anywhere (TodoGeek).** Manifest shortcut "Add task"; share target; add line on Upcoming pre-dated to the day. **M**
4. **A handwritten add field in TodoGeek** reusing NoteGeek's transcription and the shared grammar — already parked in SUITE_TODO; the plumbing now exists.
5. **Server-side transcription (Option B)** so a sketch closed within 90 s still becomes searchable. Until then: a "3 sketches waiting" count on the list. **L / S**
6. **Bulk organise in NoteGeek:** Select all, tag, pin, delete. **M**

---

## Decisions I need from you

| # | Question | My recommendation |
|---|---|---|
| D1 | NoteGeek: soft delete with 30-day purge? (reverses `CONTEXT.md` §11) | Yes |
| D2 | Sketch phone bar: add Eraser + a More popover? | Yes — keeps the bar you like |
| D3 | Overdue repeats: one "late" row, completing it skips earlier misses? | Yes |
| D4 | TodoGeek notes and events: no checkbox, not counted, events expire? | Yes; it's what the handwriting import assumes |
| D5 | Private tasks on phone: masked until tap, like desktop? | Yes |
| D6 | Handwritten relative dates: anchor to the page's date, with a switch? | Yes |
| D7 | Done in a neutral ink rather than red? | Yes |
| D8 | Paper: write it into the sketch on first ink (stop following the device)? | Yes |
| D9 | Tablet nav: rail from 600 px in both apps? | Yes, after 4.1 |

## Needs a real device

1. Lenovo CSS width in portrait and landscape (decides 2.6, 4.4, 4.5).
2. What each pen's button sends — `/labs/pen` on both devices.
3. Pen lag on a 1–3 MB sketch before and after 2.1.
4. Whether pausing ~400 ms between words drops a stroke (1.17).
5. Fullscreen: pickers (expected invisible), Back, gesture-bar overlap.
6. Palm on the toolbar; palm marks before the first pen stroke.
7. Model legibility of a 3–5-screen sketch (2.7).
8. The new transcription prompt on real handwritten marks — still untested.
9. Android freezing the PWA mid-debounce: is unsaved content there on resume?
10. Gboard handwriting into TodoGeek's add box.

## Suggested order of work

| Batch | Contents | Size |
|---|---|---|
| A | Small integrity fixes: 1.1, 1.3, 1.6, 1.7, 1.12–1.18, the S items in 1.21, 2.1, 2.2, 2.3, 2.9 | ~2–3 days |
| B | Save safety: 1.2, 1.4, 1.5, 1.9, 1.10, 1.11, 1.20 | ~1 week |
| C | Shared foundations: 3.27, 4.1, 4.2, 4.3 | ~3 days |
| D | Phone friction: Tier 3 | ~1 week |
| E | Sketch: rest of Tier 2 | ~1 week |
| F | Lists and search: 5.1–5.7, 5.12, 5.14 | ~4 days |
| G | Layout: 4.4–4.7, 4.10 | ~2 weeks |
| H | Offline-first (7.1), then the rest of Tier 7 | open |

Each fix ships with a test that goes red when the fix is reverted. The gateway
goes out before any UI that selects a new field.

## Cleanups found along the way

- **TodoGeek Phase 4:** retired pages and components are still in the tree and `TaskContext` still mounts their dialog and snackbar. Keep the gateway subtask API.
- **basegeek `routes/noteGeek.js`** is a legacy REST route pointed at the wrong database, storing `lockHash` in plain text. Delete it; the SUITE_TODO `getTagHierarchy` entry describes code that no longer exists.
- **Docs drift:** TodoGeek `CONTEXT.md` says MUI v7 (it's 5.18); `SORTING_RULES.md` describes behaviour `SIMPLE_PLAN.md` superseded.
- **Privacy test** checks direct imports of five files; `sketchText.js` and `models/Note.js` are outside it. Walk the import graph.
- **Harness:** stale `bujogeek/` folder and September screenshots in `out/ci`; TodoGeek has no scenes for login, empty states, the phone date sheet, or repeats.
