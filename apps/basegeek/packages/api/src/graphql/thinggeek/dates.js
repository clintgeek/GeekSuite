/**
 * ThingGeek "expiring / due" arithmetic — DOCS/THINGGEEK_PLAN.md (dates power
 * "what's expiring or due?").
 *
 * Every rule lives here twice, on purpose, side by side: once in JS (for the
 * field resolvers: ThingDate.daysUntil/status, Thing.nextDue) and once as a
 * Mongo aggregation expression (for filters, facets, the nextDue sort and
 * thingAttention). thinggeekDates.test.js pins that the two agree.
 *
 * ## The occurrence that counts
 *
 * A stored date is an ANCHOR. For a one-off date the anchor is the
 * occurrence. For a recurring date (`recurEveryMonths` N) whose anchor is in
 * the past, what counts is the NEXT occurrence: anchor + k·N months for the
 * smallest k with occurrence ≥ today. Occurrences are always computed from
 * the anchor (never by repeatedly adding to the previous one), so month-end
 * clamping cannot drift (Jan 31 + 1 month = Feb 28, + 2 months = Mar 31).
 * Stored data is never rolled forward. Consequence: a recurring date is
 * never overdue — it simply comes due again.
 *
 * ## Today
 *
 * "Today" is the UTC calendar day, like every calendar date in the suite
 * (stored as UTC midnight). daysUntil = whole days from today; negative when
 * past.
 *
 * ## nextDue
 *
 * The occurrence with the smallest daysUntil ≥ 0; if every date is past, the
 * MOST overdue one (the earliest). No dates → null.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Status windows (days, inclusive). */
export const SOON_DAYS = 30;
export const UPCOMING_DAYS = 90;
export const YEAR_DAYS = 365;

/** The `due` facet/filter buckets, fixed order. Windows are cumulative from today; overdue is separate. */
export const DUE_BUCKETS = Object.freeze(['overdue', '30d', '90d', 'year']);
export const DUE_BUCKET_DAYS = Object.freeze({ '30d': SOON_DAYS, '90d': UPCOMING_DAYS, year: YEAR_DAYS });

export function todayUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Calendar month arithmetic with end-of-month clamping (Mongo's $dateAdd semantics). */
export function addMonthsClamped(date, months) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const targetY = y + Math.floor(m / 12);
  const targetM = ((m % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetY, targetM + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return new Date(Date.UTC(targetY, targetM, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
}

/** Month boundaries crossed from a to b (Mongo's $dateDiff unit 'month'). */
function monthDiff(a, b) {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

/** The occurrence of a stored date that counts today (see the module doc). */
export function occurrenceOf(d, today = todayUtc()) {
  const anchor = d?.date ? new Date(d.date) : null;
  if (!anchor || Number.isNaN(anchor.getTime())) return null;
  const every = Number(d.recurEveryMonths) || 0;
  if (every <= 0 || anchor >= today) return anchor;
  const m = Math.max(0, monthDiff(anchor, today));
  const k = Math.ceil(m / every);
  const first = addMonthsClamped(anchor, k * every);
  return first >= today ? first : addMonthsClamped(anchor, (k + 1) * every);
}

export function daysUntil(date, today = todayUtc()) {
  return Math.round((todayUtc(date).getTime() - today.getTime()) / DAY_MS);
}

export function statusOf(days) {
  if (days < 0) return 'overdue';
  if (days <= SOON_DAYS) return 'soon';
  if (days <= UPCOMING_DAYS) return 'upcoming';
  return 'later';
}

/** A stored date → its rendered ThingDate fields (the anchor stays `date`). */
export function renderDate(d, today = todayUtc()) {
  const occ = occurrenceOf(d, today);
  const days = occ ? daysUntil(occ, today) : 0;
  return { ...d, occursOn: occ, daysUntil: days, status: statusOf(days) };
}

/** The date that counts for "next due" (module doc), or null. */
export function nextDueOf(dates, today = todayUtc()) {
  const rendered = (dates ?? []).map((d) => renderDate(d, today)).filter((d) => d.occursOn);
  if (!rendered.length) return null;
  const upcoming = rendered.filter((d) => d.daysUntil >= 0).sort((a, b) => a.daysUntil - b.daysUntil);
  if (upcoming.length) return upcoming[0];
  return rendered.sort((a, b) => a.daysUntil - b.daysUntil)[0];
}

// ── The same rules as aggregation expressions ────────────────────────────────

/** Expression: the occurrence of one `dates` element bound as `$$d`. */
function occurrenceExpr(today) {
  const anchor = '$$d.date';
  const every = { $ifNull: ['$$d.recurEveryMonths', 0] };
  const m = { $max: [0, { $dateDiff: { startDate: anchor, endDate: today, unit: 'month' } }] };
  const k = { $ceil: { $divide: [m, { $max: [every, 1] }] } };
  const first = { $dateAdd: { startDate: anchor, unit: 'month', amount: { $multiply: [k, every] } } };
  const second = { $dateAdd: { startDate: anchor, unit: 'month', amount: { $multiply: [{ $add: [k, 1] }, every] } } };
  return {
    $cond: [
      { $or: [{ $lte: [every, 0] }, { $gte: [anchor, today] }] },
      anchor,
      { $cond: [{ $gte: [first, today] }, first, second] },
    ],
  };
}

/**
 * Stages adding `__occ` (every date's occurrence) and `__nextDue` to each
 * Thing. Filters, facets and the nextDue sort read these; they are projected
 * away before a Thing leaves the pipeline.
 */
export function occurrenceStages(today = todayUtc()) {
  return [
    {
      $addFields: {
        __occ: {
          $filter: {
            input: { $map: { input: { $ifNull: ['$dates', []] }, as: 'd', in: occurrenceExpr(today) } },
            as: 'o',
            cond: { $eq: [{ $type: '$$o' }, 'date'] },
          },
        },
      },
    },
    {
      $addFields: {
        __nextDue: {
          $ifNull: [
            { $min: { $filter: { input: '$__occ', as: 'o', cond: { $gte: ['$$o', today] } } } },
            { $min: '$__occ' },
          ],
        },
      },
    },
  ];
}

export const OCCURRENCE_FIELDS = Object.freeze({ __occ: 0, __nextDue: 0 });

/** Query clause: some occurrence in [from, to] (either end open when null). */
export function occurrenceIn(from, to) {
  const range = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  return { __occ: { $elemMatch: range } };
}

/** Query clause for one due bucket. */
export function dueBucketClause(bucket, today = todayUtc()) {
  if (bucket === 'overdue') return { __occ: { $elemMatch: { $lt: today } } };
  return occurrenceIn(today, addDays(today, DUE_BUCKET_DAYS[bucket]));
}

/** `due:Nd` / `expiring:Nd`: something falls due within N days, overdue included. */
export function dueWithinClause(days, today = todayUtc()) {
  return { __occ: { $elemMatch: { $lte: addDays(today, days) } } };
}
