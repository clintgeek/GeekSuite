# GameGeek — metadata and cover enrichment

*Written 2026-09-25. Status: building. Chef picked the sources: Steam, IGDB and RAWG.*

## Why

The Playnite import brings 683 games in with titles, genres (574) and release dates (597),
but no covers, descriptions, developers or publishers. Only 33 have a Steam app id. As of
2026-09-25 there are no IGDB or RAWG keys.

## Providers, in order per game

| # | Provider | When | Key |
|---|---|---|---|
| 1 | **Steam appdetails** | game has `externalIds.steamAppId` | none |
| 2 | **IGDB** | configured (`IGDB_CLIENT_ID` + `IGDB_CLIENT_SECRET`) | Twitch app |
| 3 | **RAWG** | configured (`RAWG_API_KEY`) | rawg.io key |
| 4 | **Steam store search → appdetails** | always (keyless), for games still unmatched | none |

Step 4 sits last so the keyed sources win when they exist. Without keys, it does most of
the work, since most Epic, GOG and Amazon titles are also on Steam.

## Matching is strict

A title search result counts as a match only if:
- its **normalized title equals** the game's normalized title. The normalizer is the same
  as the Playnite import's (`normalizeTitle`), plus a second pass that also drops a trailing
  edition word (`game of the year`, `goty`, `definitive`, `enhanced`, `remastered`,
  `deluxe`, `complete`), used only when the first pass finds nothing;
- **and**, when both sides have a year, the years are within ±1;
- **and** it's the only candidate that passes. If two pass, it's **ambiguous** and
  there's no match.

A wrong cover is worse than a title plate. When in doubt, `no-match`.

## What gets filled — empty fields only

`description`, `developers`, `publishers`, `genres` (only if empty), `releaseDate`,
`modes` + `maxLocalPlayers` (IGDB/RAWG), `timeToBeat` (IGDB), `platformsAvailable`
(union, our vocabulary only), `externalIds.{steamAppId, igdb, rawg}` (only if empty and
not held by another game in the household), and the **cover**. The cover is downloaded
through `coverFetch`'s allow-list and cached locally. The allow-list adds
`media.rawg.io`, and Steam and IGDB are already on it. For Steam, prefer the
`library_600x900` portrait, then `header_image`.

**Never overwrite** a non-empty field, and never touch `title`, `tags`, `copies` or anything
personal. Descriptions are stripped to plain text (Steam's `short_description` holds
HTML entities and tags) and capped at the schema's maximum length.

## Record per game — `Game.enrichment`

```js
enrichment: {
  status: 'pending' | 'matched' | 'no-match' | 'ambiguous' | 'error' | 'unlinked',
  provider: 'steam' | 'igdb' | 'rawg' | null,
  providerId: String,          // the matched id at that provider
  matchedTitle: String,        // what the provider calls it — shown in the UI
  filled: [String],            // field names THIS enrichment wrote (for unlink)
  filledHashes: { [field]: String }, // sha256 (16 hex) of each value written — server-side only
  addedPlatforms: [String],    // platforms enrichment unioned into platformsAvailable
  coverFromEnrichment: Boolean,
  manual: Boolean,             // a person applied this match; the worker leaves it alone
  attempts: Number,
  lastTriedAt: Date,
  matchedAt: Date,
  error: String,               // short, no secrets
  providersTried: [String],    // which providers were consulted on the last attempt
}
```

**Unlink vs. a later edit (decided 2026-09-25).** If someone edits a filled field after the match,
an unlink must not wipe their edit. So each value enrichment writes is fingerprinted in
`filledHashes`. On unlink, a field in `filled` goes back to its schema default **only while its
current value still hashes the same**. An edited field, or one with no recorded hash, is kept and
reported in the response's `kept` list. `addedPlatforms` are pulled from `platformsAvailable`. The
cover is deleted only while `coverFromEnrichment` is still true. A manual cover upload or delete
(`/api/games/:id/cover`) sets it to false, so a person's cover survives an unlink.

**Writes are guarded.** Each attempt is one `updateOne` filtered on the `updatedAt` it read, plus
"still empty" for every field it fills. A miss (someone wrote meanwhile) re-reads, re-plans and
retries, up to 3 times. Filling a field someone filled concurrently is therefore impossible, not
just unlikely. An external id already held by another household game is skipped. A
duplicate-key race on one is retried without it.

**Steam quirk (recorded 2026-09-25).** `appdetails?appids=620` answered keyed by `"323180"` with
`data.steam_appid: 620`. The normalizer finds the entry by `steam_appid` when the key differs.

## Running it

- **The worker** runs in the gamegeek backend, one process-local queue at a time, and
  never blocks a request. It starts:
  - at boot (after a short delay);
  - after every Playnite import commit;
  - every 6 hours;
  - on demand from `POST /api/metadata/enrich/run`.
- **Which games it picks:**
  - status `pending`, or no `enrichment` at all;
  - `error` with fewer than 3 attempts and an exponential backoff;
  - `no-match` / `ambiguous` **only when a provider has become configured since the last
    attempt** (a provider not in `providersTried` is now available). Adding IGDB keys
    re-tries exactly the games that missed.
- **Pacing:**
  - Steam: about 1 request per 1.5 s across search and details (the undocumented limit
    is roughly 200 per 5 minutes; a 429 backs off 60 s).
  - IGDB: 4 per second (the existing limiter).
  - RAWG: 1 per second.
- **Scope:** per household. It uses the household of the games it's working on, never
  unscoped writes.
- **State:** progress lives only in the DB (`enrichment.status`), so a restart resumes.

- **Triggers are gated.** The boot run (30 s after start), the 6-hour run and the run after a
  Playnite commit fire only when `NODE_ENV=production` or `ENRICHMENT_AUTORUN=1`, so tests
  and dev never start the worker on their own. `ENRICHMENT_DISABLED=1` is the kill switch:
  nothing runs, and the run endpoint answers `202 {started:false, reason:'disabled'}`.
- **Error backoff:** attempts *n* waits 10 min × 2^(n−1) after `lastTriedAt`, and stops at 3.
- **Matching per provider:** Steam appdetails-by-id needs no title match. A search match is
  re-checked against the detail's year (Steam search results carry none). The first provider
  that matches supplies every field. A provider that throws doesn't stop the others; if none
  matched and any threw, the status is `error`.

## Endpoints (gamegeek backend, auth and household scoped)

- `GET /api/metadata/enrich/status` →
  `{ running, queued, counts: {matched, pending, noMatch, ambiguous, error, unlinked}, providers: {steam: true, igdb: bool, rawg: bool}, lastRunAt }`
- `POST /api/metadata/enrich/run` → starts the worker if it isn't running; `202 {started}`.
- `POST /api/games/:id/metadata/refresh` → re-runs this one game now (clears a
  `no-match`), then returns its enrichment.
- `GET /api/games/:id/metadata/candidates` → candidates from every configured provider
  for this game's title, with no strict filter, so a person can choose.
- `POST /api/games/:id/metadata/apply { provider, providerId }` → applies that candidate
  with the same fill-only-empty rules, and sets status `matched` (manual).
- `POST /api/games/:id/metadata/unlink` → **clears exactly the fields in
  `enrichment.filled`**, removes the cover if `coverFromEnrichment`, and sets status
  `unlinked`. The worker never touches an `unlinked` game again, which is how a wrong
  match stays fixed.

## GraphQL (gateway)

`Game.enrichment: GameEnrichment` (status, provider, providerId, matchedTitle,
matchedAt, attempts, error). Read-only, so the detail page can show "Metadata from Steam ·
matched as 'X'" or "No match yet".

## UI

- **Settings, "Metadata" card:**
  - counts, and which providers are on;
  - a "Run now" button;
  - live progress while it runs (poll status every 5 s while `running`);
  - for missing keys, one line on how to add them, written as "the server needs", never
    as the user's fault.
- **Game detail:**
  - a line under Details saying where the metadata came from;
  - ⋯ More → "Find metadata…", a candidate picker across providers → apply;
  - "Wrong match? Unlink", with a confirm;
  - "Refresh metadata".
- **Library:** covers simply appear as they land. No per-card spinners.

## Media and links

*Added 2026-10-29.* The detail page shows a game's screenshots and trailers and links out
to its store and database pages. Nothing here writes to the game.

**Endpoint (gamegeek backend, auth and household scoped):** `GET /api/games/:id/media` →

```js
{ links:       [{ kind: 'steam'|'igdb'|'rawg', label, url }],
  screenshots: [{ thumb, full, source: 'steam'|'igdb' }],
  videos:      [{ kind: 'steam', title, thumb, hls, mp4, url }      // url = store page
              | { kind: 'youtube', title, youtubeId, thumb, url }],
  source, fetchedAt, partial, errors: ['steam'|'igdb'|'rawg'] }
```

- **Sources:**
  - Steam appdetails (keyless) when there's a `steamAppId`;
  - IGDB (`fields url, screenshots.image_id, artworks.image_id, videos.*`) when there's an IGDB id and keys;
  - RAWG `/games/{id}` when there's a RAWG id and a key, used only for the `slug`, since the public page is `rawg.io/games/<slug>`.
  - IGDB's web URL is a slug too, and comes from the API's `url`.
- **Order:** Steam screenshots win; IGDB fills only when Steam has none (screenshots, then
  artworks). Trailers follow the same rule on their own.
- **Steam trailers are HLS/DASH only** (checked live 2026-10-29; the old `mp4`/`webm` fields are gone, but
  are still read if present). The viewer plays HLS in a plain `<video>` where the browser can
  (Safari, Chrome on Android); elsewhere it shows the poster and "Watch on Steam". No hls.js.
- **IGDB trailers are YouTube ids.** They open in YouTube; there's no iframe embed.
- **Timeouts and partial results:** the providers run in parallel, each under a 6 s deadline. A
  slow or failing one leaves `partial: true` and its name in `errors`, and the answer is still a 200.
  Steam calls go through the enrichment worker's shared Steam pacer, with no retry; a 429 pauses
  that pacer for 60 s.
- **Cache:** the Mongo collection `gamemediacache`, keyed by the provider ids
  (`steam:<id>|igdb:<id>|rawg:<id>`), not by game. A full answer lasts 7 days; an answer
  with any failure lasts 15 minutes. A TTL index clears expired entries. Concurrent opens of
  the same game share one fetch. Changing a game's ids (Find metadata, unlink) changes the key, so the
  next open fetches fresh.
- **URLs are allow-listed in the mapper:** https only, on `*.steamstatic.com` /
  `steamcdn-a.akamaihd.net`, `images.igdb.com`, `i.ytimg.com`/`youtube.com`, `igdb.com`, `rawg.io`.
- **Images are hotlinked, not proxied.** The app has no Content-Security-Policy (not in
  `index.html`, the backend, or the nginx vhost), so the browser loads them directly. The
  service worker sends those hosts **NetworkOnly** (`gamegeek-media-bypass`): there are hundreds of
  them, they're opaque cross-origin responses (Chrome pads each one in the quota), and the HTTP
  cache covers a reopen. **If a CSP is ever added**, it needs `img-src` for those hosts and
  `media-src` for `video.*.steamstatic.com`.

**UI, on the detail page.** The Media section sits full width, right under the action bar,
so on a phone it's the first thing you scroll to.

- **The strip** swipes sideways. The lead trailer comes first, with a lime play badge, then the
  screenshots, then any other trailers.
- **A tap** opens the full-screen viewer:
  - it shows "3 of 12";
  - swipe, the arrow keys or the arrow buttons move between items;
  - the close button, Escape or Android back (`hooks/useBackToClose.js`) close it.
- **Links** sit at the bottom of the same section: Steam store, GOG, IGDB, RAWG, "Watch a
  trailer" (a YouTube search), and "Search on Steam" for a game with no Steam id.
  - They're built on the client from the game's ids, so they never wait on the fetch.
  - IGDB shows a title search until the real page URL arrives.
  - RAWG appears once its slug does.
  - They live here rather than in ⋯ More so that they're one scroll away on a phone, not two
    taps and a sheet.
- **Loading** shows skeleton tiles. **No media** turns the section into "Links" only. A
  **failure** shows one quiet line, "Couldn't load screenshots.", and keeps the links.

## Keys

- **IGDB:** register an app at dev.twitch.tv/console → Client ID + Client Secret.
- **RAWG:** get a key at rawg.io/apidocs.

Chef adds them to `apps/gamegeek/.env.production` himself (never pasted into a
chat), then runs `docker compose up -d gamegeek`. Watchtower doesn't pick up new env
vars.
