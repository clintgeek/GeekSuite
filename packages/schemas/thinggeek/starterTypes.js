/**
 * Starter-type seeding and upgrading, shared by the gateway (which seeds a
 * household on its first `thingTypes`) and the backend's
 * scripts/migrate-containment.js (which upgrades a household seeded before
 * containment). Pure: callers do the reads and writes.
 *
 * Version 1 was the nine item types; version 2 (2026-09-26, containment)
 * gave every type a `kind` and added Location and Storage.
 */
const { STARTER_TYPES, STARTER_TYPES_VERSION, DEFAULT_THING_KIND } = require('./constants.js');

/** One starter type as a ThingType document for `householdId`. */
function starterTypeDoc(t, householdId) {
  return {
    householdId,
    key: t.key,
    name: t.name,
    icon: t.icon,
    kind: t.kind || DEFAULT_THING_KIND,
    builtIn: true,
    fields: t.fields.map((f) => ({
      key: f.key,
      label: f.label,
      kind: f.kind,
      choices: f.choices ?? [],
      unit: f.unit ?? null,
      identifier: Boolean(f.identifier),
      required: Boolean(f.required),
    })),
  };
}

/**
 * What upgrading a household's types from `fromVersion` needs, given the
 * types it has now (`[{ _id, key, kind? }]`):
 *   - setKind: every type with NO stored kind gets one — its starter's kind
 *     when its key is a starter key, else `item`. A kind already stored (the
 *     household's own choice) is never overwritten;
 *   - insert: the starter types introduced after `fromVersion` whose key the
 *     household doesn't have. Types from `fromVersion` or earlier that are
 *     missing were deleted by the household on purpose, and stay deleted.
 * Idempotent: running it on its own result asks for nothing.
 * @returns {{ setKind: Array<{ _id: unknown, key: string, kind: string }>, insert: object[] }}
 */
function starterTypeUpgrade(existing, fromVersion = 1) {
  const byKey = new Map(STARTER_TYPES.map((t) => [t.key, t]));
  const have = new Set((existing ?? []).map((t) => t.key));
  const setKind = (existing ?? [])
    .filter((t) => !t.kind)
    .map((t) => ({ _id: t._id, key: t.key, kind: byKey.get(t.key)?.kind || DEFAULT_THING_KIND }));
  const insert = STARTER_TYPES.filter((t) => (t.since ?? 1) > fromVersion && !have.has(t.key));
  return { setKind, insert };
}

module.exports = { STARTER_TYPES_VERSION, starterTypeDoc, starterTypeUpgrade };
