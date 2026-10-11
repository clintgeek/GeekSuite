# NewsGeek clustering (N1)

The spec is `DOCS/NEWSGEEK_PLAN.md` → "Clustering (the interesting part)": **under-merge**,
a JOIN threshold plus a guard, and **a golden set before tuning**. This file covers how N1
is built, in two phases:

- **Phase 1 (built 2026-10-11):** article embeddings plus the golden-set tools.
- **Phase 2 (not built):** assigning `storyId`.

## Phase 1: what was built

| Piece | File | What it does |
|---|---|---|
| Embeddings client | `backend/src/cluster/embeddings.js` | `POST {EMBEDDINGS_URL}/api/embed` with `mxbai-embed-large`, one model table, unit vectors, `EmbeddingsUnavailableError`. **No fallback provider.** |
| Indexer | `backend/src/jobs/embedIndexer.js` | A background loop that fills `article.embedding = { model, vector }`. |
| Candidate export | `backend/src/cluster/candidates.js`, `backend/scripts/export-cluster-candidates.js` | Stratified cross-outlet pairs as JSONL, for labelling. |
| Evaluation | `backend/src/cluster/evaluate.js`, `backend/scripts/eval-cluster-threshold.js` | Precision, recall and F0.5 per JOIN threshold, with and without the guard, plus a recommendation. |
| Health | `GET /api/health` → `embed` | `{ enabled, model, lastRunAt, pending, lastError, backoffUntil }` |

The Article schema already had `embedding: { model, vector }` and `storyId`
(`packages/schemas/newsgeek/article.js`). Phase 1 writes only `embedding` and leaves
`storyId` null.

### The embeddings service

- **Which service:** `datageek_embeddings` (Ollama) on `datageek_network`. The newsgeek
  container is already on that network, so the compose file needs no change (checked
  2026-10-11). Override it with `EMBEDDINGS_URL`. `EMBEDDINGS_MODEL` exists for
  experiments only.
- **The text:** `title + '\n' + excerpt`, trimmed and cut at 1,000 characters. Article vs
  article is passage vs passage, so mxbai gets **no prefix**. Only a search *query* would
  get "Represent this sentence for searching relevant passages: ".
- **Plain `fetch`, not `lib/safeFetch.js`.** The SSRF guard refuses private addresses by
  design, and this is a private container address. That's safe only because the URL comes
  from operator env or the built-in default, never from a source or a reader. The source
  file says so in a comment.
- **Shared with NoteGeek.** The Ollama container is shared with NoteGeek's search, and it
  serves one request at a time. The indexer splits each batch of 32 into requests of at
  most 4,000 characters, so a NoteGeek search waits behind about 4 s of our work at most.
  `MAX_CHARS_PER_REQUEST` (8,000) is the client's hard guard.

### The indexer

- **When it runs:** in production, or with `EMBED_AUTORUN=1`. `EMBED_DISABLED=1` is the
  kill switch. The first run is about 15 s after boot, then every 60 s, single-flight.
- **The queue is the database:** articles with no vector for the current model, **newest
  first**, 32 at a time. A tick keeps taking batches until 20 s of work is spent.
  - A restart loses nothing.
  - A model change re-indexes everything in the background. The query is
    `embedding.model ≠ current OR no vector`.
- **The write:** `$set: { embedding: { model, vector } }` by `_id`. Nothing else changes,
  not even `updatedAt`.
- **The service is down, slow, 5xx or answering nonsense:**
  - The tick stops and the loop backs off: 30 s, doubling, capped at 10 min.
  - It logs **one** warning per outage and one info line when the service is back.
  - Nothing is charged to the articles, and no other provider is called.
  - Ingest never notices: the two loops share no timers and no state.
- **A 400 (the input, not the service):**
  - The batch is retried one article at a time.
  - An article refused on its own is set aside **in memory** and logged by id. It tries
    again after the next restart.
- **Design throughput** (estimates; nothing measured on the live box yet):

  | | NoteGeek's measured rate (~1,000 chars/s) | Faster case (~2,700 chars/s) |
  |---|---|---|
  | One batch of 32 (~380 chars per article, ~12,000 chars) | ~12 s | ~4.5 s |
  | Batches in a 20 s tick budget | 2 | 5 |
  | Throughput | **~64 articles/min** | ~160/min |
  | Backfill of ~3,000 articles | **~47 min** | ~20 min |

  Steady state is ~660 articles a day, about 0.5 a minute, so about 1 s of Ollama time a
  minute.
- **Storage:** 1,024 doubles is about 9 KB per article in BSON.
  - About 27 MB for today's 3,000 articles.
  - About 550 MB at steady state: 90-day retention × 660 a day ≈ 60,000 articles.
  - The gateway already reads articles with `{ embedding: 0 }`. **Keep it that way:**
    every new gateway read must leave the vector out.

### The golden set: candidate export

- **The window:** articles published in the last 7 days (`--days`) that have a vector for
  the current model.
- **Which pairs:**
  - From **different outlets**. The outlet is `publisherDomain`, else `publisher`, else
    the source. A Google News search's AP and Reuters items are a pair; KATV direct and
    KATV via Google News are not.
  - Published within **72 h** of each other (`--window-hours`).
  - Not the same `titleKey`. Display dedupe already handles those; `--include-exact` keeps
    them.
- **The sample:** stratified across cosine bands: ≥0.90, 0.85–0.90, 0.80–0.85, 0.75–0.80,
  0.70–0.75 and 0.60–0.70.
  - The default is 200 pairs (`--total`), split evenly. A thin band's shortfall goes to
    the others.
  - Each band is a reservoir sample, so the full pair list is never held in memory.
  - Seeded (`--seed`, default 1): the same data and seed give the same file.
  - The output is shuffled, so the labeller doesn't read the pairs in cosine order.
- **Each pair records** `weight` = (pairs in its band) / (pairs sampled from it). The
  evaluation uses it to turn the stratified sample back into **population**
  precision/recall. Without it, the over-sampled high-cosine bands would flatter
  precision.
- **`sharedPlaces`:** gazetteer places named in **both texts**. They are re-matched with
  `buildPlaceMatcher`, using the source's places as context only.
  - They are **not** the stored `places`, which include places inherited from the source:
    two Little Rock stations inherit Little Rock on every story.
  - State and country places are dropped: "Arkansas" in both is no evidence of one event.
- **Cost:** a sliding 72 h window over time-sorted articles, never n².
  - Benchmarked 2026-10-11 on a synthetic production-sized set (4,620 articles over 7 days,
    1,024 dims, 96 outlets): **7.1 M comparisons in 11 s**.
  - Memory is about 19 MB of Float32 vectors plus the reservoirs.
  - `--max-comparisons` (default 25 M) is a hard stop. When it trips, the summary says
    `TRUNCATED`.
- **Read-only:** nothing is written to Mongo. JSONL goes to stdout or `--out`; the
  summary goes to stderr.

Record:
```json
{ "pairId": "<idA>:<idB>",
  "a": { "id", "source", "publisher", "title", "excerpt (≤200)", "publishedAt", "url" },
  "b": { … },
  "cosine": 0.8731, "hoursApart": 5.2, "sharedPlaces": ["little-rock-ar"],
  "band": "0.85-0.90", "weight": 41.6, "label": null }
```

### The golden set: evaluation

`node scripts/eval-cluster-threshold.js labelled.jsonl [--json] [--unweighted]` needs no
database.

- **What it measures:** for JOIN = 0.60 … 0.95 in steps of 0.01, it reports precision,
  recall and **F0.5** (precision counts twice), with and without the guard.
- **The recommendation:** the best F0.5 with **precision ≥ 0.97**. Ties go to the higher
  threshold.
- **The guard** (plan step 3) passes on any one of these:
  - a shared gazetteer place (`sharedPlaces`);
  - a word of 4 or more letters that is in **both titles** and reads as a proper noun. That
    means it's capitalised somewhere in the pair's titles or excerpts, other than at the
    start of a sentence, in a text that isn't Title Cased throughout ("Man Killed In
    Overnight Shooting" proves nothing about "Shooting"). It also must not be on the short
    STOP list (weekdays, months, headline filler, "Police", "County");
  - a shared number in both titles: 2 or more digits, not a year from 1900 to 2099.
- **What it doesn't measure:**
  - The plan's second clause ("for local stories, a place matches") needs a story's
    section, which only exists in phase 2.
  - The export's excerpts are cut at 200 characters, so the guard sees a little less text
    here than it will in phase 2.
- **Blind spot:** pairs under 0.60 are never sampled. A "same" pair down there doesn't
  count against recall, so recall is recall *above 0.60*.

## Production runbook (after the image with phase 1 is live)

1. **New env vars need `docker compose up -d` in `apps/newsgeek/`.** Watchtower keeps the
   old env. None of the new vars is *required*: the defaults are production's.
2. **Watch the backfill drain:**
   ```
   curl -s http://localhost:1830/api/health | jq .embed
   ```
   - `enabled: true` and `model: "mxbai-embed-large"`.
   - `pending` falls by roughly 60–160 a minute from ~3,000. Expect about 20–50 min.
   - `lastError` stays null.
   - If `backoffUntil` keeps moving, the embeddings service is unreachable from the
     container. Check `docker exec newsgeek wget -qO- http://datageek_embeddings:11434/api/version`
     and the container-DNS landmine.
   - The kill switch is `EMBED_DISABLED=1` in `.env.production`, then
     `docker compose up -d`.
3. **Once `pending` is near 0** (and ideally after a full week of vectors), export:
   ```
   docker exec newsgeek node scripts/export-cluster-candidates.js --out /tmp/pairs.jsonl
   docker cp newsgeek:/tmp/pairs.jsonl ./pairs.jsonl
   ```
   The summary on stderr shows the band populations. If a band has fewer pairs than its
   share, the others get the difference. That's expected.
4. **Label** `pairs.jsonl`: set each `label` to `"same"` or `"different"`, following the
   rules below. Leave a pair `null` (or `"unsure"`) to skip it; the evaluation counts it as
   skipped. Keep the file outside the repo, or under a gitignored path: it holds live
   titles and links. Remember the repo's `.gitignore` landmine and verify with
   `git show --stat`.
5. **Evaluate** anywhere:
   ```
   node apps/newsgeek/backend/scripts/eval-cluster-threshold.js pairs.labelled.jsonl
   ```
   Write the chosen JOIN and its measured P/R/F0.5 into phase 2's constant comment, with
   the date and the label count.

## Labelling rules: what "same story" means

**Same** = the same real-world event, announcement or incident.
- Two outlets' reports of one homicide, fire, crash, vote, ruling, earnings report or
  product launch: **same**.
- A follow-up on the same event: **same**. That covers an arrest in yesterday's homicide,
  the victim being named, and the council's final vote on the budget it debated last week.
- An official notice and the news report of the same thing: **same**. Phase 2 attaches
  official notices as `officialArticleIds`, not as coverage, but the event is the same.

**Different** = anything else, including:
- different events of the same kind: two separate Little Rock homicides, two school-board
  meetings in two towns, this week's and last week's storm;
- the same topic, different news: "tariffs hit farmers" vs "Senate debates tariff bill";
- a roundup or listicle vs one of the events in it. When in doubt, **different**: that's
  the under-merge principle;
- an opinion column about an event vs the news report of it. This one is a judgement
  call; mark it **different** for v1.

If you can't tell from the title and the 200-character excerpt, open both links. If you
still can't tell, leave it unlabelled. About 150 confident labels beat 200 guesses.

## Phase 2 (not built): assigning `storyId`

1. **Stories:** the plan's "Data model" `stories` collection, which needs a schema in
   `packages/schemas/newsgeek/` (not created in phase 1). It holds the centroid (a running
   mean of member vectors, re-normalised), `firstArticleAt`/`lastArticleAt`, section,
   places, and the coverage and syndication counts.
2. **Join at ingest + embed time:** right after an article gets its vector (the indexer),
   find candidate stories in the same broad section whose `lastArticleAt` is within 72 h.
   Join the best one only if `cosine ≥ JOIN` **and** the guard passes **and**, for a Local
   story, a place matches. Otherwise start a new story. Syndicated copies (`syndicationKey`)
   join and count once. Official notices attach as `officialArticleIds`. An article with
   no vector yet has no story, and per the plan **it doesn't appear until it's clustered**.
   That's a gateway rule, and phase 2 has to decide whether to show unclustered articles
   when the service is down for long (the plan says no; revisit with Chef).
3. **Merge pass:** nightly, over pairs of recent stories, at a stricter threshold measured
   on the same golden set. Stories never split in v1; an admin "split this article out"
   fixes a bad merge and adds the pair to the golden set as `different`.
4. **Gateway:** `newsFrontPage` and the section pages group by `storyId` instead of
   `dedupe.js`'s display-time titleKey collapse. The ranking gains its coverage term
   (distinct publishers per story).
5. **Tests that go red** when the threshold or the guard is broken: N1's done-when. They
   come from golden-set pairs frozen as fixtures.

## Things other docs and schemas need (for whoever edits them)

- **`apps/newsgeek/DOCS/CONTEXT.md` → Env, optional:**
  - `EMBEDDINGS_URL` (default `http://datageek_embeddings:11434`)
  - `EMBEDDINGS_MODEL` (default `mxbai-embed-large`; experiments only)
  - `EMBED_DISABLED`
  - `EMBED_AUTORUN`
- **`apps/newsgeek/DOCS/CONTEXT.md` → Shape / Backend:** the backend now also runs the
  **embedding indexer**. Its outbound call is the one deliberate exception to
  "everything goes through safeFetch", because it targets an operator-configured internal
  service. Also add a log entry for phase 1 pointing here.
- **`DOCS/NEWSGEEK_PLAN.md` → N1 row:** phase 1 (embeddings + golden-set tooling) is built.
  JOIN is pending labels.
- **Schema (optional, later):**
  - `embedding.textHash` (or `embeddedAt`): lets the indexer re-embed when the excerpt
    changes after embedding, as `clean-excerpts.js` does. Today a cleaned excerpt keeps
    its old vector. That's harmless for clustering, since the cleaner only removes
    boilerplate tails.
  - A `stories` schema for phase 2.
