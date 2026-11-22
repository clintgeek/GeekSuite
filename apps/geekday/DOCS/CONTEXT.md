# GeekDay — context

The pen-first daily page: one day's TodoGeek tasks beside a handwriting page
stored in NoteGeek. What it must do is `DOCS/GEEKDAY_SPEC.md` (signed off
2026-11-20); this file is how it does it.

**Status (2026-11-21): deployed** at `geekday.clintgeek.com` (port 1840, Vite dev
port 1841). The week spread, the scrolling page and page templates were added
the night of 2026-11-20 (spec §6, `DOCS/TEMPLATES_SPEC.md`). Templates were
reworked on 2026-11-21 (paper and template are now separate; see "Paper and
templates" below); that rework is not deployed. Nothing has been run on the
Lenovo.

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
| `pages/DayPage.jsx` | The page: routes `/` (today, follows midnight) and `/day/<yyyy-MM-dd>`; day flip by buttons, arrow keys, `t`, and a finger swipe; `w` opens the week |
| `pages/WeekPage.jsx`, `components/week/`, `hooks/useWeek*.js`, `lib/week.js` | The week spread: `/week` and `/week/<yyyy-MM-dd>`, Monday to Sunday plus "Not scheduled" |
| `components/Agenda.jsx` | Overdue / Scheduled / To do / Done, tick, move to next day, the add box |
| `components/InkPane.jsx` | Hosts the canvas; shows saving, saved, not saved, conflict |
| `components/ConfirmTaskDialog.jsx` | Circle to task: read, correct, create |
| `components/DockedView.jsx` | The idle clock face |
| `ink/` | The canvas: tldraw 2.4.6, trimmed from NoteGeek's sketch editor, plus the lasso, the scrolling page (`pageCamera.js`, `pageGestures.js`), and the paper and templates (`pageTemplate.js`, `PagePaper.jsx`, `paperLook.js`, `PageMenu.jsx`) |
| `store/dayNoteStore.js` | Finding, creating and saving a day's note; retries; conflicts |
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

**The page scrolls.** It is 1000 page units wide and at least three sheets
tall, growing so there is always a sheet below the lowest ink. Zoomed out it
is exactly as wide as its pane; pinch zooms in to 3x. tldraw's own camera
stays locked: wheel, one-finger pan, two-finger pan and pinch are GeekDay's
(`ink/pageGestures.js`), because tldraw's pen mode ignores a single finger and
an unlocked camera lets a palm beside the pen register as a pinch. A touch
that lands while the pen is down, or within 300 ms of a pen event, never moves
the page.

**Paper and templates** are two separate things (Chef, 2026-11-21), both
chosen from the Page menu on the ink toolbar.

- *Paper* is the background: Ruled, Dot grid or Grid, all the way down the
  page in GeekDay's own paper colour (`PagePaper.jsx`, tldraw's `Background`).
  Its id is stored in the sketch's tldraw document meta as `paperTemplate`
  (`'none' | 'dots' | 'grid'`), beside NoteGeek's `paperColor` /
  `paperPattern`. It is never a shape. Chosen on a blank day it saves nothing
  and rides with the first ink.
- A *template* (Schedule, Top three, Meeting, Cornell) is printed into the
  drawing: ONE locked tldraw `image` shape, id `shape:paper-template`, a white
  1000 x 1400 sheet with an inline SVG asset (`asset:paper-template-<id>`) and
  `meta.paperTemplate = <id>`. It is made and removed only by
  `placePaperSheet` / `removePaperSheet` from `@geeksuite/ui`
  (`packages/ui/src/paper/sheet.js`), the contract shared with NoteGeek. The
  menu places it at page (0, 0), or where the sheet it replaces was; "No
  template" removes it. Each is one undo step and saves like ink. Paper
  settings never touch it, and the paper shows around and below it. A sheet
  NoteGeek put elsewhere is drawn where it is.
- The sheet is not ink. `pageContent()` in `InkCanvas.jsx` is the one place
  that says what counts: `hasShapes`, the first-ink rule, the lasso (never
  circled, tapped, or in the crop sent to `transcribeSketch`) and the week
  thumbnails all leave it out. It does count for the page's height. tldraw's
  eraser skips it because it is locked.
- A template placed from the menu on a blank day IS saved (the note is
  created with only the sheet in it): placing one is a choice.
- "Use for new days" stores the paper and the template on screen together,
  per device: `geekday:pageTemplate` (paper) and `geekday:pageSheet`
  (template). On a day that has no ink, no sheet and no note, the device's
  template is shown as a preview (an `<img>` in `PagePaper.jsx`, not a shape)
  and nothing is saved; the first ink places the real sheet in the same undo
  step as the stroke. "No template" on such a day only puts the preview away
  for that visit. A day that has a note is never changed by the default.
- A page with a sheet (placed or previewed) is a light page in the dark
  theme: tldraw's light colour scheme and the diary's light paper for the
  whole page, because the sheet is always white and tldraw's dark scheme
  draws ink near-white. The sheet is never tinted.
- Pages from the build of 2026-11-20 whose meta says `paperTemplate:
  'schedule' | 'top3' | 'meeting' | 'cornell'` (and any unknown id) draw as
  Ruled with no template; the key is left as stored. A layout left in
  `geekday:pageTemplate` by that build is read as the device's template
  default.
- tldraw keeps assets out of undo history, so a sheet's asset is never
  deleted: a note may carry the asset of a template it no longer shows. After
  a change of template the new picture appears about half a second later
  (tldraw's own asset delay). tldraw's `<img>` has no alt; `InkCanvas.jsx`
  sets `alt=""` on the sheet's image.

**The week spread** reads `weeklyTasks` (Monday to Sunday) for the seven cells
and `dailyTasks(today)` for "Not scheduled"; in a week with a clock change it
reads once per UTC offset. `monthlyTasks` is not a date range (it ignores its
end date). Each cell is grouped by the day page's own `groupDayTasks`. Ink
pictures are drawn as SVG from the note's stroke points, without tldraw.

## Known limits

- Two devices that both put first ink on the same new day at the same moment
  each create a page (`createNote` has no idempotency key). The older note is
  the day's page from then on; the other stays in NoteGeek.
- A day page is searchable by its words only after NoteGeek has transcribed
  it, which happens when the note is open in NoteGeek. It is always findable
  by tag and title.
- No keyboard scrolling of the ink page; trackpad pinch does not zoom in desktop Safari (Ctrl + wheel does).
- Tasks cannot be added from the week page. Its ink pictures come from the saved note, one fetch per day.
- Phone and desktop are not designed for (spec §3). Below 600 px the agenda
  stacks above the ink.
- Not verified on a device: pen latency, palm rejection (now also while
  scrolling), the Lenovo pen button, real handwriting through the
  transcriber, the wake lock, dragging a task with a pen or finger.

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

Deployed 2026-11-20. A push to `main` builds `ghcr.io/clintgeek/geekday` and
Watchtower replaces the container (`DOCS/CICD.md`). `apps/geekday/.env.production`
on the box holds no secrets. The nginx vhost is
`/mnt/Media/Docker/nginx/config/sites-available/clintgeek.com_geekDay.conf`.

Do not name a source folder `data/`: the repo's `.gitignore` ignores it, the
files never reach the image, and the build fails on the import (it happened
on the first deploy; the store is `src/store/` for that reason).

## Background reader (2026-11-22)

A day's page is a NoteGeek sketch, and it used to be read (made searchable) only when opened in
NoteGeek. `components/BackgroundReader.jsx`, mounted in `App` once signed in, asks the gateway
which sketches are waiting (`sketchesToTranscribe`: unread and unchanged for 90 s), draws each
one off-screen in a read-only `InkCanvas` (`autoFocus={false}`, inside an `inert` box) and sends
it with `autoTranscribeSketch(background: true)`. `InkCanvas`'s API gained `isReady()` and
`exportPage()` (the writing without the template sheet). The schedule is shared with NoteGeek:
`@geeksuite/api-client` `backgroundReader.js`. Full account:
`apps/notegeek/DOCS/AUTO_TRANSCRIBE_SPEC.md`, "Background reader". Harness: `40-background-read`.

Templates lock on the first mark (2026-11-22, `DOCS/TEMPLATES_SPEC.md` T4): `setSheet` does
nothing once the page has ink, and `PageMenu` takes `sheetLocked`. `exportPage()` sends the sheet
with the writing (T6); the lasso still sends the circled ink alone.
