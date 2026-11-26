# Specification: templates in NoteGeek and GeekDay

Status: **page templates revised 2026-11-21 on Chef's test and confirmed by him
(section 2a). Note templates (N1–N5) were removed from NoteGeek on 2026-11-24 (N6); only page templates remain.**

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
  GeekDay day page and a NoteGeek handwritten note. One set, shared, so a day page looks
  the same in both apps.
- **Note templates** for typed notes in NoteGeek: a new note that starts with
  a title, tags and headings. *Removed 2026-11-24 (N6); kept below as the record.*

## 2. Requirements

**2a. Page templates (GeekDay and NoteGeek sketches), as revised 2026-11-21**

T1. A template is a white sheet printed into the drawing itself: one object
    in the sketch, with the layout printed on it. Templates: Schedule, Top
    three, Meeting, Cornell.
T1a. *(2026-11-23, Chef: "I love the templates for the written notes but
    they could be bigger/longer even if they need to scroll.")* Meeting, 1:1
    and Top three are two sheets long (1000 x 2800), and the head of Meeting
    and 1:1 has more lines (five and seven). *(Sage's choice:)* Schedule and
    Cornell stay one sheet: a day's hours and a page with a summary at its
    foot are whole forms. A sheet placed before this keeps its size.
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
N1a. *(2026-11-23, Chef: "The Meeting notes should be handwritten. I'm not
    going to be typing during a meeting.")* Meeting notes opens a handwritten
    page on the Meeting sheet, titled "<yyyy-MM-dd> Meeting" and tagged
    `meeting`; like a 1:1, nothing is saved until the first ink. The desktop
    sidebar and the Tags sheet carry "New 1:1" and "New meeting" straight
    under All notes (Chef: "two templates that I'll use constantly").
N6. *(2026-11-24, Chef: "don't need any typed templates"; Recipe and Packing
    list named as "actively not using and would remove".)* **The typed note
    templates are removed.** N1, N2, N3, N4 and N5 no longer apply: there is
    no "From a template", and `/notes/new?template=<id>` is a plain new note.
    Notes already made from a template are ordinary notes and are untouched.
    The New surfaces offer the two handwritten pages directly: 1:1 (the
    person picker) and Meeting notes (N1a). The tablet rail carries both too.
    Chef may want student sheets later; those would be handwritten sheets
    (T-requirements), not typed templates.

## 3. Out of Scope

- Templates the user writes or edits themselves, and sharing templates.
- Templates for mind maps and code notes. (Both note types were removed from the NoteGeek client on 2026-11-25.)
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
