# FitnessGeek — Describe and Log

*Agreed with Chef 2026-09-15. Supersedes search as the primary path.*

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

1. `foodSanityRails.js` — pure, free, testable. Catches today's screenshot bug.
2. Dish splitting: meal words and commas split; `with`/`and` do not.
3. `POST /api/logs/describe` — route (barcode/branded → lookup) → history → estimate → rails → write.
4. History reuse (finally wires `chosenForQuery`).
5. One input on Food Log and `/food-search`, voice on phone.
6. Background judge on a pinned second provider.

Search stays exactly where it is, as the fallback.
