# The suite tag standard

Decided by Chef, 2026-10-01: *"case-insensitive Kebab case is the standard we need to move to."*
Applies to the free-form tags of **NoteGeek, BuJoGeek and ThingGeek**. BookGeek and GameGeek genres are
curated vocabularies and are **not** touched.

Code: `packages/tags` (`@geeksuite/tags`) — pure ESM, zero runtime dependencies, imported by the gateway
(`apps/basegeek/packages/api`) and the three frontends. The source comments in
`packages/tags/src/normalize.js` are the authoritative wording; this page is the summary.

## The shape

A tag is lowercase kebab-case segments joined by `/` for nesting:
`work`, `house/garage`, `work/geek-suite`, `café/日記`.
`house/garage` is a tag of its own **and** sits under `house` (`house` is never over `houseboat`).

## `normalizeTag(raw)`

1. Non-string → `''`. Unicode NFKC, trim, strip leading `#`s.
2. Split on `/`. Per segment:
   - camelCase / PascalCase boundaries become word breaks: `geekSuite`, `GeekSuite` → `geek-suite`;
     `HTTPServer` → `http-server`; `v2Plan` → `v2-plan`. Letter→digit is not split (`v2`, `covid19`);
     digit→capital is (`2Plan` → `2-plan`). Acronym plurals stay whole (`URLs` → `urls`, `IDs` → `ids`).
   - Characters outside the allowed set are **dropped**: `R&D` → `rd`, `don't` → `dont`, `C++` → `c`.
   - Every run of whitespace, `_`, `-`, `.`, and the Unicode dashes (U+2010–U+2015, U+2212) → one `-`.
   - `toLowerCase()` (locale-independent); trim leading/trailing `-`; drop the segment if empty.
3. Rejoin with `/`. Nothing left → `''` (not a tag).

**Allowed characters** in a normalized tag: Unicode letters `\p{L}`, combining marks `\p{M}`, numbers `\p{N}`,
`-` (between words) and `/` (between segments). Everything else — punctuation, symbols, emoji, control and
format characters — is dropped.

`normalizeTags(list)`: normalize each, drop empties, dedupe exactly (post-normalization), first position wins.

**Matching is case-insensitive by construction** — everything stored is lowercase, so exact comparison of
normalized strings is the comparison.

**Limits**: 100 characters a tag (NoteGeek, BuJoGeek; ThingGeek keeps its 60), 50 tags an item. Validators
check the **normalized** value (normalizing can lengthen: `GeekSuite` → `geek-suite`).

**Accepted costs**: `iPhone` → `i-phone`, `McDonald` → `mc-donald`; `c#` and `c` collide; emoji-only tags vanish.

## Inline `#tags`

`findTagTokens` / `parseInlineTags` (moved from NoteGeek): `#` at the start or after whitespace or `(`, then a
letter, then letters/marks/digits/`_`/`-`/`/`. Not tags: `# Heading`, `C#`/`a#b`/`\#x`/`&#35;`, digit-first (`#1`),
hex colours (`#fff`, `#a1b2c3` — option `hexColours`, off in BuJoGeek's one-line add box), anything over 100 once
normalized; in Markdown/HTML also code, URLs and link targets. Output is normalized: `#GeekSuite` → `geek-suite`.

## Other helpers

`isUnder(tag, root)`, `isDescendant`, `swapPrefix(tag, oldRoot, newRoot)`, `parentTag`,
`subtreeRegex(root)` (escaped, `^root(?:/|$)`), `tagTree(tags, counts?)`, `filterTagTree`.

## Legacy data

Tags written before the standard are tolerated on read until the migration rewrites them: the gateway
(`graphql/shared/tagSpellings.js`) reads the owner's distinct stored spellings, keeps the ones that normalize to
the wanted tag (or its subtree) and filters with `$in` on those; every `tags` field resolver returns the standard
spelling. After the migration the lookup returns just the tag itself.

### The migration — `apps/basegeek/packages/api/scripts/migrate-tags-kebab.js`

Covers `noteGeek.notes`, `bujogeek.tasks|journalentries|templates`, `thinggeek.things` (per owner / household).
Not NoteGeek version history, not BuJoGeek pinned tags (normalized by the app on read), not BookGeek/GameGeek.
Spellings that normalize to the same tag collapse (first position wins), empties are removed, over-cap tags are
truncated. Writes `tags` only (never `updatedAt`), each write guarded on the item still holding the planned tags.
Idempotent.

The basegeek image carries `packages/api/scripts/` and `@geeksuite/tags`, so once this commit is deployed:

```
docker exec basegeek node /app/apps/basegeek/packages/api/scripts/migrate-tags-kebab.js            # dry run (default)
docker exec basegeek node …/migrate-tags-kebab.js --apply --rollback-dir /tmp/tags-kebab           # writes; rollback file first
docker cp basegeek:/tmp/tags-kebab ~/geeksuite-migrations/                                           # the container's disk does not survive a recreate
docker exec basegeek node …/migrate-tags-kebab.js --rollback /tmp/tags-kebab/tags-kebab-<stamp>.json
```

Dry run against production, 2026-10-01: NoteGeek (28 tagged notes) and ThingGeek (0) already clean; BuJoGeek
121 of 349 tagged tasks carry one of 7 camelCase spellings (`farmLife`, `geekSuite`, `hobbyCoding`, `jobSearch`,
`lakeLife`, `offTicket`, `onCall`); no merges, removals or truncations.
