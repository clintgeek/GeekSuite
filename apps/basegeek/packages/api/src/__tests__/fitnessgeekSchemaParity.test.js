/**
 * fitnessgeekSchemaParity.test.js — the table-driven tripwire for the
 * fitnessgeek model consolidation (DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md).
 *
 * fitnessgeek's backend and basegeek's GraphQL gateway declare Mongoose models
 * against THE SAME collections in the SAME `fitnessgeek` database. Mongoose
 * runs strict mode by default: an unknown path in a `$set` is dropped
 * silently, not rejected. So when two copies of a schema drift, writes through
 * the copy that doesn't know a field return HTTP 200 and persist nothing. That
 * is exactly how `nutrition_goal.keto` evaporated in April 2026.
 *
 * The field sets now live in @geeksuite/schemas and both models build from
 * them. This suite fails the moment either side stops doing that.
 *
 * `UserSettings` — the first pair, consolidated 2026-09-05 — has its own
 * dedicated suite (`userSettingsSchemaParity.test.js`) because its
 * write-through cases are about specific historical fields. This file is the
 * general harness: to add pair 3..10, add a row to PAIRS below.
 *
 * The fitnessgeek half of the tripwire is
 * `apps/fitnessgeek/backend/src/__tests__/models/sharedSchemaParity.test.js`.
 * That suite is hermetic (no Mongo, no network), so it does source-level
 * checks; the real two-model comparison and the write-through live here, on
 * the in-memory Mongo this package's jest globalSetup provides.
 */

import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// The pairs under test. Add a row per consolidated model.
// ---------------------------------------------------------------------------

const { default: WeightGraphQL } = await import('../graphql/fitnessgeek/models/Weight.js');
const { default: WeightRest } = await import(
  '../../../../../fitnessgeek/backend/src/models/Weight.js'
);
const { default: weightShared } = await import('@geeksuite/schemas/fitnessgeek/weight');

const { default: BloodPressureGraphQL } = await import(
  '../graphql/fitnessgeek/models/BloodPressure.js'
);
const { default: BloodPressureRest } = await import(
  '../../../../../fitnessgeek/backend/src/models/BloodPressure.js'
);
const { default: bpShared } = await import('@geeksuite/schemas/fitnessgeek/bloodPressure');

const OWNER = String(new mongoose.Types.ObjectId());

const PAIRS = [
  {
    name: 'Weight',
    Rest: WeightRest,
    GraphQL: WeightGraphQL,
    createSchema: weightShared.createWeightSchema,
    // Every declared path, so a silently-dropped one is named by the failure.
    expectedPaths: [
      'userId',
      'weight_value',
      'log_date',
      'notes',
      'created_at',
      'updated_at',
    ],
    expectedVirtuals: ['formatted_date'],
    // A document each side must accept and persist whole.
    doc: () => ({
      userId: OWNER,
      weight_value: 184.4,
      log_date: new Date('2026-09-05T00:00:00.000Z'),
      notes: 'post-consolidation probe',
    }),
    // The field a drifted copy would have eaten.
    probe: (doc) => ({ weight_value: doc.weight_value, notes: doc.notes }),
  },
  {
    name: 'BloodPressure',
    Rest: BloodPressureRest,
    GraphQL: BloodPressureGraphQL,
    createSchema: bpShared.createBloodPressureSchema,
    expectedPaths: [
      'userId',
      'systolic',
      'diastolic',
      'pulse',
      'log_date',
      'notes',
      'created_at',
      'updated_at',
    ],
    expectedVirtuals: ['formatted_date', 'status'],
    doc: () => ({
      userId: OWNER,
      systolic: 128,
      diastolic: 78,
      pulse: 61,
      log_date: new Date('2026-09-05T00:00:00.000Z'),
      notes: 'post-consolidation probe',
    }),
    probe: (doc) => ({ pulse: doc.pulse, notes: doc.notes }),
  },
];

// ---------------------------------------------------------------------------
// Helpers (lifted verbatim from userSettingsSchemaParity.test.js where they
// already existed, so the two suites describe a path the same way).
// ---------------------------------------------------------------------------

/** Stable, comparable description of a single schema path. */
function describePath(path) {
  const o = path.options || {};
  return JSON.stringify({
    instance: path.instance,
    enum: o.enum ? [].concat(o.enum) : undefined,
    default: typeof o.default === 'function' ? '[fn]' : o.default,
    required: !!o.required,
    index: !!o.index,
    unique: !!o.unique,
    sparse: !!o.sparse,
    trim: !!o.trim,
    ref: o.ref,
    min: o.min,
    max: o.max,
    maxlength: o.maxlength,
  });
}

/**
 * `describePath` only sees the path-level `index: true` flag, never a
 * `schema.index()` call — and a compound index is exactly the kind of thing
 * that can drift unnoticed while both processes race to create it.
 */
const describeIndexes = (schema) =>
  schema
    .indexes()
    .map(([keys, opts = {}]) =>
      JSON.stringify([
        keys,
        {
          unique: !!opts.unique,
          sparse: !!opts.sparse,
          expireAfterSeconds: opts.expireAfterSeconds,
        },
      ])
    )
    .sort();

const COMPILED_ONLY = new Set(['_id', '__v']);
const fieldKeys = (paths) => Object.keys(paths).filter((k) => !COMPILED_ONLY.has(k)).sort();

// ---------------------------------------------------------------------------
// Schema parity
// ---------------------------------------------------------------------------

describe.each(PAIRS.map((p) => [p.name, p]))(
  '%s schema parity (tripwire)',
  (name, pair) => {
    test('both models expose exactly the same schema paths', () => {
      const restKeys = fieldKeys(pair.Rest.schema.paths);
      const graphqlKeys = fieldKeys(pair.GraphQL.schema.paths);

      // Named explicitly so a failure points at the offending field.
      const onlyInRest = restKeys.filter((k) => !graphqlKeys.includes(k));
      const onlyInGraphQL = graphqlKeys.filter((k) => !restKeys.includes(k));

      expect({ onlyInRest, onlyInGraphQL }).toEqual({ onlyInRest: [], onlyInGraphQL: [] });
      // Sanity: not passing because both sides are empty, and not passing
      // because someone quietly dropped half the model.
      expect(restKeys).toEqual([...pair.expectedPaths].sort());
    });

    test('both models agree on every path type, default, bound and index flag', () => {
      const mismatches = [];
      for (const key of Object.keys(pair.Rest.schema.paths)) {
        const a = describePath(pair.Rest.schema.paths[key]);
        const b = describePath(pair.GraphQL.schema.paths[key]);
        if (a !== b) mismatches.push({ path: key, rest: a, graphql: b });
      }
      expect(mismatches).toEqual([]);
    });

    test('both models match the shared @geeksuite/schemas definition', () => {
      const shared = pair.createSchema(mongoose);
      const sharedKeys = fieldKeys(shared.paths);

      expect(fieldKeys(pair.Rest.schema.paths)).toEqual(sharedKeys);
      expect(fieldKeys(pair.GraphQL.schema.paths)).toEqual(sharedKeys);
    });

    test('both models declare exactly the same indexes', () => {
      // The rollback claim in DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md rests on
      // this: identical indexes mean neither process depends on an index the
      // other creates, so either side can be deployed or rolled back alone.
      expect(describeIndexes(pair.Rest.schema)).toEqual(describeIndexes(pair.GraphQL.schema));
      expect(describeIndexes(pair.Rest.schema)).toEqual(
        describeIndexes(pair.createSchema(mongoose))
      );
    });

    test('both models expose exactly the same virtuals, and serialize them', () => {
      const virtuals = (m) =>
        Object.keys(m.schema.virtuals)
          .filter((v) => v !== 'id')
          .sort();

      expect(virtuals(pair.Rest)).toEqual([...pair.expectedVirtuals].sort());
      expect(virtuals(pair.GraphQL)).toEqual([...pair.expectedVirtuals].sort());

      for (const m of [pair.Rest, pair.GraphQL]) {
        expect(m.schema.options.toJSON).toEqual({ virtuals: true });
        expect(m.schema.options.toObject).toEqual({ virtuals: true });
      }
    });
  }
);

// ---------------------------------------------------------------------------
// The BloodPressure `status` virtual — behaviour, not just presence
// ---------------------------------------------------------------------------

describe('BloodPressure `status` virtual behaviour', () => {
  // The ladder has real logic in it and it is on the wire (toJSON includes
  // virtuals on both sides), so asserting that a virtual named `status` exists
  // would prove nothing. These are the boundaries of every band.
  const CASES = [
    [110, 70, 'Normal'],
    [119, 79, 'Normal'],
    [120, 79, 'Elevated'],
    [129, 79, 'Elevated'],
    [130, 79, 'High Normal'],
    [139, 89, 'High Normal'],
    [140, 89, 'Stage 1'],
    [159, 99, 'Stage 1'],
    [160, 99, 'Stage 2'],
    [179, 109, 'Stage 2'],
    [180, 109, 'Crisis'],
    [190, 120, 'Crisis'],
    // Both numbers must clear a band's ceiling: a normal systolic with a
    // stage-1 diastolic reads as the worse of the two, not as Normal.
    [110, 95, 'Stage 1'],
  ];

  test.each(CASES)('%i/%i is %s on both models and the shared helper', (sys, dia, expected) => {
    const attrs = { userId: OWNER, systolic: sys, diastolic: dia, log_date: new Date() };
    expect(new BloodPressureRest(attrs).status).toBe(expected);
    expect(new BloodPressureGraphQL(attrs).status).toBe(expected);
    expect(bpShared.classifyBloodPressure(sys, dia)).toBe(expected);
  });

  test('the virtual is serialized by toJSON on both sides', () => {
    const attrs = {
      userId: OWNER,
      systolic: 145,
      diastolic: 88,
      log_date: new Date('2026-09-05T00:00:00.000Z'),
    };
    for (const Model of [BloodPressureRest, BloodPressureGraphQL]) {
      const json = new Model(attrs).toJSON();
      expect(json.status).toBe('Stage 1');
      expect(json.formatted_date).toBe('2026-09-05');
    }
  });

  test('the exported bounds are the bounds the schema actually enforces', () => {
    // fitnessgeek's zod request validator imports these same numbers, so this
    // is what stops the validator and the schema disagreeing about a legal
    // reading.
    const { bloodPressureBounds } = bpShared;
    for (const Model of [BloodPressureRest, BloodPressureGraphQL]) {
      const p = Model.schema.paths;
      expect(p.systolic.options.min).toBe(bloodPressureBounds.systolic.min);
      expect(p.systolic.options.max).toBe(bloodPressureBounds.systolic.max);
      expect(p.diastolic.options.min).toBe(bloodPressureBounds.diastolic.min);
      expect(p.diastolic.options.max).toBe(bloodPressureBounds.diastolic.max);
      expect(p.pulse.options.min).toBe(bloodPressureBounds.pulse.min);
      expect(p.pulse.options.max).toBe(bloodPressureBounds.pulse.max);
      expect(p.notes.options.maxlength).toBe(bloodPressureBounds.notes.maxlength);
    }
  });
});

// ---------------------------------------------------------------------------
// Write-through: REST ⇄ GraphQL on one collection
// ---------------------------------------------------------------------------

describe.each(PAIRS.map((p) => [p.name, p]))(
  '%s write-through (REST ⇄ GraphQL on one collection)',
  (name, pair) => {
    // Bind fitnessgeek's OWN schema object to the in-memory connection, on the
    // collection basegeek's model uses. This is the production topology: two
    // models, two schemas, one collection.
    let RestSide;

    beforeAll(() => {
      RestSide = pair.GraphQL.db.model(
        `${name}RestSide`,
        pair.Rest.schema,
        pair.GraphQL.collection.name
      );
    });

    afterEach(async () => {
      await pair.GraphQL.deleteMany({ userId: OWNER });
    });

    test('both models resolve to the same collection', () => {
      // The rollback claim depends on this: the collection is the contract, so
      // a half-switched deploy is indistinguishable at the database level.
      expect(pair.GraphQL.collection.name).toBe(pair.Rest.collection.name);
    });

    test('a document written by the REST model reads back whole through GraphQL', async () => {
      const doc = pair.doc();
      await RestSide.create(doc);

      const after = await pair.GraphQL.findOne({ userId: OWNER }).lean();
      expect(after).toBeTruthy();
      expect(pair.probe(after)).toEqual(pair.probe(doc));
    });

    test('a document written by the GraphQL model reads back whole through REST', async () => {
      const doc = pair.doc();
      await pair.GraphQL.create(doc);

      const after = await RestSide.findOne({ userId: OWNER }).lean();
      expect(after).toBeTruthy();
      expect(pair.probe(after)).toEqual(pair.probe(doc));
    });

    test('control: strict mode really does drop a path neither schema declares', async () => {
      // If this ever fails, strict mode is off and the two tests above prove
      // nothing — they would pass no matter how far the schemas drifted.
      await pair.GraphQL.findOneAndUpdate(
        { userId: OWNER },
        { $set: { ...pair.doc(), not_a_real_field: 'nope' } },
        { upsert: true, new: true }
      );

      const after = await pair.GraphQL.findOne({ userId: OWNER }).lean();
      expect(after).toBeTruthy();
      expect(after.not_a_real_field).toBeUndefined();
    });
  }
);
