/**
 * The what-next features (gamegeek/library.js, bookgeek/library.js) hand the
 * model SHORT candidate ids — "c1".."cN" in payload order — and keep the real
 * ObjectIds to themselves. A 24-hex id is 24 chances for the model to typo
 * one, and one typo used to sink the whole answer (`reason: 'invalid'`).
 *
 * `salvagePicks` keeps what maps: in returned order, picks whose short id
 * resolves, deduped, capped at `limit`. `why` must be a string, else null.
 * Zero survivors means the answer was garbage and the caller falls back,
 * exactly as the old all-or-nothing validators did.
 *
 * Pure and AI-stack-free: same guarantee as the rest of catalog/ (the
 * notegeekSemantic import tripwire lists it).
 */

/** A candidate's short label in the model payload — "c1".."cN" in order. */
export const shortId = (index) => `c${ index + 1 }`;

/** shortToReal: Map<shortId, realId>. idField: 'gameId' | 'bookId'. */
export function salvagePicks(data, shortToReal, idField, limit) {
  const seen = new Set();
  const kept = [];
  const stats = { returned: 0, kept: 0, unknownIds: 0, duplicates: 0, overLimit: 0 };
  const raw = Array.isArray(data?.picks) ? data.picks : [];
  stats.returned = raw.length;
  for (const pick of raw) {
    const real = shortToReal.get(String(pick?.[idField] ?? ''));
    if (!real) { stats.unknownIds += 1; continue; }
    if (seen.has(real)) { stats.duplicates += 1; continue; }
    if (kept.length >= limit) { stats.overLimit += 1; continue; }
    seen.add(real);
    kept.push({ id: real, why: typeof pick?.why === 'string' ? pick.why : null });
  }
  stats.kept = kept.length;
  return { picks: kept, stats };
}
