# Specification: GeekDay — the pen-first daily page

Status: **signed off by Chef in interview, 2026-11-20.** Not yet built.

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
