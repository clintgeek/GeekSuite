# Five ways GeekSuite could use AI — responsibly, and only where Chef would actually use it

*Written 2026-09-05 by Sage at Chef's request. Ideas only — nothing here is implemented. Each one is
sized, scoped, and comes with the guardrails that make it something we'd be comfortable running
against our own data.*

## What "responsibly" means here

The suite already has an AI spine: aiGeek in basegeek (provider rotation, per-app routing keyed by
API key, the free-model steward, an OpenAI-compatible proxy, rate limits and cost tracking), and
three consumers that use it today — storygeek's narration, StartGeek's `??` Ask, and fitnessgeek's
coach/insights/food classification. Every idea below rides that spine. The rules they all share:

1. **Opt-in per feature, off by default.** A setting in the app that owns the data, same as Ask.
2. **Drafts, never writes.** The model proposes; Chef confirms before anything is saved. Every
   saved artefact that started as a draft carries a visible `AI-drafted` provenance mark.
3. **Deterministic first.** Where a number or a fact is involved (a trend, a total, a match), code
   computes it and the model only words it. The model never does arithmetic we can check.
4. **Know what leaves the box.** aiGeek sends prompt content to whichever provider it routes to.
   Each feature declares exactly which fields it sends, sends the minimum (ids and titles, not
   bodies, wherever that works), and has a "local summary only" fallback that skips the model.
5. **Bounded cost.** Every feature gets its own aiGeek routing row (so the steward picks a free
   model and rate limits apply per feature), a per-day cap, and a visible "this used N calls today".
6. **Measurable.** Each idea names the one number that says whether Chef actually uses it. If that
   number is zero after a month, the feature comes out.

Sorted by how sure I am you'd use it.

---

## 1. Bujogeek — the weekly review, pre-drafted

**What.** On the Review page, one button: *Draft my review*. aiGeek gets the week's deterministic
facts — completed / carried / blocked / cancelled task counts, habit streaks kept and broken, the
titles of overdue and blocked tasks, and the collection each belongs to — and returns three short
paragraphs in bujogeek's voice (what got done, what kept slipping and a guess why, three concrete
carry-forwards). You edit it in the existing review editor and save; it's marked `AI-drafted`.

**Why you'd use it.** You already do the review; the blank page is the expensive part. This is
the closest thing to a real time saver in the suite, and it's a summary of your own week — low
stakes, high frequency (weekly), and the model can't be *wrong* about facts because it isn't given
any it can get wrong, only titles and counts.

**Data sent.** Task titles, statuses, due/completed dates as text, habit names and streaks. Not
notes, not tags, not anything from other apps. Fallback: a deterministic bullet summary with no
model call (already most of the value).

**Guardrails.** Opt-in in bujogeek Settings; the draft never saves itself; the three
carry-forwards are shown as *suggestions to add* with an explicit "add these as tasks" button
(each becomes an ordinary task via the existing `createTask` mutation — nothing bypasses the
gateway's validation). One call per review. Routing row `bujogeek:review`.

**Build.** S–M: a `reviewDraft` GraphQL query in the bujogeek gateway module that gathers the
facts and calls `aiService` through the existing app-routing path; a `ReviewDraftCard` on the
Review page reusing `GeekSheet`/`useToast`; provenance flag on the review document (one field).

**The number.** Drafts saved as reviews per month.

---

## 2. FitnessGeek — natural-language quick-add that proposes a log, never writes one

**What.** In the food-log quick-add, type what you ate — *two eggs, toast with butter, black
coffee* — and get back a **proposal**: three rows, each mapped to a FoodItem candidate from the
suite's own catalog search (the deterministic part), a servings guess, and a meal type from the
time of day. You tick the rows you want, adjust a serving, and log; each row goes through the
existing `addFoodLog` mutation exactly as a hand-entered one would.

**Why you'd use it.** You log food every day and the current path is search → pick → serving →
repeat per item. Parsing the sentence into candidate searches is the part a model is good at; the
matching and the nutrition math stay deterministic and inside the gateway's findOrCreate/dedupe
rules (which today's consolidation just made one implementation).

**Data sent.** The sentence you typed and the current hour. Nothing from your history, nothing
from settings. Fallback: split on commas and run each fragment through the existing search.

**Guardrails.** Opt-in; the proposal card is the only UI — there is no "log all" without the
review step; every candidate shows its source (USDA / OpenFoodFacts / your custom food) so a
wrong match is visible; the model never invents a food (a fragment with no catalog match shows
"no match — search?" rather than a made-up item). Routing row `fitnessgeek:quickadd`.

**Build.** S: a `parseFoodEntry` gateway query returning `{ fragments: [{ text, query,
servings, mealType }] }`, then the frontend runs the fragments through the existing food search
and renders the proposal in the quick-add sheet (the FAB path already exists). The
`aiFoodPromptCache` model already caches prompt → structured answers, so repeated breakfasts cost
nothing.

**The number.** Log entries created from a proposal per week vs. by hand.

---

## 3. NoteGeek — "you already have a note about this": tag and link suggestions on save

**What.** When you save a note, a quiet strip appears under the title: *Tags: `#homelab`
`#nginx` · Related: "Watchtower digest landmine", "nginx layout"*. One tap applies a tag or adds a
link; nothing is applied on its own. Suggestions come from your existing tags and notes only —
the model never proposes a tag you haven't used.

**Why you'd use it.** Your notes are a knowledge base that grows faster than its links. The value
is in recall ("did I already write this down?"), and the cost of a wrong suggestion is zero
because you just don't tap it. This also makes the mind-map view more useful for free, since
links are its edges.

**Data sent.** The note's title and first ~500 characters, plus your tag list (names only) and
the titles of the 50 most recent notes. Not the full body, not other notes' bodies. Fallback: a
purely local TF-IDF over titles and tags — honestly good enough that the model may only earn its
place on the *related notes* half. Start with local; add the model only if the local version
misses obvious links.

**Guardrails.** Opt-in; suggestions are per-save and discarded if not tapped; the strip says how
it was produced (local / model); notes marked private (if we add such a flag) are never sent;
routing row `notegeek:suggest` with a low daily cap because saves are frequent.

**Build.** S for the local version (a `suggestForNote` gateway query doing TF-IDF over the user's
tags and titles; a `SuggestionStrip` component); +S to add the model for the related-notes half.

**The number.** Suggestions tapped per hundred saves.

---

## 4. BookGeek — "what next", and filling the metadata your imports came in without

**What.** Two small things on the same page. On the library view, a *What next?* shelf: five
owned-but-unread books with a one-line reason each, chosen from your ratings, tags, recently
finished, and what you abandoned — the candidate set is computed (unread ∩ owned), the model only
ranks and explains. And on a book with missing metadata (Calibre and Goodreads imports often lack
a description or tags), a *Draft description & tags* button that proposes them from title, author,
publisher and year; you edit, then save, and the book carries `AI-drafted` until you clear it.

**Why you'd use it.** You have a big library and the "what should I read" question is real; the
gaps in imported metadata are the thing that makes the shelf view look half-finished. Both are
occasional, both are low stakes, and both are visibly correctable.

**Data sent.** For *What next*: titles, authors, your ratings and read/unread status for the
candidate set and the last 20 finished — no reviews, no reading progress. For drafts: title,
author, publisher, year of one book. Fallback for *What next*: a deterministic "highest-rated
author you haven't finished" ranking, no model call.

**Guardrails.** Opt-in; *What next* is a shelf you can hide; a drafted description is never
shown to anyone but you until you save it, and the `AI-drafted` mark is filterable; the model is
told not to summarise plot beyond what a back cover would (no spoilers is a feature here);
routing row `bookgeek:library`.

**Build.** S each: `whatNext` and `draftBookMetadata` queries on the bookgeek gateway module (the
profile/shelves/filters moved there today, so the module already knows the user's library
shape); a `WhatNextShelf` reusing `ShelfStrip`/`BookCard`; a button in the edit-metadata dialog.

**The number.** Books started from the shelf; drafts saved with edits vs. discarded.

---

## 5. StartGeek — a three-sentence morning brief that knows it's morning

**What.** The first time the console is opened after 5 a.m. local, the hero slot shows a brief:
*Three tasks due today, the roofer call is overdue from Tuesday. 61° and clear until 3. You're 40
pages from the end of Dune.* Sourced entirely from the glance data the console already loads
(bujogeek tasks, weather, bookgeek reading progress, fitness streak). One call, cached for the
day, dismissible with one tap, and it never returns after you dismiss it until tomorrow.

**Why you'd use it.** StartGeek is the tab that is always open. The glance modules already show
all of this; the brief is the same information read once, top to bottom, the way you'd read a
sticky note. It's the one place AI adds *less* to the screen rather than more, which is why it
fits the console.

**Data sent.** The already-fetched glance payload: task titles and due dates, the weather summary,
the current book's title and progress, streak counts. No note content, no health numbers beyond
"streak intact". Fallback: a deterministic one-liner built from the same fields (the model earns
its place only by reading naturally).

**Guardrails.** Opt-in (same switch pattern as Ask, in StartGeek settings); strictly one call per
day per user, cached in the glance cache; dismiss is remembered; if aiGeek is unreachable the slot
is simply empty — the console must never wait on it; routing row `startgeek:brief` using the
free-model steward. The brief is display-only; there are no actions in it (tasks are one tap
away in their module).

**Build.** XS–S: the glance module already has `glanceAsk`; a `glanceBrief` query that reuses its
data loaders and prompts for three sentences; a `BriefCard` in the hero with a time-of-day gate.

**The number.** Days the brief was shown and *not* dismissed within five seconds.

---

## What I deliberately left out

- **Anything that writes on its own** (auto-tagging, auto-logging, auto-archiving). Every idea
  above stops at a proposal.
- **Health interpretation** in fitnessgeek beyond what already exists. The trend numbers are
  useful; a model narrating blood-pressure trends adds a liability without adding information.
- **Flock analysis.** flockgeek is lowest priority by your own call and the data volume is small
  enough that a chart says everything.
- **A suite-wide chat.** Ask already covers "answer a question from my data", and a second
  conversational surface would compete with it.
- **Embeddings infrastructure** as a first step. Idea 3 is written so the local version ships
  first and the model only joins if it earns it.

## If you pick one

Start with **#1 (the review draft)**: weekly cadence means low cost, the facts are all counts and
titles so the model can't corrupt anything, and it exercises the whole path — a per-feature
routing row, the steward, a draft with provenance, an opt-in switch — that #2–#5 then reuse. Two
of the five (#3 local, #5) are essentially free to try and easy to remove.
