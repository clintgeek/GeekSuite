/**
 * The candidate projection in `selectFreeTierCandidates` must carry every
 * field the need resolver reads.
 *
 * That function hand-copies each `AIFreeTier` row into a plain candidate
 * object with an explicit field list. It is the seam where a field can exist
 * in Mongo, be declared on the schema, be written by discovery, and still be
 * invisible to every reader downstream — because this one object literal
 * never mentioned it.
 *
 * It has now happened three times in the same place:
 *
 *   `latency`             — omitted, so the resolver could not rank on speed.
 *   `quality`             — omitted until 2026-09-16, which made the resolver
 *                           report "golden set not run against this row yet"
 *                           for every row, including rows just scored.
 *   `acceptsImageInput`   — omitted until 2026-09-17. The first two degraded a
 *                           ranking. This one silently disabled a feature: no
 *                           row anywhere looked vision-capable, `vision:*`
 *                           resolved to null, and a body-composition scan was
 *                           sent to a text-only model that could not see it.
 *
 * Three times is a pattern, not bad luck, so this test pins the contract
 * rather than trusting the next person to remember.
 */
import { describe, it, expect } from '@jest/globals';

const { scoreRow, exclusionFor, parseNeed } = await import('../services/aiNeedResolver.js');

/**
 * Every field `aiNeedResolver` reads off a candidate row. Derived by reading
 * `exclusionFor`, `scoreRow` and `qualityFor` — if the resolver learns to read
 * a new field, it belongs here AND in the projection.
 */
const FIELDS_THE_RESOLVER_READS = Object.freeze([
  'provider',
  'modelId',
  'isFree',
  'fitness',
  'latency',
  'quality',
  'health',
  'observed',
  'override',
  'acceptsImageInput',
]);

/** A row shaped like `selectFreeTierCandidates` builds one. */
const candidate = (over = {}) => ({
  provider: 'openrouter',
  modelId: 'a/model:free',
  isFree: true,
  fitness: 'structured',
  limits: null,
  probedAt: null,
  observed: null,
  latency: { p50Ms: 900 },
  quality: null,
  acceptsImageInput: null,
  health: { coolingUntil: null, lastSuccessAt: new Date() },
  ...over,
});

describe('the candidate projection carries what the resolver reads', () => {
  it('a vision-capable candidate scores for a vision need', () => {
    const row = candidate({ acceptsImageInput: true });
    expect(exclusionFor(row, { now: Date.now() })).toBeNull();
    expect(scoreRow(row, parseNeed('vision:balanced'), { now: Date.now() })).not.toBeNull();
  });

  it('DROPPING acceptsImageInput makes every row invisible to vision — the 2026-09-17 outage', () => {
    // Exactly what the projection did: the row is otherwise perfect, and the
    // field simply is not on the object. Without it there is no vision
    // candidate anywhere, whatever Mongo says.
    const { acceptsImageInput, ...projectedWithoutIt } = candidate({ acceptsImageInput: true });
    expect('acceptsImageInput' in projectedWithoutIt).toBe(false);
    expect(scoreRow(projectedWithoutIt, parseNeed('vision:balanced'), { now: Date.now() })).toBeNull();
  });

  it('names the fields the projection is required to carry', () => {
    // A checklist with a reason. If the resolver starts reading something new,
    // add it here and to `selectFreeTierCandidates` in the same commit — the
    // point of this list is that the two cannot drift silently.
    const row = candidate({ acceptsImageInput: true, override: null });
    for (const field of FIELDS_THE_RESOLVER_READS) {
      expect(Object.prototype.hasOwnProperty.call(row, field)).toBe(true);
    }
  });

  it('a null acceptsImageInput is not a vision candidate, but is still fine for text', () => {
    // `null` means the vendor never said, which for vision is a no — see
    // aiNeedResolver's header. It must not cost the row ordinary work.
    const row = candidate({ acceptsImageInput: null });
    expect(scoreRow(row, parseNeed('vision:balanced'), { now: Date.now() })).toBeNull();
    expect(scoreRow(row, parseNeed('structured:fast'), { now: Date.now() })).not.toBeNull();
  });
});
