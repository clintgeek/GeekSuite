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
 * That principle is about QUALITY specifically — whether a structured answer
 * is any good — and it does not extend to `vision` below. A model nobody has
 * scored yet might still turn out to be excellent; a model nobody has
 * confirmed can accept an image might still turn out to reject the request.
 * The two unknowns carry opposite risk, so they are handled oppositely.
 *
 * ── The task axis, updated ──────────────────────────────────────────────────
 *
 * Two members have a filter behind them now.
 *
 * `structured`, via `fitness` — the probe proved the row emits JSON.
 *
 * `vision`, via `AIFreeTier.acceptsImageInput` — the vendor's own listing said
 * whether the row accepts image input at all. This is a *different kind* of
 * filter than `structured`, and the difference matters: sending an image to a
 * model that cannot take one is not a quality question to rank on, it is a
 * hard API error on every single call, so unlike everything else in this
 * file, `null` (the vendor's listing never said) is scored the same as
 * `false` here rather than as "unmeasured, be generous". See
 * `models/AIFreeTier.js` for the full reasoning and the real consequence:
 * only OpenRouter's listing states input modality today, so every other
 * provider's rows are simply not `vision` candidates until their listings
 * start saying so.
 *
 * `reasoning`, `prose` and `code` are recorded and do not filter — but the
 * golden set's per-class scores now give `reasoning` and `instruction` real
 * signal to RANK on, which is most of the value.
 *
 * ── Compound needs, 2026-09-17 ──────────────────────────────────────────────
 *
 * The task axis used to be single-valued: a caller named exactly one of
 * `structured`, `reasoning`, `prose`, `code`, `vision`. Real work wants
 * combinations — the body-composition scan reader needs a model that can
 * both SEE the report image AND EMIT JSON, which is two requirements landing
 * on one slot.
 *
 * The first fix for that (§7.7 of the routing doc, shipped a day earlier) was
 * `scoreRow` making `vision` silently *imply* `structured` — reasonable once,
 * because at the time every vision caller in the suite wanted JSON back. It
 * did not generalise: the moment something wants prose ABOUT an image, or
 * reasoning over a document's contents, the implication is simply wrong for
 * that caller, and "loosen the one hard-coded pair" is not a design.
 *
 * So the grammar grew a second dimension instead: `need` may name one or more
 * tasks, joined by `+`, before the weight — `'vision+structured:balanced'`.
 * `parseNeed` returns `{ tasks: string[], weight }` rather than a single
 * `task` string; every caller below reads `need.tasks`, never a bare
 * `need.task`, and there is no implication left anywhere in `scoreRow` — a
 * bare `vision:*` filters on image input alone, exactly as `structured:*`
 * filters on JSON-capability alone, and asking for both is spelled out by
 * asking for both.
 *
 * A compound need is a hard AND on every named task's filter. `structured`
 * and `vision` are the two tasks with a filter behind them; naming
 * `reasoning`, `prose` or `code` inside a compound must not start filtering
 * on them just because they showed up next to a filtering task — they stay
 * rank-only, in a compound exactly as alone. See `scoreRow` below.
 */
import { weightClassOf, qualityIsFresh } from '../models/AIFreeTier.js';

/**
 * The task axis. `structured` and `vision` filter (see the header for why
 * they filter differently); `reasoning`, `prose` and `code` are recorded and
 * ranked on measured quality/latency only, not filtered.
 */
export const NEED_TASKS = Object.freeze(['structured', 'reasoning', 'prose', 'code', 'vision']);

/** The weight axis: is a person waiting? */
export const NEED_WEIGHTS = Object.freeze(['fast', 'balanced', 'deep']);

/** The weight assumed when a caller names only a task (or task compound). */
export const DEFAULT_WEIGHT = 'balanced';

/**
 * `'structured:fast'` → `{ tasks: ['structured'], weight: 'fast' }`, or
 * `'vision+structured:balanced'` → `{ tasks: ['vision', 'structured'],
 * weight: 'balanced' }`. Returns `null` if it is not a need at all.
 *
 * A single task is the common case and behaves exactly as it always has —
 * every existing caller sends this form and none of them may change
 * behaviour. A compound is one or more tasks joined by `+`, in the order the
 * caller wrote them; that order is preserved (not sorted) because it is
 * meant to be read back in `why`/provenance the way the caller wrote it, and
 * nothing here depends on a canonical order.
 *
 * Deliberately strict, on every part: an unknown task, an unknown weight, a
 * duplicated task, or an empty task slot (a stray `+`, e.g. `'vision+:fast'`
 * or `'vision++structured:fast'`) is a caller bug, and quietly treating any
 * of those as "no preference" would route the call somewhere plausible and
 * hide the typo for months — the same reasoning that made the single-task
 * form strict, extended to the new shape rather than relaxed for it.
 * `'vision+strutured:fast'` is `null`, not "vision, and something else we
 * shrugged at".
 */
export function parseNeed(need) {
  if (typeof need !== 'string' || !need.trim()) return null;
  const [taskPart, weight = DEFAULT_WEIGHT, ...rest] = need.trim().toLowerCase().split(':');
  if (rest.length > 0) return null;
  if (!NEED_WEIGHTS.includes(weight)) return null;
  if (!taskPart) return null;

  const tasks = taskPart.split('+');
  // Every slot must be a real, known task — `''` (from a stray leading,
  // trailing, or doubled `+`) is not one, and neither is a misspelling.
  if (tasks.some((task) => !NEED_TASKS.includes(task))) return null;
  // Naming the same task twice (`'vision+vision:fast'`) says nothing a
  // single mention would not, and is far more likely a copy-paste slip than
  // an intentional need — refused for the same reason a typo is.
  if (new Set(tasks).size !== tasks.length) return null;

  return { tasks, weight };
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
 * The score this need should rank on: the matching class(es) and the
 * overall, averaged.
 *
 * The first version of this ranked on the class alone, reasoning that a model
 * good at extraction and bad at arithmetic should win extraction work. The
 * first live scores showed why that is wrong here, in two ways.
 *
 * **The structured class is saturated.** Every row scored `structured=1` —
 * unsurprising, since a row only gets asked at all once `fitness` proved it
 * emits JSON, and the two structured questions are extraction questions. A
 * signal that is 1 for every candidate is a constant, and ranking on it is the
 * same mistake as ranking on `capabilities.tasks`. On 2026-09-16 that let
 * `allam-2-7b` — overall 0.4, numeracy 0, reasoning 0 — report "golden set 1
 * on structured" and keep the work.
 *
 * **And a class is rarely the whole job.** FitnessGeek's dish estimate is
 * nominally `structured`, but what it actually asks for is JSON *containing
 * arithmetic*: a model that emits perfect JSON with wrong numbers has failed
 * the task completely. Real prompts mix concerns.
 *
 * So: the class(es) named are the specialist signal, the overall is "not
 * broken elsewhere", and the mean of the two is what a person would weigh. A
 * specialist still beats a generalist within its class; a model that is
 * catastrophic outside its class no longer wins on the class alone.
 *
 * **Compound needs.** `tasks` may name more than one class
 * (`'vision+structured'`). `vision` itself has no golden-set class — the six
 * questions never asked a model to look at anything — so it never
 * contributes a class score; this only matters in practice for the other
 * axis in the pair. Where more than one named task DOES have a class score
 * (e.g. a future `structured+reasoning`), the specialist signal is the mean
 * of those class scores, not any single one — "the classes it was actually
 * asked to combine", generalising the single-task case exactly: with one
 * task named, "mean of the scores that exist" is just that one score.
 */
export function qualityFor(row, tasks, now = Date.now()) {
  if (!qualityIsFresh(row?.quality, now)) return null;
  const overall = row.quality.score;
  if (typeof overall !== 'number') return null;

  const byClass = row.quality.byClass;
  const get = (key) => (byClass instanceof Map ? byClass.get(key) : byClass?.[key]);

  const taskList = Array.isArray(tasks) ? tasks : [tasks];
  const perClassScores = taskList.map(get).filter((value) => typeof value === 'number');

  if (perClassScores.length === 0) return overall;
  const meanPerClass = perClassScores.reduce((sum, value) => sum + value, 0) / perClassScores.length;
  return (meanPerClass + overall) / 2;
}

/** A row the probe proved can emit JSON. Measured, not claimed. */
const isStructured = (row) => row?.fitness === 'structured';

/**
 * A row the vendor's own listing declared accepts image input.
 *
 * Deliberately strict equality to `true`: `false` and `null` (unknown) both
 * fail this check, because both mean the same thing to a caller about to send
 * an image — "do not". See `models/AIFreeTier.js` for why `vision` reads its
 * `null` this way when nothing else in this file does.
 */
const isVisionCapable = (row) => row?.acceptsImageInput === true;

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
 * The task axis is a hard filter for `structured` and `vision`, and a
 * tie-breaker otherwise. `structured`'s filter is evidence-based: a row the
 * probe watched emit valid JSON has demonstrated it can follow an
 * instruction precisely, which is weak evidence but is *evidence*, unlike
 * anything in `capabilities.tasks`. `vision`'s filter is not evidence about
 * quality at all — it excludes on the vendor's own modality claim, because a
 * wrong guess here is not a worse answer, it is a request the provider
 * refuses outright.
 *
 * `need.tasks` may name more than one task (§"Compound needs" in the header).
 * Every named task's filter — if it has one — must pass; there is
 * deliberately no cross-task implication here any more. Until 2026-09-17
 * this function made `vision` silently require `structured` too, reasoning
 * that nothing in the suite wanted a picture described rather than
 * transcribed. That stopped being true the moment a second kind of vision
 * call could exist, and hard-coding one compound as an exception to the
 * either/or was always going to be wrong for the next one — the fix is that
 * a caller wanting both says so (`vision+structured`), and a caller wanting
 * only sight gets only sight, exactly like every other task on this axis.
 */
export function scoreRow(row, need, { now = Date.now(), allowPaid = false } = {}) {
  if (exclusionFor(row, { now, allowPaid }) !== null) return null;

  // A hard AND: every named task that has a filter must pass it.
  // `reasoning` / `prose` / `code` have no `is*` check at all, so naming them
  // alongside a filtering task in a compound cannot accidentally start
  // filtering on them — there is simply nothing here that would.
  if (need.tasks.includes('structured') && !isStructured(row)) return null;
  if (need.tasks.includes('vision') && !isVisionCapable(row)) return null;

  const weightClass = weightClassOf(row.latency?.p50Ms) || 'unknown';
  let score = WEIGHT_POINTS[need.weight][weightClass];

  // Quality outranks speed. An unscored row scores mid-band rather than zero,
  // so a newly discovered model stays selectable long enough to be scored.
  const quality = qualityFor(row, need.tasks, now);
  score += Math.round((quality ?? QUALITY_UNMEASURED) * QUALITY_POINTS);

  // Weak, measured, and explicitly secondary to the weight axis. Unchanged by
  // compounding: this rewards a row that happens to be structured-capable
  // even when nothing asked for it, so it should not fire when `structured`
  // is already one of the named tasks (that case is already fully accounted
  // for by the filter and the quality term above).
  if (!need.tasks.includes('structured') && isStructured(row)) score += 10;

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
 * @param {string}   need   e.g. 'structured:fast', or a compound like
 *                          'vision+structured:balanced'
 * @returns {{provider, modelId, tasks, weight, why}|null}
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
  const quality = qualityFor(best.row, parsed.tasks, now);

  // One reason per named task, joined — for the common single-task need this
  // is exactly the one string it always was; for a compound it reads as "why
  // each half of the request is satisfied", in the order the caller named
  // them.
  const taskWhy = parsed.tasks.map((task) => (
    task === 'structured'
      ? 'probe extracted JSON from this row'
      : task === 'vision'
        ? 'vendor listing declared this row accepts image input'
        : `task "${task}" has no measured discriminator yet — not filtered`
  ));

  const why = [
    taskWhy.join('; '),
    weightClass === 'unknown'
      ? 'speed not measured yet'
      : `measured p50 ${best.row.latency.p50Ms}ms (${weightClass})`,
    quality === null
      ? 'golden set not run against this row yet'
      : `golden set ${Math.round(quality * 100) / 100} (overall ${best.row.quality.score})`,
  ];

  return {
    provider: best.row.provider,
    modelId: best.row.modelId,
    tasks: parsed.tasks,
    weight: parsed.weight,
    why,
  };
}

export default { parseNeed, resolveNeed, scoreRow, exclusionFor, qualityFor, NEED_TASKS, NEED_WEIGHTS };
