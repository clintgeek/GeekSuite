/**
 * aiNeedResolver — turning "what this call needs" into "which model answers it".
 *
 * The problem this exists for (DOCS/AIGEEK_CAPABILITY_ROUTING.md §1): aiGeek
 * could already tell you the best model for a task and nothing asked it at call
 * time. Every caller either pinned a literal model or rode blind rotation,
 * which is how FitnessGeek spent a day pinned to slugs the vendor had retired.
 *
 * A caller says `need: 'structured:fast'` instead of `model: 'openai/gpt-oss-120b'`.
 * Two axes, because they are the two decisions that actually differ: the *task*,
 * and the *weight* — whether a person is waiting.
 *
 * ── What this deliberately does NOT read ────────────────────────────────────
 *
 * `capabilities.performance.*` and `capabilities.tasks.*`, which are the fields
 * a reader would expect a capability router to use. Both are untrustworthy, in
 * different ways, and routing on them would be worse than not routing:
 *
 *   - `performance.*` is string-matched off the model ID
 *     (`aiModelCapabilitiesService.js`: "70b" or "405b" → excellent, "8b" →
 *     ultra-fast). On 2026-09-15 that rated a *retired* 405B slug
 *     state-of-the-art, while `openai/gpt-oss-120b` — measurably the best
 *     answers of anything tested — matched no pattern and got defaults.
 *   - `capabilities.tasks.*` looks richer than it is. Read the assignments:
 *     `structuredOutput`, `codeGeneration` and `creativeWriting` are set `true`
 *     for every model and only ever turned *off* for whisper and guard models,
 *     and `tasks.reasoning` is `false` unless the id contains "70b"/"405b". It
 *     is a constant wearing a capability's name. Filtering on it would feel
 *     like capability routing while changing nothing.
 *
 * So this reads only measured or vendor-stated facts: `fitness` (the probe
 * extracted JSON from this row, or it did not), `latency.p50Ms` (timed, by the
 * probe, over five runs), cooling and observed rate limits (measured), and
 * `isFree`.
 *
 * ── Quality, measured ───────────────────────────────────────────────────────
 *
 * `fitness` says a row CAN emit JSON. It does not say the JSON is any good, and
 * on 2026-09-16 that gap had a cost: twenty-two rows tied for `structured:fast`,
 * the tie fell to last-success, and the work went to `groq/allam-2-7b` — which
 * answered a plain English prompt in Arabic and offered "0 to 1000" as its
 * uncertainty about a plate of pancakes.
 *
 * `quality.score` is the golden set's answer to that: six questions with known
 * answers, scored by code (`aiGoldenSet.js`). It outranks everything else here,
 * because a fast wrong answer is worth less than a slow right one — the whole
 * point of asking was to get an answer.
 *
 * A row that has never been scored is NOT treated as a bad row. `null` means
 * unmeasured, and scoring it as zero would keep a new model out of selection
 * forever, so it could never be scored — the same trap `weightClassOf` avoids.
 * An unscored row sits between measured-good and measured-bad.
 *
 * ── The honest gap that remains ─────────────────────────────────────────────
 *
 * The task axis still has one member with a filter behind it: `structured`,
 * via `fitness`. `reasoning`, `prose`, `code` and `vision` are recorded and do
 * not filter — but the golden set's per-class scores now give `reasoning` and
 * `instruction` real signal to RANK on, which is most of the value.
 */
import { weightClassOf, qualityIsFresh } from '../models/AIFreeTier.js';

/** The task axis. Only `structured` is measurable today; see the header. */
export const NEED_TASKS = Object.freeze(['structured', 'reasoning', 'prose', 'code', 'vision']);

/** The weight axis: is a person waiting? */
export const NEED_WEIGHTS = Object.freeze(['fast', 'balanced', 'deep']);

/** The weight assumed when a caller names only a task. */
export const DEFAULT_WEIGHT = 'balanced';

/**
 * `'structured:fast'` → `{ task, weight }`, or `null` if it is not a need.
 *
 * Deliberately strict: an unknown task or weight is a caller bug, and quietly
 * treating `'strutured:fast'` as "no preference" would route the call
 * somewhere reasonable and hide the typo for months.
 */
export function parseNeed(need) {
  if (typeof need !== 'string' || !need.trim()) return null;
  const [task, weight = DEFAULT_WEIGHT, ...rest] = need.trim().toLowerCase().split(':');
  if (rest.length > 0) return null;
  if (!NEED_TASKS.includes(task)) return null;
  if (!NEED_WEIGHTS.includes(weight)) return null;
  return { task, weight };
}

/**
 * How well a row's *measured* speed class serves the requested weight.
 *
 * `unknown` sits mid-table on purpose. A row nobody has timed is not a slow
 * row, and scoring it as one would mean a newly discovered model could never
 * be picked for `fast` work — so it could never be timed, so it could never
 * stop being unknown. The probe breaks that loop, but only if the resolver
 * leaves the door open.
 *
 * For `deep`, every class scores the same: "slow is fine" means speed is not a
 * criterion, and inventing a preference here would be a guess.
 */
const WEIGHT_POINTS = Object.freeze({
  fast: { fast: 100, balanced: 40, deep: 0, unknown: 50 },
  balanced: { fast: 90, balanced: 100, deep: 30, unknown: 50 },
  deep: { fast: 50, balanced: 50, deep: 50, unknown: 50 },
});

/**
 * What a measured quality score is worth, relative to the weight axis.
 *
 * Deliberately larger than the whole weight range: a fast wrong answer is worth
 * less than a slow right one. A perfect score adds 150 where the weight axis
 * spans 100, so quality decides and speed breaks ties — which is the ordering
 * a person would choose if asked.
 */
export const QUALITY_POINTS = 150;

/** Where an unscored row sits: between measured-good and measured-bad. */
export const QUALITY_UNMEASURED = 0.5;

/**
 * The score this need should rank on: the matching class where the golden set
 * has one, else the overall.
 *
 * `structured:*` ranks on the structured class, `reasoning:*` on reasoning, and
 * so on — a model good at extraction and bad at arithmetic should win
 * extraction work and lose arithmetic work, which is exactly what per-class
 * scores are for.
 */
export function qualityFor(row, task, now = Date.now()) {
  if (!qualityIsFresh(row?.quality, now)) return null;
  const byClass = row.quality.byClass;
  const get = (key) => (byClass instanceof Map ? byClass.get(key) : byClass?.[key]);
  const perClass = get(task);
  const value = typeof perClass === 'number' ? perClass : row.quality.score;
  return typeof value === 'number' ? value : null;
}

/** A row the probe proved can emit JSON. Measured, not claimed. */
const isStructured = (row) => row?.fitness === 'structured';

/**
 * Why a row cannot serve this call at all, or `null` if it can.
 *
 * Every one of these is measured or stated, never inferred.
 */
export function exclusionFor(row, { now = Date.now(), allowPaid = false } = {}) {
  if (!row) return 'no_row';
  if (row.isFree === false && !allowPaid) return 'paid_not_allowed';
  if (row.override === 'deny') return 'denied';
  const coolingUntil = row.health?.coolingUntil ? new Date(row.health.coolingUntil).getTime() : 0;
  if (coolingUntil > now) return 'cooling';
  // The one case where we *know* a call would 429 rather than guessing.
  const observed = row.observed || {};
  const resetAt = observed.resetAt ? new Date(observed.resetAt).getTime() : 0;
  if (observed.remainingRequests === 0 && resetAt > now) return 'rate_limited';
  return null;
}

/**
 * Points for one row against one parsed need. `null` means "cannot serve".
 *
 * The task axis is a hard filter for `structured` and a tie-breaker otherwise:
 * a row the probe watched emit valid JSON has demonstrated it can follow an
 * instruction precisely, which is weak evidence but is *evidence*, unlike
 * anything in `capabilities.tasks`.
 */
export function scoreRow(row, need, { now = Date.now(), allowPaid = false } = {}) {
  if (exclusionFor(row, { now, allowPaid }) !== null) return null;
  if (need.task === 'structured' && !isStructured(row)) return null;

  const weightClass = weightClassOf(row.latency?.p50Ms) || 'unknown';
  let score = WEIGHT_POINTS[need.weight][weightClass];

  // Quality outranks speed. An unscored row scores mid-band rather than zero,
  // so a newly discovered model stays selectable long enough to be scored.
  const quality = qualityFor(row, need.task, now);
  score += Math.round((quality ?? QUALITY_UNMEASURED) * QUALITY_POINTS);

  // Weak, measured, and explicitly secondary to the weight axis.
  if (need.task !== 'structured' && isStructured(row)) score += 10;

  // Among equals, the row that answered most recently. Guards against picking
  // a row that is technically not cooling but has not served in weeks.
  const lastSuccess = row.health?.lastSuccessAt ? new Date(row.health.lastSuccessAt).getTime() : 0;
  return { score, lastSuccess };
}

/**
 * Pick a model for a need, or return `null` to mean "no opinion".
 *
 * `null` is a real answer and the caller must honour it by falling through to
 * the ordinary rotation: a resolver that always names something would, on a
 * bad day, name the least-bad row and present a guess as a decision.
 *
 * @param {object[]} rows   AIFreeTier-shaped rows (plain objects are fine)
 * @param {string}   need   e.g. 'structured:fast'
 * @returns {{provider, modelId, task, weight, why}|null}
 */
export function resolveNeed(rows, need, { now = Date.now(), allowPaid = false } = {}) {
  const parsed = parseNeed(need);
  if (!parsed) return null;

  let best = null;
  for (const row of rows || []) {
    const scored = scoreRow(row, parsed, { now, allowPaid });
    if (!scored) continue;
    if (
      !best
      || scored.score > best.scored.score
      || (scored.score === best.scored.score && scored.lastSuccess > best.scored.lastSuccess)
    ) {
      best = { row, scored };
    }
  }
  if (!best) return null;

  const weightClass = weightClassOf(best.row.latency?.p50Ms) || 'unknown';
  const quality = qualityFor(best.row, parsed.task, now);
  const why = [
    parsed.task === 'structured'
      ? 'probe extracted JSON from this row'
      : `task "${parsed.task}" has no measured discriminator yet — not filtered`,
    weightClass === 'unknown'
      ? 'speed not measured yet'
      : `measured p50 ${best.row.latency.p50Ms}ms (${weightClass})`,
    quality === null
      ? 'golden set not run against this row yet'
      : `golden set ${quality} on ${parsed.task}`,
  ];

  return {
    provider: best.row.provider,
    modelId: best.row.modelId,
    task: parsed.task,
    weight: parsed.weight,
    why,
  };
}

export default { parseNeed, resolveNeed, scoreRow, exclusionFor, qualityFor, NEED_TASKS, NEED_WEIGHTS };
