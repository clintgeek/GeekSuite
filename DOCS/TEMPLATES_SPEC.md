# Specification: templates in NoteGeek and GeekDay

Status: **Sage's decisions under Chef's delegation, 2026-11-20. Not yet
confirmed by Chef.** Built the same night; open to correction after his test.

Provenance: there is no ticket. Chef, 2026-11-20: *"i also want to explore
templates in both notegeek and geekday. make some useful ones in both. ...
decide things for me and push when done."* Chef stated the goal (useful
templates in both apps). Everything below is Sage's reading of it.

## 1. Intent

A blank page is slow to start. A template gives a page its structure: a
schedule down the side, a place for the three things that matter today, a
meeting sheet with a column for actions, a note that already has the headings.
Two kinds, because the two apps hold two kinds of page:

- **Page templates** for handwriting: a printed layout behind the ink, for a
  GeekDay day page and a NoteGeek sketch. One set, shared, so a day page looks
  the same in both apps.
- **Note templates** for typed notes in NoteGeek: a new note that starts with
  a title, tags and headings.

## 2. Requirements

**Page templates (GeekDay and NoteGeek sketches)**

P1. These page templates exist: Schedule (the day's hours down the left),
    Top three (three priorities, then notes), Meeting (attendees, agenda,
    notes, and an actions column), Cornell (cue column, notes, summary),
    Dot grid, Grid. "Ruled" (GeekDay) and NoteGeek's existing papers remain.
P2. A template is a printed background only. It is never part of the ink: it
    cannot be erased, selected or lassoed, and it is not in a circle-to-task
    crop or a transcription image.
P3. The choice is stored with the page (in the sketch's own document data,
    beside NoteGeek's existing paper colour and ruling), so the same page
    shows the same template in GeekDay, in NoteGeek, and on another device.
P4. GeekDay: the template for the day on screen can be chosen from the ink
    toolbar, and one tap makes it the default for new days on this device.
P5. NoteGeek: a sketch's template is chosen where its paper is chosen today.
    A sketch with no template looks exactly as it does now.
P6. A template is readable in light and dark and passes the harness's a11y
    and text-size rules; its printed words are not announced as page content
    more than once.
P7. A page whose template id is unknown (a newer or removed template) opens
    as a plain page; nothing is lost and the id is left as it was.

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
  rewritten to add a template.
- NoteGeek's paper colour and ruling, per sketch and per device, keep working.
- A GeekDay day page stays an ordinary NoteGeek sketch (GEEKDAY_SPEC §4).
- NoteGeek's save, draft, conflict and autosave behaviour is untouched.
- No gateway operation is added, changed or removed.
