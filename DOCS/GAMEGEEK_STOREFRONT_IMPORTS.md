# GameGeek Storefront Imports — Research

Status: **research, plan, not started beyond what's already being built tonight.** Written
2026-09-24. Scope: how GameGeek can get a user's owned-games list from each PC storefront,
verified against current (2025-2026) facts where the ecosystem actually moves — API
availability, endpoints, product state. Facts below are cited; anything not independently
verified live is marked **unverified**. Aligns with `packages/schemas/gamegeek/constants.js`
(`STOREFRONTS`, `GAME_SOURCES`) and `DOCS/GameGeekPlan.md` §7 (imports) and §4.2 (metadata
providers), both read before writing this.

## 1. Steam — the only storefront with a real, sanctioned API

**Feasibility: automatic.**

- **`GetOwnedGames`** (`IPlayerService` interface) — `GET
  https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` (the partner-docs mirror
  resolves to `partner.steam-api.com`, same interface). Required: `key` (a Steamworks Web API
  key), `steamid` (64-bit SteamID), plus `include_appinfo` (name/icon) and
  `include_played_free_games`. Returns `playtime_forever` per title, which is exactly the
  hours data GameGeek's `hoursSource: 'steam'` field wants
  (`packages/schemas/gamegeek/constants.js`'s `HOURS_SOURCES`).
  [Web API Overview](https://partner.steamgames.com/doc/webapi_overview)
- **`ResolveVanityURL`** — `ISteamUser/ResolveVanityURL/v0001/`, turns a custom profile URL
  (`steamcommunity.com/id/<vanity>`) into the 64-bit SteamID `GetOwnedGames` needs. Not
  documented as connected to `GetOwnedGames` in Valve's own reference, but it's the standard
  first step whenever a user supplies a profile URL/name instead of the raw SteamID64.
- **Key minting**: `steamcommunity.com/dev/apikey`, one key per Steam account, free.
- **Privacy is the whole ballgame.** `GetOwnedGames` "returns a list of games owned by the
  player if their owned games/game details are visible to you" — confirmed both in the partner
  docs and independently by developers hitting it: **a private "Game details" setting returns
  an empty games array / `game_count: 0`, not an error.**
  [Steam Community: privacy settings discussion](https://steamcommunity.com/discussions/forum/7/1729827777339922602/),
  [Steam Support: profile privacy](https://help.steampowered.com/en/faqs/view/588C-C67D-0251-C276).
  **This matches GameGeekPlan §12's existing risk note almost exactly** ("a private profile
  returns an empty library, not an error. Detect it and explain rather than importing zero
  games in silence") — that plan was already right about this behavior; it's now independently
  confirmed rather than assumed.
- **Rate limits**: the *Web API* (`api.steampowered.com`, key-authenticated) is documented at
  100,000 calls/day per Valve's API terms — nothing GameGeek's per-user import will approach.
  [Ultimate Steam Web API Guide](https://dev.to/zuplo/the-ultimate-steam-web-api-guide-2ie8).
  The **Store** API (`store.steampowered.com/api/storesearch`, `.../appdetails`) is genuinely
  keyless, undocumented officially, and community reporting puts it around **200
  requests/5 minutes** — worth caching aggressively and batching `appdetails` lookups rather
  than firing one per game on every import.
  [SteamDB blog on store pricing API](https://steamdb.info/blog/store-prices-api/) (SteamDB
  itself doesn't publish the exact cap; the 200/5min figure is community-reported, marked
  **unverified against an official source**, and matches this plan's existing caution about
  rate limiting external metadata calls).
- **What GameGeek should build**: exactly what's already underway tonight —
  `POST /api/import/steam` with a dry-run diff, matching by `steamAppId` (already a unique
  per-household indexed field on `Game`, per `packages/schemas/gamegeek/game.js`), falling back
  to IGDB `external_games` lookup for anything Steam alone can't fully describe.
- **ToS/credential risk: low.** No password ever touches GameGeek — only a public SteamID and
  a developer API key Chef mints himself.

## 2. GOG — no official API; two real unofficial routes

**Feasibility: semi-automatic**, both routes require either a file GameGeek can't reach
server-side (the Galaxy DB) or a logged-in browser session (the embed API) — neither is a
clean "paste a SteamID and go."

- **No official public library API exists.** Nothing found (searched directly) resembling a
  GOG equivalent of `GetOwnedGames`.
- **GOG Galaxy 2.0's local database** is a real SQLite file:
  `%ProgramData%\GOG.com\Galaxy\storage\galaxy-2.0.db` on Windows. Confirmed by GOG's own
  community forum threads on the client
  ([GOG forum: "What database does Galaxy 2.0 use?"](https://www.gog.com/forum/general_beta_gog_galaxy_2.0/what_database_does_galaxy_20_use),
  [GOG forum: "Where are game tags locally stored?"](https://www.gog.com/forum/general_beta_gog_galaxy_2.0/where_are_games_tags_locally_stored)).
  Tables include `ProductConfiguration`, `InstalledBaseProducts`, `UserReleaseTags` — enough to
  reconstruct an owned-games list, but it's a client-side file on the user's own machine, not
  something GameGeek's server can query. It's the same shape of source as Heroic's cache files
  (§5) — something a **file importer** reads, not an API GameGeek calls.
- **`embed.gog.com/account/getFilteredProducts`** is a real, working, but entirely
  **unofficial** endpoint used by the GOG website and Galaxy client themselves — it returns
  paginated purchased-products results (`mediaType`, `search`, `page`, `category`, etc.) but
  only works with the caller's own logged-in session cookies, which means either scraping a
  user's own browser session (fragile, and functionally asking for their GOG password) or not
  building this at all. Documented unofficially at
  [gogapidocs (ReadTheDocs)](https://gogapidocs.readthedocs.io/en/latest/listing.html) and the
  GOG forum's long-running
  ["Unofficial GOG API Documentation"](https://www.gog.com/forum/general/unofficial_gog_api_documentation)
  thread.
- **`gogdb.org`** is a community-run site
  ([Yepoleb/gogdb on GitHub](https://github.com/Yepoleb/gogdb)) that scrapes GOG's own store
  and Galaxy APIs to build a public id/metadata database, refreshed roughly every 2 hours. It's
  a useful **id-mapping resource** (GOG product id → title/metadata) for cross-referencing a
  file-importer's rows, not an ownership API itself.
- **ToS/credential risk**: the Galaxy DB route needs zero credentials (it's a file the user
  exports themselves); the `getFilteredProducts` route needs a live GOG session, which is
  exactly the credential-sharing risk this whole research explicitly avoids.
- **What GameGeek should build**: nothing automatic. Wait for the file importer (§7) to read a
  user-exported Galaxy DB copy (or a Playnite/Heroic export that already normalized GOG's
  library), and use `gogdb.org`'s id conventions or IGDB `external_games` (§8) for dedupe.

## 3. Epic Games Store — no public API, period

**Feasibility: semi-automatic, via a third-party tool the user runs themselves.**

- **No public API.** Confirmed by the absence of anything resembling one across Epic's own
  developer docs and every community source checked; PCGamingWiki's own Epic Games Store
  reference page has no API section.
  [PCGamingWiki: Epic Games Store](https://www.pcgamingwiki.com/wiki/Store:Epic_Games_Store).
- **Legendary** (`legendary-gl/legendary`, an open-source Epic Games Launcher replacement) is
  the practical route: `legendary list --json` (a `-J`/`--pretty-json` flag exists for
  readability) dumps the authenticated user's owned Epic titles as JSON.
  [legendary GitHub](https://github.com/legendary-gl/legendary),
  [legendary README](https://github.com/legendary-gl/legendary/blob/master/README.md). This
  requires the user to authenticate Legendary against their own Epic account once (a real login
  flow, not a scrape) and then run the CLI themselves — GameGeek never sees Epic credentials.
- **Heroic Games Launcher** wraps Legendary as its Epic backend and caches the result — see §5
  for the exact cache path GameGeek's file importer would read instead of shelling out to
  Legendary directly.
- **Epic's account-data privacy export** (the "download my data" GDPR/CCPA-style export every
  major platform now offers) plausibly includes a purchase/library history — **unverified**;
  nothing found confirming its exact contents or format, and it wasn't checked live (would
  require an actual Epic account and a multi-day export wait). Worth a one-line mention as a
  possible manual fallback, not a build target.
- **ToS/credential risk**: Legendary is a well-established, actively maintained reverse-engineered
  client with a large user base; running it is the user's own choice and own risk, same as
  choosing to use Heroic instead of the official launcher. GameGeek never touches an Epic
  password.
- **What GameGeek should build**: nothing tonight. The file importer (§7) reading Legendary's
  or Heroic's own JSON output is the eventual path; there's no lower-effort automatic option.

## 4. Amazon — Prime Gaming / Amazon Games, and Luna's 2025-2026 overhaul

**Feasibility: semi-automatic (Nile CLI route only); Luna has no library worth importing.**

- **The official Amazon Games app has no public API.** Nothing found suggesting otherwise.
- **Nile** (`imLinguin/nile`, with `NearlyTRex/Nile` as a related fork) is an unofficial,
  open-source Amazon Games client — same role for Amazon as Legendary plays for Epic. Heroic
  uses it as its Amazon/Prime Gaming backend, driving it with `nile library sync` to refresh
  the local library listing.
  [Nile on GitHub (imLinguin)](https://github.com/imLinguin/nile),
  [GamingOnLinux: Nile project coverage](https://www.gamingonlinux.com/2022/11/access-your-amazon-prime-gaming-library-on-linux-with-the-nile-project/).
  Same shape as Epic: the user authenticates Nile against their own Amazon account, and
  GameGeek would read Heroic's cached output rather than touch Amazon credentials directly.
- **Amazon Luna's 2025-2026 state changed substantially and is worth knowing before assuming
  it has a "library" at all.** As part of Amazon's October 2025 gaming-division layoffs, Luna
  is being restructured away from a marketplace model:
  - Third-party store purchases (EA, Ubisoft, GOG titles bought through Luna) stopped as of
    **April 10, 2026**.
  - The **"Bring Your Own Library"** feature — streaming games a user already owned on those
    third-party storefronts — ends **June 3, 2026**.
  - Previously-purchased third-party titles remain streamable only until **June 10, 2026**,
    after which they're removed from the service entirely.
  - Luna is now **subscription-only**: **Luna Premium** ($10/month, ~155 mostly older titles)
    and **Luna Standard** (free with Prime, a smaller rotating library, ~50+ titles as of
    Prime members getting streaming access in October 2025).
  [PC Gamer: Luna ending third-party purchases](https://www.pcgamer.com/software/platforms/amazons-luna-cloud-gaming-service-is-ending-support-for-game-purchases-and-subscriptions-from-third-party-stores-and-users-will-lose-streaming-access-to-purchased-third-party-games-in-june/),
  [Tech Insider: Luna drops EA/Ubisoft/GOG](https://tech-insider.org/amazon-luna-drops-third-party-games-2026/),
  [Tech Insider: Luna ends game purchases, 61-day wind-down](https://tech-insider.org/amazon-luna-ends-game-purchases-2026/).
  **The surprise worth flagging to Chef**: Luna in its 2026 form has no "ownership" concept
  to import at all — it's a Netflix-style rotating subscription catalog, not a library. A
  `luna` storefront value already exists in `STOREFRONTS`
  (`packages/schemas/gamegeek/constants.js`) for the "I played this on Luna" case, but there's
  nothing to *import* from it — a manual entry is the only sensible path, permanently, not
  just until an importer gets built.
- **ToS/credential risk**: Nile carries the same profile as Legendary — reverse-engineered,
  actively maintained, user's own risk to run.
- **What GameGeek should build**: nothing tonight; same file-importer path as Epic once Heroic
  or a direct Nile JSON dump exists to read.

## 5. Aggregators — the actual near-term path for everything but Steam

**Feasibility: semi-automatic, user-run export.** This is where GameGeek's real leverage is:
instead of talking to five different unofficial APIs, read the export or cache files these
existing tools already produce.

### Playnite (Windows, open source)

No built-in CSV/JSON export in the core app as of the sources checked, but a healthy plugin
ecosystem covers it:
- **`zachvlat/playnite-json`** — exports the library (with sources, platforms, playtime, etc.)
  to a JSON file, originally built to feed a companion Android app.
  [GitHub](https://github.com/zachvlat/playnite-json).
- **`NicodeSS/playnite-game-data-exporter`** — maintains a `library.json` automatically and
  offers a manual export via the main menu.
  [GitHub](https://github.com/NicodeSS/playnite-game-data-exporter).
- CSV export specifically is a long-requested, still-open feature request against Playnite
  core itself. [Playnite issue #791](https://github.com/JosefNemec/Playnite/issues/791).
- Playnite itself aggregates Steam, GOG, Epic, and more into one library, so a single Playnite
  export is potentially the highest-value single file GameGeek's importer could read — one
  file, many storefronts, already deduped by the user's own install.

### GOG Galaxy 2.0 as an integration hub

Beyond being GOG's own client, Galaxy 2.0 supports third-party integrations (Steam, Epic, etc.)
through its own plugin system, making its local `galaxy-2.0.db` (§2) a second candidate
single-file source that may already span multiple storefronts for users who consolidate there
instead of in Playnite.

### Heroic Games Launcher (cross-platform, Linux-friendly)

Confirmed cache file locations, which is the concrete artifact a file importer would parse:
- **Linux**: `~/.config/heroic/store_cache/` containing `gog_library` and `legendary_library`
  JSON files (the Epic library, since Heroic drives Epic through Legendary); `~/.config/legendary`
  separately holds Epic-specific metadata and user info.
- **Windows**: `%AppData%\heroic` for caching; `%UserProfile%\.config\heroic` and
  `%UserProfile%\.config\legendary` for the same data as Linux.
- **macOS**: `~/Library/Application Support/heroic` for caching, same `.config` paths otherwise.
- **Flatpak (Linux/SteamOS)**: `~/.var/app/com.heroicgameslauncher.hgl/config/heroic/` and
  the equivalent `.../config/legendary/` path.
  [Heroic wiki: Troubleshooting](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/wiki/Troubleshooting).
- Heroic's Amazon support runs through Nile (§4), and its GOG support through its own
  `gogdl` tool rather than Legendary or Nile.
  [DeepWiki: imlinguin/nile](https://deepwiki.com/imlinguin/nile).
- An open, unresolved Heroic feature request for a first-class "export list of games"
  confirms there's no single official export command yet — the cache files are the closest
  thing. [Heroic issue #3387](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/issues/3387).

**ToS/credential risk for all three**: none directly — GameGeek reads a file the user already
has on their own machine and uploads themselves. No credential ever crosses to GameGeek.

## 6. IGDB `external_games` — the cross-store dedupe key

IGDB's API exposes an `external_games` relation connecting its own game ids to external
service ids; requesting `external.steam` in a fields query returns the Steam AppID mapped to
that IGDB entry.
[IGDB API changelog: "Added external field for games"](https://headwayapp.co/igdb-api-changelog/added-external-field-for-games-34531),
[IGDB API docs](https://api-docs.igdb.com/). This is exactly the mechanism
`DOCS/GameGeekPlan.md` §4.2 already names for Steam app-id mapping, and it's the same
mechanism any importer (Playnite JSON, Heroic cache, a manual GOG Galaxy DB dump) should use
to match an external id back to one canonical `Game` row rather than creating a duplicate per
storefront. IGDB's own rate limit (4 requests/second under Twitch client-credentials OAuth) is
already established as an internal fact in `GameGeekPlan.md` §4.2 and re-used, not
re-verified, here.

## 7. Xbox / PlayStation / Nintendo — out of scope, briefly

- **Xbox**: no public consumer API for an owned-games list. Unofficial community libraries
  exist that reverse-engineer Microsoft's internal Xbox Live endpoints, all requiring the
  user's own Microsoft account credentials or an OAuth flow against an API Microsoft could
  revoke access to at any time.
- **PlayStation**: same shape — no public API; unofficial PSN libraries need PSN credentials
  and are similarly fragile.
- **Nintendo**: no public API at all; the Switch/Switch 2's own account system exposes nothing
  comparable even unofficially at the scale Xbox/PSN reverse-engineering has reached.

`DOCS/GameGeekPlan.md` §2.2 already excludes achievement/account sync for exactly this reason
("no public APIs; unofficial ones break and need account credentials"). This research doesn't
change that call — it confirms it. Manual entry (or the CSV/paste path, §8) is the permanent
answer for console libraries, not a placeholder until an API shows up.

## 8. What GameGeek should build — recommendation, by priority

1. **Steam API import (already being built tonight)** — `POST /api/import/steam`, dry run
   first, `GetOwnedGames` + `ResolveVanityURL`, matched by `steamAppId` then IGDB
   `external_games`. The one storefront with a real, sanctioned, keyed API.
2. **Manual paste-a-list (already being built tonight)** — for everything else, permanently
   for Xbox/PlayStation/Nintendo/Luna, and as the fallback for GOG/Epic/Amazon until the file
   importer exists. `GAME_SOURCES` already has `'paste-list'` reserved for this
   (`packages/schemas/gamegeek/constants.js`).
3. **Next: a file importer** for Playnite's exported JSON/CSV, Heroic's `store_cache` JSON
   files (`gog_library`, `legendary_library`), and a GOG Galaxy 2.0 `galaxy-2.0.db` export —
   deduped against IGDB `external_games` the same way the Steam importer already will be. One
   file format, ideally Playnite's, covers the most storefronts per user action; Heroic's cache
   files are the practical second target since they're already broken out per storefront.

### Data shape per imported item — aligned with existing schemas

Every import path, regardless of source, should normalize to the same shape before it touches
`Game`/`GamePlayer` (`packages/schemas/gamegeek/{game,gamePlayer,constants}.js`, all read
before writing this):

```js
{
  title: String,                    // → Game.title
  storefront: STOREFRONTS[number],  // → Game.copies[].storefront — already includes
                                     //   'steam' | 'gog' | 'epic' | 'amazon' | 'luna' | ...
  platform: PLATFORMS[number],      // → Game.copies[].platform
  externalId: String,               // → Game.externalIds.{igdb,steamAppId,gog,epic}
  playtimeMinutesOrHours: Number|null, // → GamePlayer.hoursPlayed, hoursSource: 'steam' | 'manual'
  acquiredAt: Date|null,            // → Game.copies[].acquiredAt (calendar date, UTC midnight
                                     //   per THE_CONTEXT §3.1's date-storage rule)
  source: GAME_SOURCES[number],     // 'steam-import' | 'csv-import' | 'paste-list' | 'sample'
}
```

`Game.externalIds` today (`packages/schemas/gamegeek/game.js`) has `igdb`, `steamAppId`,
`rawg`, `gog`, and `epic` fields — Amazon and Luna have no external id worth storing since
neither has an id-bearing API to match against; a copy's `storefront: 'amazon'`/`'luna'` value
alone is sufficient there.

## Sources

- [Steamworks Web API Overview](https://partner.steamgames.com/doc/webapi_overview)
- [Steam Community: GetOwnedGames and privacy settings](https://steamcommunity.com/discussions/forum/7/1729827777339922602/)
- [Steam Support: Steam Profile Privacy](https://help.steampowered.com/en/faqs/view/588C-C67D-0251-C276)
- [The Ultimate Steam Web API Guide (rate limits)](https://dev.to/zuplo/the-ultimate-steam-web-api-guide-2ie8)
- [SteamDB: Store Prices API blog post](https://steamdb.info/blog/store-prices-api/)
- [GOG forum: What database does Galaxy 2.0 use?](https://www.gog.com/forum/general_beta_gog_galaxy_2.0/what_database_does_galaxy_20_use)
- [GOG forum: Where are game tags locally stored?](https://www.gog.com/forum/general_beta_gog_galaxy_2.0/where_are_games_tags_locally_stored)
- [gogapidocs: Listing / getFilteredProducts](https://gogapidocs.readthedocs.io/en/latest/listing.html)
- [GOG forum: Unofficial GOG API Documentation](https://www.gog.com/forum/general/unofficial_gog_api_documentation)
- [gogdb.org (Yepoleb/gogdb on GitHub)](https://github.com/Yepoleb/gogdb)
- [PCGamingWiki: Epic Games Store](https://www.pcgamingwiki.com/wiki/Store:Epic_Games_Store)
- [legendary-gl/legendary on GitHub](https://github.com/legendary-gl/legendary)
- [legendary README](https://github.com/legendary-gl/legendary/blob/master/README.md)
- [Nile (imLinguin) on GitHub](https://github.com/imLinguin/nile)
- [GamingOnLinux: Nile project coverage](https://www.gamingonlinux.com/2022/11/access-your-amazon-prime-gaming-library-on-linux-with-the-nile-project/)
- [DeepWiki: imlinguin/nile (Heroic's Amazon/GOG backends)](https://deepwiki.com/imlinguin/nile)
- [PC Gamer: Amazon Luna ending third-party purchases/streaming](https://www.pcgamer.com/software/platforms/amazons-luna-cloud-gaming-service-is-ending-support-for-game-purchases-and-subscriptions-from-third-party-stores-and-users-will-lose-streaming-access-to-purchased-third-party-games-in-june/)
- [Tech Insider: Amazon Luna drops EA, Ubisoft & GOG](https://tech-insider.org/amazon-luna-drops-third-party-games-2026/)
- [Tech Insider: Amazon Luna ends game purchases, 61-day wind-down](https://tech-insider.org/amazon-luna-ends-game-purchases-2026/)
- [zachvlat/playnite-json on GitHub](https://github.com/zachvlat/playnite-json)
- [NicodeSS/playnite-game-data-exporter on GitHub](https://github.com/NicodeSS/playnite-game-data-exporter)
- [Playnite issue #791: Export library with metadata](https://github.com/JosefNemec/Playnite/issues/791)
- [Heroic Games Launcher wiki: Troubleshooting (cache paths)](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/wiki/Troubleshooting)
- [Heroic issue #3387: Export List of Games (open request)](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/issues/3387)
- [IGDB API changelog: external field for games](https://headwayapp.co/igdb-api-changelog/added-external-field-for-games-34531)
- [IGDB API docs](https://api-docs.igdb.com/)
