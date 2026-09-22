# FitnessGeek — Describe and Log

*Agreed with Chef 2026-09-15. Supersedes search as the primary path.*

> **Status: shipped and verified end to end, 2026-09-16.**
>
> Backend landed 2026-09-15. The frontend called none of it for a day, while both
> placeholders invited you to "describe your meal" and then ran a search — so the feature
> existed and could not be reached. Wired 2026-09-16 (`e5aa9c12`).
>
> It also could not have worked if it had been reached. Both structured-output schemas
> shipped as raw JSON Schema where aiGeek's door requires `{ name, description?, schema }`,
> so every estimate and judge call answered 400 INVALID_SCHEMA (`03c18757`). Two things hid
> that: the unit tests mock `aiGeekClient` at the boundary *below* the envelope, and 175
> logger calls were string-first, which under pino drops every structured field — including
> the status and code that named this bug (`6c034e85`).
>
> **The lesson worth keeping: a feature is not shipped because its tests pass.** Every layer
> here was green while the thing was dead. What found it was one run against the real stack.
>
> Verified live, with a scratch user whose rows are deleted afterwards:
>
> | said | logged | ms |
> |---|---|---|
> | `4 chocolate chip pancakes homemade` | Chocolate Chip Pancakes · dinner · 500 cal | 1180 |
> | `a dozen nachos with beef and chicken and cheese` | Nachos · dinner · 1200 cal (ONE entry) | 505 |
> | `eggs and toast for breakfast, chicken caesar at lunch` | Eggs + Toast · breakfast; Chicken Caesar · lunch | 608 |

## 1. The requirement, in Chef's words

He is awful at logging. For years his wife did it: he described a meal, she wrote down one
reasonable thing, done. She stopped. He stopped.

> "I want the AI to act in the way my wife used to and just take a description and log the
> most reasonable items. This needs to be as zero friction as possible."

> "The difference of a nacho plate at 960c vs. one at 1220c is statistical noise at the week
> level. Easy over pinpoint accuracy... Restaurant plates are just educated guesses anyway."

**So the target is not a better search.** Yesterday's rebuild optimised the wrong thing: it
made searching fast when the requirement is to not search at all. Two taps per item times
four items is eight taps for one plate of nachos. That work stands — it is still the right
fallback for logging a specific branded bar — but it is no longer the front door.

## 2. What "done" looks like

Type or say a sentence. It gets logged. No confirmation step, no picking, no disambiguation.

```
"a dozen nachos with beef and chicken and cheese"
  → Nachos with beef, chicken and cheese · dinner · ~1,150 cal   [Undo]
```

One entry. Not four. The `with` clause is toppings on a plate, not a shopping list.

A whole day works too, because Chef logs both ways depending on the situation:

```
"eggs and toast for breakfast, chicken caesar at lunch, nachos for dinner"
  → three entries, in the right meals
```

## 3. The flow

**1. Split into dishes, deterministically.** Meal words ("for breakfast", "at lunch") and
commas separate ENTRIES. `with`/`and` inside an entry do NOT — they describe one plate.
This inverts yesterday's splitting rule, which is why the nachos query returned its own
toppings and no nachos.

**2. Route on what kind of food it is.** Published facts beat estimates every time they
exist, so estimation is only ever the path for food nobody has published:

| Input | Path |
|---|---|
| Barcode scan | **Published facts. Always.** Never estimate a scanned product. |
| A named branded product — "Pure Protein caramel bar", "Kroger chicken tenders" | **Catalog lookup** (FatSecret / OpenFoodFacts carry branded data). Estimate only if the lookup genuinely fails. |
| A described dish — "a dozen nachos with beef", "chicken caesar" | History, then estimate. Nobody publishes the nachos at the place Chef eats. |

This is where yesterday's search rebuild earns its keep rather than being superseded: the
ranker, the parallel catalog fetch and `foodRanker.isConfidentMatch` ARE the lookup half of
this design. A branded description runs the existing search and takes the confident match;
only a miss falls through to the model. So the two pieces of work compose — search handles
what is known, estimation handles what is judged.

Brand detection already exists in `aiFoodService`'s `COMMON_BRAND_HINTS` and its
`detectedBrands` pass; that signal routes the entry rather than being thrown away.

**3. Ask his history first.** Most people rotate ~30 meals. A dish he has logged before
reuses those exact numbers: no model call, no latency, no cost, and his log gets *more*
consistent over time rather than drifting. This is what the ranker's unwired
`chosenForQuery` hook was always for.

**4. Miss → one AI estimate.** The model returns the whole dish as one entry:
`{name, servings, unit, calories, protein, carbs, fat, lowCal, highCal, confidence}`.
It is allowed to invent numbers — a deliberate reversal, see §5.

**5. Rails, free and deterministic.** Before anything is written:
- macros must reconcile: `4P + 4C + 9F` within ±25% of stated calories
- calorie density ≤ 9 cal/g (pure fat is 9; anything above is arithmetic nonsense)
- portion sanity: a composite dish is not 41 pieces
- per-entry ceiling: > 2,500 cal for one dish gets flagged, not silently written

These are microseconds and catch the order-of-magnitude errors that actually matter. The
"Beef flautas · 41 piece" in Chef's 2026-09-15 screenshot fails rail three for free.

**6. Write the log. Immediately.** Toast shows what landed, with Undo.

**7. The judge runs AFTER, in the background, on a different provider.** aiGeek already
rotates across Cloudflare / Gemini / Groq and supports explicit pinning, so estimator and
judge are genuinely uncorrelated rather than one model agreeing with itself. If it objects
materially, the entry gets a quiet marker — never a blocking dialog, never a wait.

**8. Ask at most one question, only when it moves the needle.** Restaurant nachos (~1,200)
vs a small homemade plate (~400) is a 3× spread worth one tap. Regular vs large fries is
not. Threshold on absolute spread (> 400 cal), not percentage.

## 4. What a judge is and isn't for

It catches **order-of-magnitude nonsense**, not fine judgment. It cannot tell 950 from 1,100,
and asking twice buys confidence rather than accuracy.

**The rule, learned the hard way:** a judge is only worth its latency if its verdict changes
what Chef sees. `applySanityCheck` made a second LLM call setting `sanityCheckPassed`,
`sanityCheckIssues` and `sanityCheckConfidence` — three fields no frontend code has ever
read. Deleted 2026-09-14. Do not rebuild that.

## 5. The reversal, chosen knowingly

The AI may now **invent nutrition numbers** without a catalog row to prove them.

The previous natural-language feature was built on the opposite principle — it returned
search *queries*, never foods, and its own comments say "never a made-up food." That was a
sound instinct about fabricated data. Chef has chosen invented-but-reasonable numbers logged
consistently over catalog-grounded numbers he never logs, and he chose it with the trade-off
stated. Anyone revisiting this should know it was a decision, not an oversight.

## 6. Acceptance

| Input | Expect |
|---|---|
| `a dozen nachos with beef and chicken and cheese` | ONE entry, nachos, ~12 pieces, not four ingredient rows |
| `eggs and toast for breakfast, nachos for dinner` | two entries, correct meals |
| `a dozen eggs` | 12 servings, not 1 — "a dozen" is a compound quantity |
| the same dish, second time | no AI call at all; reuses his own prior numbers |
| a scanned barcode | published facts, never an estimate |
| `pure protein chocolate peanut caramel bar` | the real branded entry from the catalog, not a guess |
| a 41-piece serving | fails the rails, never written silently |
| anything | logged with ≤ 1 tap, and Undo works |

## 7. Build order

1. ~~`foodSanityRails.js`~~ — **done.** Pure, free, testable.
2. ~~Dish splitting: meal words and commas split; `with`/`and` do not.~~ — **done**, and
   confirmed live: the nachos line logs as one entry.
3. ~~`POST /api/logs/describe`~~ — **done**, and reachable from the UI since 2026-09-16.
4. **History reuse — half done.** The describe path has its own (`findInHistory`, hit before
   any model call). The *search ranker's* `chosenForQuery` pin is still unwired: `foodRanker`
   reads it, `getPersonalIndex` hands it an empty Set, and nothing records which food was
   chosen for which query. That is the last piece of the search rebuild.
5. ~~One input on Food Log and `/food-search`~~ — **done.** Describing is the primary action
   and Enter fires it; search runs underneath on its own debounce.
   **Voice is deliberately NOT built** (Chef, 2026-09-16): phone keyboards already dictate
   into any text field, so a `SpeechRecognition` implementation would be re-doing the OS's
   job worse. The plain input gets voice for free.
6. ~~Background judge on a pinned second provider.~~ — **done**, still pinned to
   `openai/gpt-oss-120b` on purpose; see `DISH_JUDGE_PROVIDER` for why a `need` is wrong
   there until the golden set exists.

Search stays exactly where it is, as the fallback.

## 8. What the live run exposed

Two findings from the first real end-to-end run that no mock could have produced.

**The model cannot express its own uncertainty.** Asked for a genuine range, `allam-2-7b`
returned `0–1000` for the pancakes and `0–2400` for the nachos — a zero lower bound, and an
upper that is just twice the estimate. §3.8's spread threshold passes happily on that, and
the question would have offered "Smaller · ~0 cal". `usableRange` now refuses a range whose
low is not above zero, whose high is not above the low, or that does not contain the logged
value; an unusable range is treated as no opinion and nothing is asked.

**`structured:fast` currently resolves to that same model.** aiGeek picked `allam-2-7b`
because it is the only free row the probe has proved can emit JSON, and its `why` says
"speed not measured yet". It also answered a plain English prompt in Arabic. Both are the
golden set's absence showing through: nothing measures whether a structured model is any
*good*, only that it is structured (`DOCS/AIGEEK_CAPABILITY_ROUTING.md` §3.2). The estimates
are within Chef's stated bar — 500 cal for four pancakes is noise at the week level — but
this is the argument for building the golden set, written down while it is concrete.

## 9. Saved meals and foods come first (2026-09-22)

> "AI searches should prioritize saved foods/meals. I.e., if I have homemade quesadilla saved
> as a meal/food, it should use that before guessing at something else." — Chef

**What was true before.** Saved MEALS were read by nothing on this path. Saved foods were
reached only through `findInHistory`, which treats every user-owned `FoodItem` alike and
strips "homemade"/"my" as noise — so with a saved meal called "Homemade Quesadilla" in place,
describing "homemade quesadilla" token-matched an old row called "Quesadillas" (1,680 cal per
100 g) instead. And "2 homemade quesadillas" missed history entirely (the quantity is part of
the history key) and went to the model.

**What is true now.** A step 0 runs before history (`savedItemMatcher.js`):

- A saved meal, or a saved food whose name says "homemade", matches when its significant words
  EQUAL the described entry's (dish + `with` components, order-free, singularised).
- A "homemade" in the saved name must be in the text, or pointed at with "my". Bare
  "quesadilla" does not become the homemade one.
- Equality, not subset: the describe path mints rows called "chicken" and "cheese", and a
  subset rule would log "chicken caesar salad" as a side of chicken. The cost is that
  "homemade quesadilla with extra guac" falls through to the normal path. A miss, not a wrong
  answer.
- Only "homemade"-named saved foods are eligible, because a describe-minted custom row can
  hold a TOTAL ("a dozen nachos" → one row) and multiplying it by a new quantity is the double
  count. Every other saved food is still reached by history, as before.
- A saved meal logs as its component foods, the way the gateway's `logMeal` does, with the
  same `notes: "Added from meal: <name>"` caption that FoodLogItem already shows. The quantity
  multiplies every component. The meal type is the described one. A missing component is
  skipped by name, never dropped. Response rows carry `source: 'saved-meal'` +
  `savedMeal: {id, name}`, or `source: 'saved-food'`.
- One entry can now be several rows, so each logged/skipped row carries `entryIndex`. The
  invariant is per entry: every index below `requested` appears on at least one row.

**Not done:** the describe toast still says "7 items · N cal" (one per component) for a saved meal rather than
naming it (frontend, deliberately untouched on this branch); unified *search* still returns
foods only, never saved meals.

**Names with "and" (same day, second pass).** Half his saved meals have "and" in the name
("Fat Boy's Burger and Fries", "El P's Rachero and Marg"), and the parser splits a top-level
`and` before matching. Runs of consecutive entries from the same segment (never across a
comma or meal word) are now rejoined and matched against meals, longest run first; the rest
resolve normally, so "fat boy's burger and fries and a coke" is the meal plus a coke. The
first entry's quantity is the meal's; a quantity on a later entry breaks the span. Rows from a
span carry `entryIndexes` so every consumed entry stays accounted for. Eating verbs and "i"
("I had my regular home breakfast") are ignored for saved matching.
