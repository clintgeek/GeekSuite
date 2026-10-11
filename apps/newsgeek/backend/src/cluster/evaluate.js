/**
 * Golden-set evaluation (N1 clustering, phase 1): given labelled candidate
 * pairs (candidates.js output with `label: "same" | "different"`), measure
 * every JOIN threshold on a grid, with and without the plan's guard, and
 * recommend one. Design + labelling rules: apps/newsgeek/DOCS/CLUSTERING.md.
 *
 * UNDER-MERGE (the plan): two cards for one event is a small annoyance; one
 * card for two events destroys trust. So the score is F0.5 (precision counts
 * twice as much as recall) and the recommendation is the threshold with the
 * best F0.5 among those with precision ≥ 0.97. Ties go to the HIGHER
 * threshold.
 *
 * WEIGHTS: the export samples cosine bands evenly, so high-cosine pairs are
 * heavily over-represented. Each pair's `weight` (pairs in its band / pairs
 * sampled from it) turns the sample back into population estimates; without
 * weights a precision of 0.97 on the sample can be far lower in production.
 * Pairs below the lowest band were never sampled: recall ignores any "same"
 * pair down there (a blind spot, written up in CLUSTERING.md).
 *
 * THE GUARD (plan "Clustering" step 3): a join also needs one SIGNIFICANT
 * shared term —
 *   - a word of ≥ 4 letters in BOTH titles that reads as a proper noun: it is
 *     capitalised somewhere in the pair's titles or excerpts other than at the
 *     start of a sentence, in a text that isn't Title Cased throughout
 *     ("Man Killed In Shooting" proves nothing about "Shooting"), and it is
 *     not on the short STOP list (weekdays, months, headline filler);
 *   - or a shared gazetteer place (`sharedPlaces`: text-matched, not
 *     inherited from the source, no state/country);
 *   - or a shared number in both titles (≥ 2 digits, not a year 1900–2099).
 * The plan's second clause (local stories must share a place) needs the
 * story's section, which only exists in phase 2; it is not measured here.
 */

export const MIN_PRECISION = 0.97;
export const BETA = 0.5;

/** The threshold grid: 0.60 … 0.95, step 0.01 (integers first, so no float drift). */
export function thresholdGrid(from = 60, to = 95) {
  const out = [];
  for (let i = from; i <= to; i += 1) out.push(i / 100);
  return out;
}

/** Capitalised words that are not evidence of one event. Lower case here. */
export const STOP = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'today', 'tonight', 'this', 'that', 'these', 'those', 'what', 'when', 'where', 'which', 'with', 'from', 'after',
  'before', 'over', 'into', 'about', 'will', 'would', 'could', 'should', 'have', 'here', 'there', 'their', 'they',
  'news', 'breaking', 'update', 'updated', 'live', 'watch', 'video', 'photos', 'report', 'exclusive', 'opinion',
  'editorial', 'obituary', 'obituaries', 'week', 'weekend', 'year', 'state', 'county', 'city', 'police', 'says',
]);

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu;

function words(text) {
  return String(text || '').match(WORD_RE) || [];
}

/** Lower-cased words of ≥ 4 letters in a title. */
function titleWords(title) {
  return new Set(words(title).filter((w) => w.length >= 4 && /\p{L}/u.test(w)).map((w) => w.toLowerCase().replace(/['’]s$/u, '')));
}

/**
 * Proper-noun-ish words in a text (lower-cased): capitalised, ≥ 4 letters,
 * not sentence-initial, not on STOP. A Title Cased text (≥ 60 % of its
 * ≥ 4-letter words capitalised, at least 3 of them) gives no evidence.
 */
export function properWords(text) {
  const s = String(text || '');
  const long = words(s).filter((w) => w.length >= 4 && /^\p{L}/u.test(w));
  const caps = long.filter((w) => /^\p{Lu}/u.test(w));
  if (long.length >= 3 && caps.length / long.length >= 0.6) return new Set();
  const out = new Set();
  WORD_RE.lastIndex = 0;
  let m;
  while ((m = WORD_RE.exec(s)) !== null) {
    const w = m[0];
    if (w.length < 4 || !/^\p{Lu}/u.test(w)) continue;
    const before = s.slice(0, m.index).trimEnd();
    if (before === '' || /[.!?:;"“]$/u.test(before)) continue; // sentence-initial
    const key = w.toLowerCase().replace(/['’]s$/u, '');
    if (!STOP.has(key)) out.add(key);
  }
  return out;
}

/** Numbers in a title worth matching on: ≥ 2 digits, not a year. */
function titleNumbers(title) {
  return new Set(words(title).filter((w) => /^\d{2,}$/.test(w) && !/^(19|20)\d\d$/.test(w)));
}

/**
 * Does the pair pass the guard? Returns the evidence (for the report) or null.
 * @param {{ a: { title, excerpt }, b: { title, excerpt }, sharedPlaces?: string[] }} pair
 */
export function guardEvidence(pair) {
  if (pair.sharedPlaces?.length) return { kind: 'place', value: pair.sharedPlaces[0] };
  const ta = titleWords(pair.a?.title);
  const tb = titleWords(pair.b?.title);
  const proper = new Set([
    ...properWords(pair.a?.title), ...properWords(pair.b?.title),
    ...properWords(pair.a?.excerpt), ...properWords(pair.b?.excerpt),
  ]);
  for (const w of ta) if (tb.has(w) && proper.has(w)) return { kind: 'term', value: w };
  const nb = titleNumbers(pair.b?.title);
  for (const n of titleNumbers(pair.a?.title)) if (nb.has(n)) return { kind: 'number', value: n };
  return null;
}

function fBeta(p, r, beta = BETA) {
  if (p == null || r == null || (p === 0 && r === 0)) return 0;
  const b2 = beta * beta;
  return ((1 + b2) * p * r) / (b2 * p + r);
}

const round = (x, d = 4) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

/**
 * Measure one threshold grid over labelled pairs.
 * @param {object[]} pairs  candidates with `label`
 * @returns {{ labelled, same, different, skipped, weighted, withoutGuard: object[], withGuard: object[],
 *   recommendation: { withoutGuard, withGuard } }}
 */
export function evaluate(pairs, { grid = thresholdGrid(), minPrecision = MIN_PRECISION, weighted = true } = {}) {
  const labelled = [];
  let skipped = 0;
  for (const p of pairs) {
    if (p?.label === 'same' || p?.label === 'different') labelled.push(p);
    else skipped += 1;
  }
  const rows = labelled.map((p) => ({
    cosine: Number(p.cosine),
    same: p.label === 'same',
    w: weighted && Number(p.weight) > 0 ? Number(p.weight) : 1,
    guard: Boolean(guardEvidence(p)),
  }));

  function measure(useGuard) {
    return grid.map((t) => {
      let tp = 0; let fp = 0; let fn = 0;
      let nTp = 0; let nFp = 0; let nFn = 0;
      for (const r of rows) {
        const pred = r.cosine >= t - 1e-9 && (!useGuard || r.guard);
        if (pred && r.same) { tp += r.w; nTp += 1; } else if (pred) { fp += r.w; nFp += 1; } else if (r.same) { fn += r.w; nFn += 1; }
      }
      const precision = tp + fp > 0 ? tp / (tp + fp) : null;
      const recall = tp + fn > 0 ? tp / (tp + fn) : null;
      return {
        threshold: t,
        precision: round(precision),
        recall: round(recall),
        f05: round(fBeta(precision, recall)),
        counts: { tp: nTp, fp: nFp, fn: nFn },
      };
    });
  }

  function recommend(table) {
    const ok = table.filter((r) => r.precision != null && r.precision >= minPrecision && r.recall > 0);
    if (!ok.length) return null;
    return ok.reduce((best, r) => (r.f05 > best.f05 || (r.f05 === best.f05 && r.threshold > best.threshold) ? r : best));
  }

  const withoutGuard = measure(false);
  const withGuard = measure(true);
  return {
    labelled: labelled.length,
    same: rows.filter((r) => r.same).length,
    different: rows.filter((r) => !r.same).length,
    skipped,
    weighted,
    minPrecision,
    withoutGuard,
    withGuard,
    recommendation: { withoutGuard: recommend(withoutGuard), withGuard: recommend(withGuard) },
  };
}

/** Parse JSONL text; blank lines skipped; a bad line throws with its number. */
export function parseJsonl(text) {
  const out = [];
  String(text).split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try { out.push(JSON.parse(line)); } catch { throw new SyntaxError(`line ${i + 1} is not JSON`); }
  });
  return out;
}

export default { evaluate, guardEvidence, properWords, thresholdGrid, parseJsonl, MIN_PRECISION, STOP };
