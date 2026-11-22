# Specification: templates in NoteGeek and GeekDay

Status: **page templates revised 2026-11-21 on Chef's test and confirmed by him
(section 2a). Note templates (N1–N5) are still Sage's decisions, unconfirmed.**

Provenance: there is no ticket. Chef, 2026-11-20: *"i also want to explore
templates in both notegeek and geekday. make some useful ones in both. ...
decide things for me and push when done."* Chef stated the goal (useful
templates in both apps); the first build's details were Sage's reading of it.

Chef, 2026-11-21, after testing that build: *"we broke how notegeek draws grids
and lines. honestly i think were doing templates wrong. the template should be
separate than the paper type, maybe forcing plain paper. the template should
then bevome a permnant part of the page with a forced with paper under. also,
i miss my green grid."* He then chose, from options Sage put to him:

| Question | Chef's answer |
|---|---|
| How permanent? | Printed into the drawing: a white sheet placed in the sketch as a locked object. In thumbnails, print and exports; cannot be erased or moved; paper changes never touch it. Its printed words kept out of handwriting transcription. |
| When chosen, and removable? | Any time, removable: add one from the Paper menu; it has its own way off, with Undo. Paper colour and lines never change it. |
| The paper around it? | Keep my paper: the white sheet sits on the paper, which carries on around and below it. Dot grid and Grid leave the template list; they are paper. |

Section 2a replaces P1–P7 of the first build. Where it says more than the
table above, that is Sage's wording and is marked.

## 1. Intent

A blank page is slow to start. A template gives a page its structure: a
schedule down the side, a place for the three things that matter today, a
meeting sheet with a column for actions, a note that already has the headings.
Two kinds, because the two apps hold two kinds of page:

- **Page templates** for handwriting: a printed sheet under the ink, for a
  GeekDay day page and a NoteGeek sketch. One set, shared, so a day page looks
  the same in both apps.
- **Note templates** for typed notes in NoteGeek: a new note that starts with
  a title, tags and headings.

## 2. Requirements

**2a. Page templates (GeekDay and NoteGeek sketches), as revised 2026-11-21**

T1. A template is a white sheet printed into the drawing itself: one object
    in the sketch, with the layout printed on it. Templates: Schedule, Top
    three, Meeting, Cornell.
T2. The sheet is white with dark print in every theme and on every paper.
T3. It is permanent while it is there: it cannot be erased, selected, moved
    or unlocked by any drawing tool, and "clear" leaves it.
T4. *(Revised 2026-11-22, Chef: "We'll lock the template on the first mark
    on the page, then we can safely process all of the writing and
    context.")* On a page with no writing it can be added, swapped for
    another, and taken off, from where the paper is chosen; each is one Undo
    step. The first mark fixes it: on a page with writing the template
    choices are disabled (the one it has stays shown), and a page with
    writing and no template cannot be given one. Undoing back to a blank
    page unlocks it. Paper is never locked.
T5. Paper and template are separate. Choosing paper colour or lines never
    changes a template; placing or removing a template never changes the
    paper. The paper is drawn around and below the sheet. Dot grid and Grid
    are paper, not templates. A sketch with no template draws its paper
    exactly as before the first templates build (Chef's green grid).
T6. Being part of the drawing, the sheet is in thumbnails, print and shared
    images, and opens the same in the other app and on another device. A
    sheet alone does not count as ink and is never sent to be read.
    *(Revised 2026-11-22, same quote as T4: "capture the writing on template
    pages".)* When the whole page is read (automatic transcription, the
    background reader, Convert, Send tasks) the sheet goes WITH the writing,
    and the reading names the section of the form each piece was written
    in: a line of its own, "§ " and the printed heading ("§ ACTIONS").
    Those lines are the form's words, not the writer's: they are kept in
    the transcript and left out of search. Circle-to-task still reads the
    circled ink alone.
T7. *(Sage's wording.)* A new sheet goes at the page's top-left on a blank
    sketch, and on a sketch with ink where the writer is looking. A sketch
    with a sheet and no remembered view opens on the sheet. GeekDay always
    places it at the top of the day page.
T8. *(Sage's decision.)* A sketch that has a sheet is shown in the light ink
    scheme even in dark mode, so dark ink stays dark on the white sheet. In
    GeekDay the whole day page is light while it has a sheet.
T9. *(Sage's decision.)* GeekDay keeps one "Use for new days" default for its
    paper and template. A blank day shows the default template as a preview
    and saves nothing; the first ink prints the sheet for real.
T10. *(Sage's decision, a loss.)* The first build stored a template as an id
    beside the paper settings. Sketches saved that way (2026-11-20/21 only)
    are not converted: they open with their paper and no template, and the
    stored document is not rewritten. Re-add the template from the menu.

Superseded: P1–P7 of the first build (a template as a background that
replaced the lines, in the paper's colours, never in an export).

**Note templates (NoteGeek)**

N1. Starting a new note offers "From a template" with these: Meeting notes,
    One-to-one, Weekly review, Project brief, Decision record,
    Troubleshooting log, Packing list, Recipe.
N2. Choosing one opens the ordinary editor on a new note with that template's
    title, tags and body filled in. It is an ordinary note from then on.
N3. Nothing is saved until the user edits or saves, as with any new note
    today: opening a template and leaving creates no note.
N4. Dates in a template's title or body are the local day it was opened.
N5. Templates are also reachable from the keyboard on desktop and pass the
    harness at phone, tablet and desktop.

## 3. Out of Scope

- Templates the user writes or edits themselves, and sharing templates.
- Templates for mind maps and code notes.
- Any behaviour attached to a template's regions (for example, treating ink
  in the Meeting actions column as tasks).
- Gateway or schema changes. Templates are client-side.

## 4. Invariants That Must Not Break

- Existing notes and sketches open exactly as before. No stored document is
  rewritten to add a template (it is added only when the user places one).
- NoteGeek's paper colour and ruling, per sketch and per device, keep working.
- A GeekDay day page stays an ordinary NoteGeek sketch (GEEKDAY_SPEC §4).
- NoteGeek's save, draft, conflict and autosave behaviour is untouched.
- No gateway operation is added, changed or removed.
