# Specification: GeekDay — the pen-first daily page

Status: **signed off by Chef in interview, 2026-11-20.** Built and deployed 2026-11-20 (see `DOCS/WORK_LOG_2026-11.md`).

Provenance: there is no ticket. The conversation of 2026-11-20 is the ticket.
Chef's ask: *"propose a very useful web app for a tablet"*, then *"i love the
daily page. lets move to the geeksuite directory and build it there as
geekday"*. Scope, storage, out-of-scope and invariants are Chef's selections.
Lines marked *(Sage's wording, confirmed)* were proposed by Sage and confirmed
by Chef the same day; section 5 records those decisions.

## 1. Intent

Chef uses a Lenovo pen tablet, held portrait, mainly for NoteGeek and TodoGeek.
Planning a day means switching between the two. GeekDay replaces a paper
planner: one portrait screen per day with that day's tasks and a handwriting
page side by side, and nothing else on screen.

It is a new GeekSuite app, `apps/geekday`, for one signed-in user's own day.

## 2. Requirements / Acceptance Criteria

Chef selected all four parts for the first version.

**Agenda strip**

1. The page for a day lists that user's TodoGeek tasks for that day, grouped as
   overdue, timed and untimed.
2. Tapping a task's checkbox completes it in TodoGeek; the task then shows as
   done in TodoGeek itself.
3. A task can be added by typing; it is parsed by the shared task grammar and
   created in TodoGeek. When the text names no date, the task is dated to the
   day on screen *(Sage's wording, confirmed)*.
4. A task can be moved to the next day from its row on the page.

**Ink page**

5. Each day has one handwriting canvas that takes pen input.
6. A day's ink is saved as a NoteGeek note, one note per day, and is there when
   the day is opened again on the same or another device.
7. A day's page is findable and openable in NoteGeek as an ordinary note,
   tagged `daily` and titled with the date *(Sage's wording, confirmed)*.
8. A failed save is shown on the page and retried; ink drawn before the failure
   is not lost while the page stays open.

**Circle to task**

9. The user can lasso handwritten ink on the page and turn it into a TodoGeek
   task. The ink is transcribed and the text parsed by the task grammar, so
   "call vet fri 2pm" becomes a task with that date and time.
10. The transcribed text and the parsed date and time are shown for
    confirmation or correction before the task is created; cancelling creates
    nothing *(confirmed)*.
11. If transcription fails, the page says so and creates no task.

**Day flip**

12. The user can move to the previous and next day by swipe and by an on-screen
    control, and can return to today in one action.
13. Unfinished tasks from earlier days appear in the overdue group on today's
    page with their dates unchanged; GeekDay never re-dates a task unless the
    user moves it *(confirmed)*. Ink stays on the day it was written.

**Docked mode**

14. After 2 minutes with no input the page changes to a dimmed view showing the
    clock, the next task and the weather *(confirmed)*.
15. The screen is kept awake while GeekDay is in the foreground, where the
    browser allows it.
16. Any touch or pen contact returns to the day page without acting on what was
    under it.

**Suite standards**

17. Sign-in is basegeek SSO only; a signed-out user is sent to sign in.
18. The app meets `DOCS/PWA_STANDARD.md` and passes `tools/pwa-audit.mjs`.
19. Mobile-harness scenes exist for the day page (with tasks, empty, load
    failed), the confirm-task step and docked mode, at tablet portrait, light
    and dark, and pass with `--enforce-a11y`.

## 3. Out of Scope

Chosen by Chef:

- Designed phone and desktop layouts. Other sizes must not break, but only the
  portrait tablet is designed for.
- Offline use. No offline outbox.
- Sharing and households. One user's own day only.
- Calendar events. Tasks only; no Google or CalDAV calendars.

## 4. Invariants That Must Not Break

Chosen by Chef:

- **No schema breaks.** Existing TodoGeek and NoteGeek GraphQL operations keep
  working unchanged. GeekDay may add to the gateway; it never alters or removes.
- **Tasks and notes stay canonical.** A task made in GeekDay is an ordinary
  TodoGeek task and a day page is an ordinary NoteGeek note, fully usable in
  those apps with no GeekDay-only field required.
- **Suite standards.** basegeek SSO only, ownership enforced in the service
  layer, the PWA standard and the design language followed, harness scenes with
  a11y enforced.

## 5. Decisions recorded 2026-11-20

| Question | Chef's answer |
|---|---|
| Earlier unfinished tasks | Show as overdue; never re-date automatically |
| Circle to task | Confirm first, then create |
| Day note identity | Tag `daily`, title is the date |
| Docked mode idle time | 2 minutes |
| Pen latency, transcription accuracy | No number in the spec; judged in a device session on the Lenovo |
| Hostname, port, basegeek app list | Build locally. Sage picks a free port, assumes `geekday.clintgeek.com`, makes the in-repo registrations and lists the box-side steps (nginx, DNS). No push. |

## 6. Additions, night of 2026-11-20: the week spread and page templates

Provenance: Chef, 2026-11-20, after using the deployed page: *"i like the week
spread. lets do that for sure. i also want to explore templates in both
notegeek and geekday. make some useful ones in both. im going to bed. you
finish up, decide things for me and push when done. ill test in the morning."*

Chef stated the two features and delegated the details. Every requirement
below is **Sage's decision under that instruction**, not Chef's wording, and
is open to correction after the morning test. Templates for both apps are
specified in `DOCS/TEMPLATES_SPEC.md`.

### Week spread

The idea Chef accepted, as proposed to him: *"Seven columns, each showing that
day's task count and a thumbnail of its ink page. Drag a task from one day to
another to reschedule it. Tap a day to open it."*

W1. A week page shows the seven days of one week, Monday to Sunday, each with
    its date, its open-task count, its tasks, and a small picture of that
    day's ink page when it has one.
W2. On the portrait tablet the days are laid out as a planner spread (two
    columns, four rows), not seven narrow columns: at 800 px a seventh of the
    width cannot hold a task's words. *(A change from the proposal's "seven
    columns", for legibility.)*
W3. The eighth cell lists tasks that are overdue or have no date, so they can
    be given a day.
W4. A task can be moved to another day by dragging it there, and also without
    dragging (from a menu on the task), with Undo. Moving follows the day
    page's rule: a timed task keeps its time, a date-only task stays date-only.
W5. A task can be ticked from the week page.
W6. Tapping a day's heading or its ink picture opens that day's page.
W7. The user can go to the previous and next week by button, swipe and arrow
    keys, and back to this week in one action. Today is marked.
W8. The week page is reached from the day page in one tap, and returns to it.
W9. A failed load is shown as an error with Retry, never as an empty week.
W10. Harness scenes at tablet portrait, light and dark, a11y enforced: the
    week with tasks, an empty week, a failed load, a move menu open.

Unchanged from sections 3 and 4: no gateway changes, no calendar events, no
offline, GeekDay never re-dates a task unless the user moves it.

### A page that scrolls

Provenance: Chef, 2026-11-20, a few minutes later: *"also maybe geekdays note
side should pan and scroll like notegeek does."* The first build's fixed sheet
was Sage's choice; this replaces it. Details are Sage's decisions.

S1. The ink page is taller than the screen and scrolls: a finger drag (when
    fingers do not draw), a two-finger drag and a mouse wheel move the page;
    the pen writes. Ink below the first screen is reachable on any device.
S2. Pinch zooms in on the page and a finger then pans it in both directions.
    Zoomed all the way out, the page is exactly as wide as its pane; it never
    shrinks below that or drifts sideways.
S3. A day opens at the top of its page, zoomed out.
S4. A sideways finger flick over the ink page still turns the day when the
    page is zoomed out and fingers do not draw; when zoomed in it pans.
S5. Strokes stay in page units: the same day looks the same on another screen
    and in NoteGeek.
