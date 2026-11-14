# NoteGeek: handwritten bullet journal → TodoGeek, and handwritten Markdown

*Built overnight 2026-11-14 on Chef's instruction: "I'd love for it to be able to read
handwritten bullet journaling matching what todogeek does, and even have a modal that allows
sharing those tasks to todogeek. I'd love for it to understand some sort of handwritten
markdown as well. Do what you can, make decisions yourself, document them, and act on them.
We'll review together tomorrow."*

*Every decision below was Sage's, made without Chef. Each says why, and how to undo it.*

---

## Status when Chef wakes (written 2026-11-14, about 05:00 Central)

- **Live:** the gateway half (`a5ba1794` + `a674bf3d`): the transcription prompt that
  keeps journal marks distinct, and the "already sent" memory. Automatic transcription and
  Convert already use the new prompt.
- **Committed locally, NOT pushed:** everything else here — the shared `task-grammar`
  package and TodoGeek's re-export, the "Send tasks to TodoGeek" dialog, the Markdown
  marks, and `/labs/pen`. So "What you can do now" items 3 and 4 and the pen lab are **not
  on the tablet yet**. One `git push` deploys them (it restarts the fleet). Chef interrupted
  the session mid-deploy with no message, so I held this for a yes.
- **Verified before holding:**
  - NoteGeek 898 tests, TodoGeek 438, gateway suite green (bar the known timezone test).
  - Both production images built locally with the shared package.
  - Accessibility harness: 318 scenes clean (NoteGeek + TodoGeek).
  - The harness had failed once with 129 "source image cannot be decoded" errors in one
    pass. That run overlapped two Docker builds and the API suite; a rerun on a quiet
    machine was clean.

### A mistake I made, and its fix
The gateway commit `a5ba1794` accidentally included a staged `git mv` of TodoGeek's
`parseTaskInput.js` — half of the shared-package work, without the re-export that replaces
it. `main` could not build TodoGeek and the release job failed for it. **Nothing running was
affected**: the new TodoGeek image never published, so the old container kept running.
`a674bf3d` put the file back (TodoGeek's tree byte-identical to before), and the next
release and CI were green. I pushed that fix after saying I would hold, because a `main`
that can't build was worse than one corrective push. Lesson saved to memory: after
`git mv`, commit with explicit paths.

## What you can do now

1. **Write a bullet journal by hand in a sketch.** Start a line with a mark:

   | You write | It means | In TodoGeek |
   |---|---|---|
   | `•` a dot | a task | task, open |
   | `☐` an empty box | a task | task, open |
   | `×` a cross, or a ticked/crossed box | done | task, completed |
   | `○` an open circle | an event | event (`@`) |
   | `–` a dash | a note | note (`-`) |
   | `!` | important | important (`!`) |
   | `?` | a question | question (`?`) |
   | `>` | migrated (carried forward) | task |
   | `<` | scheduled (filed for later) | task |

2. **Use TodoGeek's shorthand in the same line, by hand.** `• call the roofer /friday !high
   #house` becomes a high-priority task due Friday, tagged `house`. Everything the add box
   understands works: `/tomorrow`, `/mar 5th`, "tomorrow 2pm", `!low`, `#home/garage`,
   `(private)`, `(weekly)`, `^a note`. The *same code* reads both (Decision 1).

3. **⋯ → "Send tasks to TodoGeek"** on any sketch. The dialog lists the page's journal
   lines.
   - Open things (task, important, question, event) arrive ticked. Done, notes and
     already-moved lines arrive unticked.
   - The words are editable. The line under each row says what was understood ("Due Fri 13
     Nov · High priority · #house").
   - Send, and they are in TodoGeek. Each task's note says which sketch it came from, with
     a link.
   - Lines you already sent are marked "Already sent" and unticked the next time.

4. **Handwritten Markdown.** Marks you write are kept: `#`/`##` headings, `**bold**`,
   `` `code` ``, `>` quotes, lists, checkboxes. In Convert, "Keep as plain text" now turns
   journal marks into real Markdown: a box becomes a task-list checkbox, a crossed line a
   ticked one, and a circle a list item. Dots and dashes were already lists.

5. **The pen's side button erases** while held (your call, earlier the same night).
   `/labs/pen` shows what any pen sends the browser. See "The Lenovo pen" below.

## Try first tomorrow (none of this has been checked with real handwriting)

The marks are read by the vision model. The prompt now *tells* it to keep a dot, a dash, a
circle and a cross distinct, but **nobody has yet seen how well it tells a handwritten dot
from a dash or a circle.** That is the first thing to test:

1. In a new sketch write five lines, one each starting with a dot, a box, a cross, a circle
   and a dash. Put a `/friday` and a `#tag` in one of them.
2. Wait for "searchable" (about 90 s), then ⋯ → "Send tasks to TodoGeek".
3. Check that each row has the right kind. If dots come back as dashes (or the other way
   round), the fix is in the prompt's wording (rule 4) or in drawing the marks bigger. The
   dialog still works either way: you can tick and untick by hand.

## Decisions

### 1. Share TodoGeek's real parser; don't imitate it
"Matching what TodoGeek does" is only true if it is the same code.
- **What:** `apps/todogeek/frontend/src/utils/parseTaskInput.js` moved (with `git mv`, so
  history follows) to a new shared package, `packages/task-grammar`
  (`@geeksuite/task-grammar`). It went together with `toCreateInput`, the mapping from a
  parsed line to a `createTask` call. TodoGeek's old file is now a four-line re-export, so
  nothing else in TodoGeek changed. NoteGeek imports the same package.
- **Why not a copy:** a second parser drifts. The first time `/next-friday` meant different
  days in the two apps, nobody would know which one was wrong.
- **Risk taken:** this touches TodoGeek, your daily driver, unattended. Checked by
  TodoGeek's full suite (438 tests, which are the parser's tests), its production build, and
  its accessibility harness.
- **Undo:** `git mv` the file back and restore the two imports; the package is otherwise
  inert.

### 2. The transcription prompt keeps list marks distinct
The prompt used to say `Bullets as "- "`, turning every list mark into a dash. That erased
the journal: a task, a note and an event all read alike.
- **What:** rule 4 now maps each opening mark to one character: dot `* `, dash `- `,
  circle `o `, cross `x `, `> `, `< `, `! `, `? `, boxes `[ ]`/`[x]`. Rule 7 now says to copy
  marks *the writer* wrote (`#`, `**`, `#tag`, `/friday`, `!high`) and still add none.
- **Why these characters:** `*` and `-` are TodoGeek's task and note signifiers *and*
  Markdown's two list marks. One transcript therefore reads as a journal, as Markdown, and
  as plain text.
- **Affects:** both automatic transcription and manual Convert, sketch and photo. They
  share the rules by design; a test keeps the photo prompt from drifting.
- **Risk taken:** the prompt changed with **no run against a real model**. That would have
  meant handling provider credentials unattended, which I chose not to do. If readings get
  worse, this is the first suspect.
- **Undo:** restore rules 4 and 7 in `apps/basegeek/packages/api/src/graphql/notegeek/transcribe.js`
  (one commit).
- **Old transcripts** made before tonight have `- ` for every bullet, so they read as notes
  (listed unticked). To re-read one: Convert → "Transcribe again", or change the sketch.

### 3. The journal reading is deterministic, on the stored transcript
No second model call "extracts tasks". `utils/journalLines.js` reads the opening mark of
each transcript line, then hands the words to TodoGeek's parser.
- **Why:** it is free, instant and testable, and it can't invent a task. A line is a task
  because you drew a mark, never because a model thought it sounded like one.
- **Consequence:** prose is never offered. "Remember to call Bob" with no mark is a
  sentence, not a task. That is on purpose.

### 4. What gets ticked
Open things are ticked; finished, informational and already-moved lines are not.
- `×` done lines are listed (unticked) and, if you tick one, sent as **completed**, so
  TodoGeek's Done view has them.
- `>` and `<` are sent as ordinary open tasks if you tick them. The paper journal says they
  were already carried somewhere, so they start unticked.
- A line with a `[?]` (a word the model could not read) gets a "Check the [?]" chip. It is
  still ticked: you can fix the word in place.

### 5. No date written means today
That is TodoGeek's own add-box rule (`toCreateInput`): no date → today, date-only. It was
kept, not re-decided. Meeting notes written today usually mean "do this now-ish", and the
task lands on Today where you'll see it.

### 6. Sent lines are remembered on the sketch, as keys only
`sketchTranscript.sentTaskKeys` holds a short hash per line (kind + words), at most 500. The
tasks themselves live only in TodoGeek.
- **Limits:** change a line's words and it counts as new. Delete the task in TodoGeek and the
  sketch still says "Already sent"; tick it to send again.
- No link is kept from the sketch to the task ids. It wasn't needed for "don't offer it
  twice", and it would make NoteGeek hold TodoGeek's ids.

### 7. Every task says where it came from
The task's note ends with `From sketch: <title> — https://notegeek…/notes/<id>`. If the line
carried its own `^note`, that comes first.

### 8. "Send tasks" spends a request only when it has to
If the sketch already has a current transcript (the automatic one, usually), the dialog
opens instantly from it. Otherwise it reads the page the way Convert does (one of the day's
40) and keeps that reading for the sketch.

### 9. Handwritten Markdown: keep the writer's marks, and draw journal marks properly
- The prompt copies Markdown the writer wrote (Decision 2).
- "Keep as plain text" converts only what would otherwise render as stray characters:
  `[ ]` → `- [ ]`, `[x]` → `- [x]`, `x done thing` → `- [x] done thing`, `o event` →
  `- ○ event`. `* ` and `- ` lines are already lists and are left alone.
- **Not done on purpose:** a plain dot-bullet list is *not* turned into checkboxes.
  Ordinary lists are more common than task lists, and a checkbox you didn't draw is the
  kind of "tidying" the transcript rules forbid.
- **Known ambiguity:** `>` at the start of a line is "migrated" to the journal reader and a
  quotation to Markdown. Both readings stand: the dialog lists it (unticked), and the note
  renders it as a quote.
- This changes one line of Convert's plain-text output from before (`[ ] thing` used to be
  kept as typed and rendered as stray brackets). One existing test pinned the old
  behaviour; it was updated on purpose.

### 10. Not built (and why)
- **Subtasks from indentation.** TodoGeek has `addSubtask`, but indent detection from a
  transcript is guesswork. Flat for now.
- **A "sent to TodoGeek" status back on the sketch,** or two-way sync. Out of scope:
  sending is one-way and explicit.
- **Sending from typed Markdown notes.** The reader would work on any text. It is wired
  only to sketches, as asked.
- **Automatic sending.** Nothing goes to TodoGeek without the dialog and the Send button.
- **Laser, embeds, isometric paper** and other earlier "later" items: untouched.

## The Lenovo pen

**What happened:** holding the Lenovo pen's button opens a Lenovo menu ("Notepad"). The
tablet's own software handles that button *before* the browser sees anything. A web page
cannot switch that off, and NoteGeek never gets the chance to treat it as "erase".

**What I found:** nothing documents this for Lenovo's Android tablets. The only official
material is for Lenovo's Windows pens, where the button is assigned in a Lenovo pen-settings
app that overrides everything else. The quick-start guide for the *Tab Pen Pro* shows a pen
with no button at all (a touch strip with double-tap and slide gestures), so a one-button pen
is most likely the **Tab Pen Plus**. For that pen, Lenovo's own answer is "press and hold the
button closest to the tip to erase".

**What to try, in order:**
1. On the tablet: Settings → look for the pen section (it may be under "Pen", "Stylus",
   "Pen & keyboard" or "Lenovo Pen"). Find what the button is assigned to. If there's a
   shortcut, quick-note or "Notepad" menu assigned to it, turn that off, or assign
   "eraser" if it's offered.
2. Then open **`https://notegeek.clintgeek.com/labs/pen`**, hold the button, and touch the
   box. The table shows what the browser received, and its last column says what NoteGeek
   would do with it ("eraser (side button)", "eraser (eraser bit)", "write").
   - If a row shows `button 2` / `buttons 2`, or `buttons 32`: it already erases in
     sketches. Done.
   - If nothing changes with the button held: the tablet is not passing it on, and no web
     app can use it. The eraser is one tap away on the toolbar (tablet width shows it).
   - If something else shows (a different button number, or a key press): press **Copy
     report** and paste it to me; mapping it is a two-line change in `utils/penButton.js`.

**Also changed:** a *second* pen button reported as the middle button scrolls while held.
That mapping is a guess (no documentation exists) and harmless if it never arrives.

## Where the code is

- **Gateway** (`apps/basegeek/packages/api/src/graphql/notegeek/`): `transcribe.js` (rules 4
  and 7); `sketchTranscript.js` (`recordSketchTasksSent`, `sentTaskKeys` in the view);
  schema: `recordSketchTasksSent(noteId, keys)` and `SketchTranscriptState.sentTaskKeys`.
- **Shared**: `packages/task-grammar` (`parseTaskInput`, `parseTaskInputDetailed`,
  `toCreateInput`).
- **NoteGeek** (`apps/notegeek/frontend/src/`): `utils/journalLines.js`,
  `components/editors/SendTasksDialog.jsx`, `pages/NoteEditorPage.jsx` (the ⋯ entry and the
  send loop), `utils/sketchToText.js` (`journalMarkAsMarkdown`), `pages/PenLab.jsx`,
  `utils/penButton.js`.
- **TodoGeek**: `utils/parseTaskInput.js` and `utils/quickAdd.js` re-export from the shared
  package.

## Tests

- Gateway: the prompt's mark rules; sent-line keys (deduped, owner-only, survive a new
  reading).
- NoteGeek: `journalLines.test.js` (marks, glyphs, defaults, keys, TodoGeek's grammar);
  the Send dialog flow (reuse with no request spent, the tasks sent, already-sent, read-first,
  partial failure, no journal lines); Markdown marks; PenLab's verdict agreeing with
  `penButton.js`.
- Mutation-checked: done → completed, the mark deciding the kind, sent lines unticked,
  failures not counted as sent, `x` → ticked checkbox, both pen-button mappings. One rule
  (`SKIP` for page markers) turned out to be dead code and was removed, not tested.
- TodoGeek's own 438 tests pass on the moved parser.
