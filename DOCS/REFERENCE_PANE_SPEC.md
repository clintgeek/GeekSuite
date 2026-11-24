# Reference pane in NoteGeek — spec

**Status:** signed off 2026-11-24, not yet built. Chef accepted the shape ("I think that is
exactly right") and every answer in §6 ("I like all of your ideas there").

## 1. Intent

Chef (2026-11-24): "how to switch back and forth between notes during a meeting. Here's an
example: I was in a 1:1 with Kin and needed to reference a 1:1 between me and my boss while
on the call with Kin. ... it was a bit awkward jumping around during a meeting."

And: "I only needed to read the boss note, it had info that I needed to follow up on with
Kin. Portrait to maximize writing space."

Looking something up should not mean leaving the page being written on. A second note opens
read-only above the current one, and the current note stays live under the pen.

## 2. Requirements

Proposed by Sage, accepted by Chef in conversation ("I think that is exactly right"), unless
marked *stated*.

1. **A second note beside the one being written.** From an open note, a "Reference" button
   opens another note in a pane on the same screen. The note being written stays open,
   unsaved work and scroll position untouched.
2. **Top and bottom.** The reference pane is on top; the note being written is below it.
   The writing page keeps the full width of the screen. *(Stated: portrait, "to maximize
   writing space".)*
3. **One divider to drag.** A handle between the two panes sets how much of the screen the
   reference takes. It snaps to a third and to half. Dragged all the way up, the pane closes.
4. **Read-only.** *(Stated: "I only needed to read".)* Nothing in the reference pane can be
   changed: the pen does not draw on it, text cannot be edited, nothing is saved from it.
   Pen and finger scroll it.
5. **Picking the note.** The Reference button opens a picker: the most recently opened notes
   first, and a search box over all notes. Picking one shows it in the pane.
6. **Closing.** One tap on a close button, or dragging the divider to the top. The writing
   page is then full height again, where it was.
7. **Both kinds of note can be referenced.** A handwritten note shows its handwriting; a
   typed note shows its text.

## 3. Out of scope (first version)

- A side-by-side layout. Landscape gets the same top-and-bottom split.
- A free-floating or draggable window.
- Remembering the pane. It closes when the note is left and does not reopen next time.
- More than one reference note. Picking another replaces the one showing.
- Writing in, annotating or copying from the reference note.
- The swap button and recent-notes strip discussed as cheaper alternatives.

## 4. Invariants

- The reference note is never modified, re-saved, re-read by the handwriting reader, or
  marked as recently edited because it was shown.
- With the pane closed, an open note looks and behaves exactly as it does today.
- Opening or closing the pane never loses ink or text on the note being written, and never
  interrupts its autosave.
- Showing a reference note costs nothing: no handwriting read, no paid call.

## 5. Known tradeoff

While the pane is open the writing area is a half to two-thirds of the screen. The page
scrolls as it does now; less of it shows at once.

## 6. Decisions (2026-11-24)

Proposed by Sage, accepted by Chef: "I like all of your ideas there."

8. **Handwriting or transcript.** A handwritten reference shows its handwriting first, with
   a switch to its typed transcript when it has one.
9. **Zoom.** The reference opens fit-to-width; two fingers zoom it.
10. **A head start in a 1:1.** In a 1:1 note the picker lists that person's previous 1:1s
    first, then the recents.
11. **Where.** Tablet and desktop. Not the phone.
12. **Which notes can host it.** Any open note, handwritten or typed.
13. **"Open this note."** A small button in the pane leaves the current note and opens the
    reference note in full.
