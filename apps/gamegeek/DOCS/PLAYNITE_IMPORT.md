# GameGeek — Playnite import

*Written 2026-09-25. Status: building. Chef: "the initial library should be fed and updated
with this file/format." Steam stays as a possible metadata source later, not the library.*

## The file

`Playnite Library Exporter` JSON, `schemaVersion: 1`. The sample Chef provided is
`DOCS/playnite-library.json`, which is his real library. It is **gitignored and must never
be committed** (the repo is public). The test fixture is a 14-entry trim of it at
`apps/gamegeek/backend/test/fixtures/playnite-library.sample.json`, with `installDirectory`
removed.

Top level: `schemaVersion`, `generatedAtUtc`, `generator {name, version}`,
`playnite {databaseGameCount}`, `export {totalGames, excludedGameCount, steamAppIdCount,
formats, automatic, trigger}`, `games[]`.

Per game (always present unless noted): `playniteId` (stable GUID), `name`,
`providerGameId`, `pluginId`, `sourceId`, `sourceName` (missing on 1 of 931),
`steamAppIdConfidence` (`none` | `exact`), `steamAppId` + `steamAppIdSource` (Steam
only), `isInstalled`, `hidden`, `favorite`, `platforms[]`, `genres[]`, `categories[]`,
`tags[]`, `playtimeSeconds`, `added`, `modified`, `releaseDate` (unpadded `Y-M-D`, missing
on 112), `sortingName` (sometimes), `lastActivity` (sometimes), `installDirectory`
(sometimes; ignored, never stored).

**Not in the file:** completion status, user score, and cover images. So shelves are
inferred (below) and covers come from a later metadata pass.

Chef's library, measured: 931 games. By source: Epic 305, GOG 225, Amazon 164, Xbox 130,
Ubisoft Connect 44, Steam 38, Xbox Game Pass 16, Battle.net 8, none 1. 241 hidden, 178 with
playtime, 44 titles owned on two stores.

## Endpoint

`POST /api/import/playnite` on the gamegeek backend. It needs auth and CSRF like every
other write. The body is either multipart field `file` (≤ 20 MB) or `application/json`
holding the export object. Flags come as query params or multipart fields:
- `dryRun`: default **true**
- `includeHidden`: default **false**

Response (dry run and commit have the same shape; commit adds `committed: true`):

```json
{
  "schemaVersion": 1,
  "generatedAtUtc": "2026-09-25T16:21:03Z",
  "total": 931,
  "counts": { "create": 0, "addCopy": 0, "update": 0, "unchanged": 0,
              "skippedHidden": 0, "notInFile": 0, "invalid": 0 },
  "samples": {
    "create":   [{ "title": "…", "storefront": "epic" }],
    "addCopy":  [{ "title": "…", "storefront": "gog" }],
    "update":   [{ "title": "…", "hoursBefore": 1.2, "hoursAfter": 3.4 }],
    "notInFile":[{ "title": "…" }]
  },
  "committed": false
}
```

Each sample list is capped at 20. Errors are `{message, code}`: 400 `PLAYNITE_BAD_FILE` for
unparseable JSON or an unknown `schemaVersion`, 413 when the body is too large.

## Mapping

| Playnite | GameGeek |
|---|---|
| `sourceName` Epic / GOG / Amazon / Xbox / Ubisoft Connect / Steam / Battle.net / EA app, Origin / itch.io | copy `storefront` epic / gog / amazon / xbox / ubisoft / steam / battle-net / ea / itch; anything else or missing → `other` |
| `sourceName` Xbox Game Pass | storefront `xbox`, format **`subscription`** |
| everything else | format `digital` |
| `platforms` PC (Windows) / PC (Linux) / Macintosh / Microsoft Xbox Series / Microsoft Xbox One / Microsoft Xbox 360 / Sony PlayStation 5 / 4 / Nintendo Switch | pc / linux / mac / xbox-series / xbox-one / xbox-360 / ps5 / ps4 / switch; unknown names dropped |
| copy `platform` | for an Xbox or Game Pass source that lists an Xbox platform, that platform (Series before One); otherwise `pc` |
| `platforms` (all mapped) | union into `Game.platformsAvailable` |
| `name` | `title` |
| `sortingName` | `sortTitle` (lowercased) when present |
| `genres` | `genres` |
| `categories` + `tags` | `tags` (deduped, capped) |
| `releaseDate` `Y-M-D` | `releaseDate` at UTC midnight; unparseable → null |
| `steamAppId` when confidence `exact` | `externalIds.steamAppId` |
| `playniteId`, `providerGameId`, `sourceName`, `playtimeSeconds`, `lastActivity`, `hidden` | `copy.playnite.*` |

## Matching (one Game, many copies)

For each entry, in order:
1. A household copy with the same `playniteId` → **update** that copy.
2. A household game with the same `steamAppId` → **addCopy**.
3. A household game with the same **normalized title** → **addCopy**. Normalizing means:
   lowercase, drop ™®©, `&` → `and`, strip everything but letters and digits.
   "Director's Cut" stays distinct from the base game.
4. Otherwise **create**. Two entries in one file that share a normalized title become one
   Game with two copies.

Re-importing the same file is a no-op: 0 create, 0 addCopy, everything `unchanged`.

## Per-user state (the importing user's `GamePlayer`)

- **On first creation of the row:**
  - shelf: `backlog` if the summed playtime is 0; `playing` if `lastActivity` is within
    30 days; otherwise `on-hold`
  - `favorite` from Playnite
- **Hours:** the sum of the game's Playnite copies' `playtimeSeconds` / 3600, rounded to
  0.1, with `hoursSource: 'playnite'`. It overwrites only when the current source is
  `playnite` or `steam`, or hours are 0. **Hours a person typed are never overwritten.**
- `lastPlayedAt` = the later of the existing value and the newest `lastActivity`.
- After creation, an import **never changes the shelf or favorite**. GameGeek owns them.

## Catalog fields on re-import

Fill only what is empty (genres, release date, steamAppId, platformsAvailable union).
Never overwrite the title or any field someone edited.

## Hidden, removed, invalid

- `hidden` entries are skipped for create and addCopy unless `includeHidden`. An
  already-imported copy still gets its `hidden` flag and playtime updated.
- A household Playnite copy whose `playniteId` is **not in the file** is counted as
  `notInFile` and listed. It is **never deleted**: a partial export must not wipe the
  library.
- An entry that fails validation is counted as `invalid` and skipped. It is never fatal.

## Profile

`GameProfile.playnite = { lastImportAt, lastGeneratedAtUtc, lastTotal, lastSource }`,
exposed on `gameProfile` so Settings can say "Last imported … from an export made …".
`lastSource` is `'upload'` or `'folder'` (added with the folder import, below) — which
front door produced the most recent import.

## Folder import — the Nextcloud drop (built 2026-09-25)

Chef's Playnite exporter writes automatically, same filename every time, into
`/mnt/NextCloud/data/Files/gamegeek-import/<username>/playnite-library.json` on the host —
a Nextcloud **desktop-client** sync folder, never touched or renamed by GameGeek (ghost
files in the Nextcloud UI otherwise). The compose mount brings the parent in read-only at
`/playnite-drop`. No env var is required in production: the watcher turns on when
`PLAYNITE_DROP_ROOT` is set OR `/playnite-drop` exists, so the mount alone is enough;
`PLAYNITE_DROP_DISABLED=1` is the kill switch.

- **Folder → user.** Every subfolder of the root is a user, matched case-insensitively
  against username or email in basegeek's `userGeek.users` (the same approach as
  FitnessGeek's `DOCS/BODY_COMPOSITION_INTAKE.md` §11.1). A new user's folder is picked up
  without a restart; an unknown folder name is warned about once and skipped.
- **When it runs:** a full scan at boot (after Mongo connects — the correctness
  guarantee, since a watcher can't see files that arrived while the app was down),
  `fs.watch` on the root (for a new user's folder) and on each known user folder, and a
  rescan every 15 minutes as a safety net. All three feed one queue, so files import one
  at a time.
- **Stability.** A file is only read once its size and mtime are unchanged across two
  checks at least 5s apart, AND the settled bytes parse as JSON — Nextcloud writes files
  in place, so a half-written file is retried on the next pass, never ledgered as failed.
- **The ledger** is `PlayniteDropFile` (`gamegeek.playnitedropfiles`,
  `@geeksuite/schemas/gamegeek/playniteDropFile`), one row per `(userId, relPath)`,
  upserted in place — the drop folder always has the same filename, so this is "the
  current state of that slot", not a log of every scan:
  - Same `sha256` at the same slot as last time → a cheap no-op (`unchanged`); this is
    what makes every 15-minute rescan of an untouched export a single read.
  - Same `sha256` already imported under some other path → `skipped-duplicate`.
  - `generatedAtUtc` no newer than the profile's `playnite.lastGeneratedAtUtc` →
    `skipped-older` — an older export never overwrites a newer one.
  - Otherwise the import runs — **exactly** this endpoint's commit path
    (`playnite/runCommit.js`, shared with the upload route), always with
    `includeHidden: false` (hidden games are never imported by the auto path; there is no
    setting for it) — and the row becomes `imported`, with the plan's `counts`.
  - A parse or commit failure is ledgered `failed` with the error message, and is not
    retried until the file's `sha256` changes (retrying identical bytes reproduces the
    identical failure).
- **Serialization.** The upload route and the folder watcher share one process-wide mutex
  (`playnite/importLock.js`), so an upload landing mid-drop-import can't interleave writes
  with it.
- **Status:** `GET /api/import/playnite/drop/status` (auth, scoped to the caller) →
  `{ enabled, watching, folder: 'gamegeek-import/<username>/', lastFile: {name, status,
  processedAt, generatedAtUtc, counts, error} | null }`. The Settings card shows a line
  under the manual upload (still the fallback either way): watching + last import, a
  quiet skipped/failed note, or nothing when the importer isn't enabled.
- Not built: a push-with-token path from the exporter — the Nextcloud drop replaces it.

## Later

- **Metadata and covers come from Steam, IGDB and RAWG** (Chef's pick, 2026-09-25). A
  separate enrichment pass fills empty fields only, never overwriting anything someone
  edited:
  - Steam appdetails (keyless) for games with an exact `steamAppId`.
  - IGDB (Twitch client credentials) as the main source for the rest, since it covers every
    store and maps cross-store ids through `external_games`.
  - RAWG (API key) as a fallback when IGDB has no match.
  - Covers are cached locally through `coverFetch`'s allow-list, like today.
