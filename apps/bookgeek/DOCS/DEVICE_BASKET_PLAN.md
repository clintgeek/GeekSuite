# BookGeek — Device Download Basket: Implementation Plan

> **Status: SHIPPED 2026-08-30** (including the D9 secret-word landing page
> and D10 sliding inactivity expiry). Kindle-verified end to end. This doc
> is retained as the design record.

Goal: vendor-independent book delivery to e-readers. BookGeek creates a temporary,
word-slug URL (`bookgeek.clintgeek.com/download-basket/soft-apple-chair-lamp`) that
serves a primitive server-rendered HTML page with direct download links. No JS, no
CSS dependency, no auth beyond the slug itself. First target: an old Kindle browser.
Basket expires after 30 minutes, enforced at request time.

Full product spec lives in the conversation that produced this plan; this document
captures **what to build, in what order, the architecture decisions, and which model
(Opus vs Sonnet) should execute each piece**.

---

## Codebase facts (verified 2026-08-29)

- Backend: Express 4, single large `apps/bookgeek/api/src/server.js` (~3,000 lines).
  Routes registered directly on `app`; auth via `authenticateToken` middleware from
  `@geeksuite/user/server` — public routes simply omit it.
- **Server-rendered Kindle HTML already exists**: `kindleLayout()` (server.js ~line
  219) and `/kindle`, `/kindle/books/:id`, `/kindle/books/:id/send` routes with
  PIN-cookie auth. Kindle Tests 1–2 (connectivity + rendering) may already be
  proven — verify before rebuilding.
- On-demand conversion exists: `convertEbookFile()` (server.js ~lines 105–161) wraps
  Calibre `ebook-convert`, embeds covers via `--cover`, supports EPUB / AZW3 / MOBI
  (old+new). Triggered by `GET /api/books/:id/download/:format` (~line 1165), caches
  artifacts alongside the source file and records them in `Book.files[]`.
- **`GET /api/books/:id/download/:format` is currently public (no auth).** See
  Decision D4 — do not build the basket on top of this; fix it instead.
- DB: MongoDB via Mongoose (basegeek instance). Models in
  `apps/bookgeek/api/src/models/` (`book.js`, `profile.js`). No TTL indexes or
  cleanup jobs exist anywhere in the app yet.
- Frontend: React 18 + Vite SPA in `apps/bookgeek/web/src/` (monolithic `App.jsx`).
  Downloads use `authFetch()` (~line 605) with cookie credentials.
- Deployed as `geeksuite/bookgeek:latest`, port 1800, library volume
  `/mnt/extra_space/books:/data/library`, HTTPS terminated by suite-level nginx.

---

## Architecture decisions

### D1 — Storage: MongoDB collection with TTL index (decided)
Basket is ephemeral but must survive process restarts (user creates basket on phone,
walks to Kindle, container may redeploy). Use a Mongoose `DeviceBasket` model:

```
slug        String, unique index, lowercase
userId      String
device      String            // "kindle" for now; drives format choice
items       [{ bookId, format }]
createdAt   Date
expiresAt   Date, TTL index (expireAfterSeconds: 0)
```

The Mongo TTL monitor only runs ~every 60s and is a *cleanup* mechanism, not a
security mechanism — **every request handler must check `expiresAt` explicitly**.
No separate cron job needed; TTL index replaces it.

### D2 — Slug generation: EFF short wordlist, 4 words (decided)
Use the EFF short wordlist #2 ("clip-to-unique-prefix" list, 1,296 words) as the
basis — it was designed for exactly this: short, common, unambiguous, easy-to-type
words with unique three-character prefixes. Vendor it into the repo as a JS array
(`apps/bookgeek/api/src/wordlist.js`) after filtering to words ≤ 7 chars; do not
fetch at runtime. 4 words ≈ 41 bits — adequate for a 30-minute DRM-free-content
token. Generate with `crypto.randomInt`, not `Math.random`. On the (astronomically
unlikely) unique-index collision, regenerate and retry up to 3 times. Slugs are
stored and compared lowercase; lookup lowercases input (case-insensitive resolve).

### D3 — Route namespace and module layout (decided)
`server.js` is already ~3,000 lines. Put all basket code in a new module:

- `apps/bookgeek/api/src/deviceBasket.js` — model, slug generator, HTML renderer,
  and an Express router; mounted in `server.js` with one line.

Routes:
- `POST /api/device-baskets` — **authenticated**. Body: `{ device, bookIds[] }`.
  Resolves preferred format from device (`kindle → mobi`), creates basket, returns
  `{ slug, url, expiresAt }`.
- `GET /download-basket/:slug` — public. Server-rendered HTML page (books +
  download links + minutes remaining). 404-style "expired" page if missing/expired.
- `GET /download-basket/:slug/item/:index` — public. Validates basket + expiry,
  then serves the file (converting on demand via the existing pipeline).

Note: the SPA fallback (`server.js` ~line 2991) serves `index.html` for unknown
paths — the basket routes must be registered **before** the fallback.

### D4 — Downloads are basket-scoped; close the public download hole (decided)
Download links on the basket page point at `/download-basket/:slug/item/:index`,
**not** at `/api/books/:id/download/:format`. This keeps expiry enforceable per
request, avoids leaking book IDs in the basket page, and means an expired basket
leaves no working URLs.

Separately: add `authenticateToken` to the existing
`GET /api/books/:id/download/:format` (and audit `/api/books/:id/cover`). The SPA
already sends credentials via `authFetch`, so this is safe for the normal UI. The
existing `/kindle/*` PIN-cookie flow must keep working — check whether it links to
the public download route and route it through its own cookie check if so.
*(If this breaks something unexpected, ship the basket first and fix the hole in a
follow-up — but it must not be forgotten.)*

### D5 — Conversion reuse: extract, don't duplicate (decided)
The item download handler needs "ensure format exists → convert if missing → record
in Book.files[] → stream file". That logic currently lives inline in the
`/api/books/:id/download/:format` handler. Extract it into a shared function
(e.g. `ensureFormat(book, format)` returning a file path) used by both the existing
route and the basket route. Behavior of the existing route must not change.

### D6 — HTML: new minimal renderer, not `kindleLayout` (decided)
The basket page must be even more primitive than the existing Kindle UI (no PIN
cookie, no navigation, no inline CSS niceties). Write a small dedicated renderer in
`deviceBasket.js`: plain HTML 4-era markup, escaped titles/authors, one `<a>` per
book, expiry countdown as static text ("expires in N minutes" — computed
server-side, refreshed on reload). Response headers on all basket routes:
`Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`.

### D7 — Frontend: session-local selection, no persisted basket (decided)
The "basket" the user assembles in the SPA is client-side state only (checkbox /
"add to device basket" per book, following the app's existing UI patterns). The only
server interaction is the final `POST /api/device-baskets`. Show the resulting URL
in large, easily-typed text with the expiry time. No basket editing after creation —
create a new one instead.

### D8 — Naming (decided)
Generic: `DeviceBasket` model, `device-baskets` API, `download-basket` public path.
No `Kindle*` names in core code; "kindle" appears only as a device-profile value
(`kindle → mobi`) in the format map.

---

## Work plan and model assignment

Guideline: **Opus** for tasks touching security boundaries, the shared conversion
refactor, or the monolithic server.js integration (higher blast radius, more
judgment). **Sonnet** for well-specified, self-contained tasks with clear success
criteria. Phases are sequential; tasks within a phase can run in parallel.

### Phase 0 — Kindle connectivity proof (manual + Sonnet)
The existing `/kindle` routes suggest Tests 1–2 already pass. Verify on the device:

- **Task 0.1 (Sonnet):** Add throwaway public routes `GET /kindle-test` (static
  HTML) and `GET /kindle-test/download` (serve a small known-good MOBI from the
  library). ~30 lines. Delete after Phase 0.
- **Task 0.2 (human):** On the Kindle: open the page, download the file, confirm it
  appears in the library, opens, cover renders, filename intact. Also try an EPUB.
  **If download fails, stop — the feature premise is broken; investigate before
  building anything else.**

### Phase 1 — Backend core
- **Task 1.1 (Sonnet):** Vendor the wordlist (`wordlist.js`) + slug generator with
  `crypto.randomInt`, lowercase normalization, and a unit test for format/entropy.
- **Task 1.2 (Sonnet):** `DeviceBasket` Mongoose model per D1, including TTL index.
- **Task 1.3 (Opus):** Extract `ensureFormat()` from the existing download handler
  per D5 and re-wire the existing route through it. This is the risky refactor —
  existing downloads (SPA + `/kindle/*`) must behave identically. Verify by
  exercising the current download flow before and after.
- **Task 1.4 (Opus):** The basket router: `POST /api/device-baskets` (auth),
  `GET /download-basket/:slug` (HTML per D6), `GET /download-basket/:slug/item/:i`
  (expiry check → `ensureFormat` → stream). Mount before the SPA fallback.
  Request-time expiry enforcement, no-store/noindex headers, HTML escaping of all
  book metadata, no full-slug logging in the request logger path.

### Phase 2 — Frontend
- **Task 2.1 (Sonnet):** Selection UI in the SPA per D7: add-to-basket affordance on
  book rows, a basket indicator, and a "Download to Device" action that POSTs and
  displays the URL + expiry prominently. Follow existing `App.jsx` patterns and the
  suite design language (`DOCS/GEEK_SUITE_DESIGN_LANGUAGE.md`).

### Phase 3 — Hardening
- **Task 3.1 (Opus):** Lock down `GET /api/books/:id/download/:format` and audit
  the cover endpoint per D4, preserving the `/kindle/*` PIN flow.
- **Task 3.2 (Sonnet):** Tests: slug collision retry, expired-basket rejection on
  both page and item routes, case-insensitive slug resolution, HTML escaping of
  hostile titles (`<script>`, apostrophes, ampersands, Unicode).

### Phase 4 — Device validation (manual, spec Tests 4–7)
On the real Kindle with a short dev expiry (e.g. 2 minutes):
real generated MOBI (title/author/cover/Unicode/large file), a 3-book basket (each
link independent, repeat downloads fine), expiry (page and item URLs both rejected;
a previously-fetched item URL dies with the basket), and browser-abuse cases
(back button, refresh, long titles, slow connection).

---

## Definition of done

Phone → select books → create basket → type 4-word URL on Kindle → primitive page
renders → tap download → MOBI generated if needed → file lands in Kindle library
with working cover. Basket dead 30 minutes after creation, everywhere, every time.

## Addendum (2026-08-30) — D9: secret-word landing page

Field result: the 4-word slug URL works on the Kindle but is brutal to type. New
flow layered on top (slugs remain the underlying mechanism):

- User sets a personal **device word** in settings (`Profile.deviceWord`,
  lowercase, unique sparse index, `PUT /api/profile/me`, 409 if taken).
- Kindle bookmarks the stable page `GET /download-basket` — a primitive HTML form
  asking for the word. `POST /download-basket` looks up the profile by word, finds
  that user's newest non-expired basket, and 302-redirects to its slug URL.
- Neutral failure message ("No active basket for that word") regardless of whether
  the word exists; per-IP in-memory rate limit (10/min) on the POST.
- Basket-creation response gained `landingUrl`; the SPA result dialog leads with
  "go to /download-basket, enter your word" when a word is set, slug URL as
  fallback.

D10 (2026-08-30): expiry is now a **sliding 30-minute inactivity window** — any
live basket hit (page view or download) pushes `expiresAt` out to a full TTL, so
slow devices don't die mid-session but idle baskets still vanish. The SPA's
selection basket likewise auto-clears after 30 minutes without interaction.

Accepted tradeoff: one user-chosen word is weak entropy, but it only unlocks
*redirection to* a basket that still expires in 30 minutes and only exists when
deliberately created. DRM-free books, not state secrets.

## Explicitly out of scope (v1)

ZIP / "download all" bundling, basket editing, per-device format pickers beyond the
`kindle → mobi` map, QR codes, rate limiting (revisit if abuse ever matters), and
any manufacturer cloud/API integration — vendor independence is the whole point.
