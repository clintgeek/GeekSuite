# GeekDay — context

The pen-first daily page: one day's TodoGeek tasks beside a handwriting page
stored in NoteGeek. What it must do is `DOCS/GEEKDAY_SPEC.md` (signed off
2026-11-20); this file is how it does it.

**Status (2026-11-20): built locally, not deployed.** Port 1840, Vite dev port
1841, hostname `geekday.clintgeek.com`. Nothing has been run on the Lenovo.

## Shape

| Part | Where | What |
|---|---|---|
| Frontend | `frontend/` | Vite + React 18 + MUI 5, a pure consumer of the gateway |
| Backend | `backend/` | Express: serves the built page, proxies sign-in to basegeek, `/api/health`. No database |
| Gateway | none of its own | Uses TodoGeek's and NoteGeek's existing operations. Nothing was added or changed (spec §4) |

Every operation it sends is in `frontend/src/graphql/documents.js`.

## Where things live (`frontend/src`)

| Path | Job |
|---|---|
| `pages/DayPage.jsx` | The page: routes `/` (today, follows midnight) and `/day/<yyyy-MM-dd>`; day flip by buttons, arrow keys, `t`, and a finger swipe |
| `components/Agenda.jsx` | Overdue / Scheduled / To do / Done, tick, move to next day, the add box |
| `components/InkPane.jsx` | Hosts the canvas; shows saving, saved, not saved, conflict |
| `components/ConfirmTaskDialog.jsx` | Circle to task: read, correct, create |
| `components/DockedView.jsx` | The idle clock face |
| `ink/` | The canvas: tldraw 2.4.6, trimmed from NoteGeek's sketch editor, plus the lasso |
| `data/dayNoteStore.js` | Finding, creating and saving a day's note; retries; conflicts |
| `hooks/useDayTasks.js` | A day's tasks with optimistic tick / move / add |
| `lib/tasks.js`, `lib/days.js`, `lib/capture.js` | Pure rules: grouping, day keys, text → task |
| `theme/theme.js` | "Desk Diary" |

## Rules worth knowing before changing anything

**The day page is an ordinary NoteGeek sketch.** `type: "handwritten"`, tagged
`daily` and `daily/<yyyy-MM-dd>`, titled `<yyyy-MM-dd> <Weekday>`. It is found
by the exact day tag (the gateway has no "note for a date"). Its content is
tldraw's store snapshot, the same as NoteGeek writes, so keep GeekDay on the
tldraw version NoteGeek uses. Nothing GeekDay-only is stored on the note.

**The note is created on the first ink**, not when a day is opened, so
flipping through days leaves no empty notes.

**Saving** (`dayNoteStore.js`): one write in flight, newest ink wins the queue,
every update carries `baseUpdatedAt`. A failed save keeps the ink and retries
(3 s, 10 s, 30 s, then every 60 s, and when the network returns), and keeps
retrying after you flip to another day. A `CONFLICT` writes nothing and asks:
keep this version, or use the other.

**Tasks** come from `dailyTasks(date, tzOffsetMinutes)`, one flat list, grouped
in the browser (`lib/tasks.js`) by the same rules as TodoGeek's Today. Overdue
and undated tasks appear on today's page only. GeekDay never re-dates a task
unless the user presses the move arrow (spec req 13).

**Text → task** (`lib/capture.js`) is `@geeksuite/task-grammar`, read against
the day on screen. GeekDay adds one thing: weekday abbreviations ("fri"),
which the shared grammar does not know. "sat", "sun" and "wed" count as days
only beside a time or after on / by / due / next / this.

**Circle to task** sends the lassoed strokes as a PNG to `transcribeSketch`
**without a `noteId`**. With one, the gateway would store the crop's reading
as the whole page's transcript. It shares NoteGeek's limit of 40 readings per
user per UTC day.

**Docked mode**: 2 minutes without input (`DOCK_AFTER_MS`). The clock face is a
layer above the page and wakes on release, so the waking touch never reaches
what is under it. Weather is read straight from the browser (Open-Meteo, with
ipapi.co for location and Arkadelphia as the fallback), as StartGeek does.

## Known limits

- Two devices that both put first ink on the same new day at the same moment
  each create a page (`createNote` has no idempotency key). The older note is
  the day's page from then on; the other stays in NoteGeek.
- A day page is searchable by its words only after NoteGeek has transcribed
  it, which happens when the note is open in NoteGeek. It is always findable
  by tag and title.
- The page is one fixed sheet: no scrolling, panning or zoom.
- Phone and desktop are not designed for (spec §3). Below 600 px the agenda
  stacks above the ink.
- Not verified on a device: pen latency, palm rejection, the Lenovo pen
  button, real handwriting through the transcriber, the wake lock.

## Run and test

```bash
cd apps/geekday/frontend && npx vitest run        # unit and component tests
cd apps/geekday/backend && npm test               # backend
cd apps/geekday/frontend && npm run build && cd ../../.. && node tools/pwa-audit.mjs --app geekday
# The page, at the tablet size it is designed for, a11y enforced:
node tools/mobile-harness/ci.mjs --app geekday --tablet-only --tablet-viewports tablet-dark,tablet-light --enforce-a11y
```

Local dev (`npm run dev` in `frontend/`, port 1841) needs a gateway to talk
to; see `DOCS/RUNBOOK.md` §7. The harness needs none: every request is stubbed
(`tools/mobile-harness/apps/geekday/`).

## Deploying

Not done. In order:

1. Push to `main`. CI builds `ghcr.io/clintgeek/geekday` and redeploys
   basegeek, which carries the `geekday` entries in `VALID_APPS`, the CORS
   list and the app registry.
2. On the box: create `apps/geekday/.env.production` from `.env.example`, make
   the GHCR package public, then `docker compose up -d` in `apps/geekday`
   (Watchtower updates containers; it does not create them).
3. Reload nginx. The vhost is already written and passes `nginx -t`:
   `/mnt/Media/Docker/nginx/config/sites-available/clintgeek.com_geekDay.conf`.
   Until it is reloaded the hostname is not served.
