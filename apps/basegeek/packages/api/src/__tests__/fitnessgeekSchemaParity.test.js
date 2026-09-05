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

const { default: MedicationGraphQL } = await import(
  '../graphql/fitnessgeek/models/Medication.js'
);
const { default: MedicationRest } = await import(
  '../../../../../fitnessgeek/backend/src/models/Medication.js'
);
const { default: medicationShared } = await import('@geeksuite/schemas/fitnessgeek/medication');

const { default: LoginStreakGraphQL } = await import(
  '../graphql/fitnessgeek/models/LoginStreak.js'
);
const { default: LoginStreakRest } = await import(
  '../../../../../fitnessgeek/backend/src/models/LoginStreak.js'
);
const { default: loginStreakShared } = await import('@geeksuite/schemas/fitnessgeek/loginStreak');

const { default: WeightGoalsGraphQL } = await import(
  '../graphql/fitnessgeek/models/WeightGoals.js'
);
const { default: WeightGoalsRest } = await import(
  '../../../../../fitnessgeek/backend/src/models/WeightGoals.js'
);
const { default: weightGoalsShared } = await import('@geeksuite/schemas/fitnessgeek/weightGoals');

const { default: NutritionGoalsGraphQL } = await import(
  '../graphql/fitnessgeek/models/NutritionGoals.js'
);
const { default: NutritionGoalsRest } = await import(
  '../../../../../fitnessgeek/backend/src/models/NutritionGoals.js'
);
const { default: nutritionGoalsShared } = await import(
  '@geeksuite/schemas/fitnessgeek/nutritionGoals'
);

const { default: MealGraphQL } = await import('../graphql/fitnessgeek/models/Meal.js');
const { default: MealRest } = await import(
  '../../../../../fitnessgeek/backend/src/models/Meal.js'
);
const { default: mealShared } = await import('@geeksuite/schemas/fitnessgeek/meal');

// Not under test here — imported only so `FoodItem` is registered on the
// gateway's connection, because `Meal`'s list statics `.populate()` its ref.
// (Pair 8; it still declares its own schema today.)
const { default: FoodItemGraphQL } = await import('../graphql/fitnessgeek/models/FoodItem.js');

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
    serializesVirtuals: true,
    ownerField: 'userId',
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
    serializesVirtuals: true,
    ownerField: 'userId',
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
  {
    name: 'Medication',
    Rest: MedicationRest,
    GraphQL: MedicationGraphQL,
    createSchema: medicationShared.createMedicationSchema,
    // `updatedAt` (camel) alongside `created_at` (snake) is what both shipped
    // copies declared. See the shared module's header before "fixing" it.
    expectedPaths: [
      'user_id',
      'display_name',
      'is_supplement',
      'med_type',
      'rxcui',
      'ingredient_name',
      'brand_name',
      'form',
      'route',
      'strength',
      'dose_value',
      'dose_unit',
      'sig',
      'times_of_day',
      'suggested_indications',
      'user_indications',
      'supply_start_date',
      'days_supply',
      'notes',
      'created_at',
      'updatedAt',
    ],
    // No virtual is declared; both copies still pass `virtuals: true`, so
    // mongoose's automatic `id` is serialized and nothing else is.
    expectedVirtuals: [],
    serializesVirtuals: true,
    ownerField: 'user_id',
    doc: () => ({
      user_id: OWNER,
      display_name: 'Metformin 500mg',
      med_type: 'rx',
      rxcui: '860975',
      times_of_day: ['morning', 'bedtime'],
      user_indications: ['type 2 diabetes'],
      supply_start_date: new Date('2026-09-01T00:00:00.000Z'),
      days_supply: 90,
      notes: 'post-consolidation probe',
    }),
    // times_of_day and days_supply are the ones a drifted copy would eat.
    probe: (doc) => ({
      times_of_day: [...doc.times_of_day],
      days_supply: doc.days_supply,
      rxcui: doc.rxcui,
      notes: doc.notes,
    }),
  },
  {
    name: 'LoginStreak',
    Rest: LoginStreakRest,
    GraphQL: LoginStreakGraphQL,
    createSchema: loginStreakShared.createLoginStreakSchema,
    // Four timestamp paths: `created_at`/`updated_at` by hand, plus
    // `createdAt`/`updatedAt` from `timestamps: true`. Both copies did this.
    expectedPaths: [
      'user_id',
      'current_streak',
      'longest_streak',
      'last_login_date',
      'streak_start_date',
      'created_at',
      'updated_at',
      'createdAt',
      'updatedAt',
    ],
    expectedVirtuals: [],
    serializesVirtuals: false,
    ownerField: 'user_id',
    doc: () => ({
      user_id: OWNER,
      current_streak: 6,
      longest_streak: 11,
      last_login_date: new Date('2026-09-05T00:00:00.000Z'),
      streak_start_date: new Date('2026-08-31T00:00:00.000Z'),
    }),
    probe: (doc) => ({
      current_streak: doc.current_streak,
      longest_streak: doc.longest_streak,
      streak_start_date: doc.streak_start_date,
    }),
  },
  {
    name: 'WeightGoals',
    Rest: WeightGoalsRest,
    GraphQL: WeightGoalsGraphQL,
    createSchema: weightGoalsShared.createWeightGoalsSchema,
    expectedPaths: [
      'user_id',
      'startWeight',
      'targetWeight',
      'startDate',
      'goalDate',
      'is_active',
      'created_at',
      'updated_at',
    ],
    expectedVirtuals: [],
    serializesVirtuals: false,
    ownerField: 'user_id',
    doc: () => ({
      user_id: OWNER,
      startWeight: 212.5,
      targetWeight: 185,
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      goalDate: new Date('2026-12-01T00:00:00.000Z'),
      is_active: true,
    }),
    probe: (doc) => ({
      startWeight: doc.startWeight,
      targetWeight: doc.targetWeight,
      goalDate: doc.goalDate,
      is_active: doc.is_active,
    }),
  },
  {
    name: 'NutritionGoals',
    Rest: NutritionGoalsRest,
    GraphQL: NutritionGoalsGraphQL,
    createSchema: nutritionGoalsShared.createNutritionGoalsSchema,
    // NOT `UserSettings.nutrition_goal` — a different collection with a
    // different field set. See the shared module's header.
    expectedPaths: [
      'user_id',
      'calories',
      'protein_grams',
      'carbs_grams',
      'fat_grams',
      'fiber_grams',
      'sugar_grams',
      'sodium_mg',
      'start_date',
      'end_date',
      'is_active',
      'created_at',
      'updated_at',
    ],
    expectedVirtuals: [],
    serializesVirtuals: false,
    ownerField: 'user_id',
    doc: () => ({
      user_id: OWNER,
      calories: 2100,
      protein_grams: 165,
      carbs_grams: 40,
      fat_grams: 140,
      fiber_grams: 25,
      sugar_grams: 30,
      sodium_mg: 2300,
      start_date: new Date('2026-09-01T00:00:00.000Z'),
      end_date: new Date('2026-12-01T00:00:00.000Z'),
      is_active: true,
    }),
    // Every macro is a path a drifted copy could have eaten silently.
    probe: (doc) => ({
      calories: doc.calories,
      protein_grams: doc.protein_grams,
      carbs_grams: doc.carbs_grams,
      fat_grams: doc.fat_grams,
      fiber_grams: doc.fiber_grams,
      sugar_grams: doc.sugar_grams,
      sodium_mg: doc.sodium_mg,
      end_date: doc.end_date,
    }),
  },
  {
    name: 'Meal',
    Rest: MealRest,
    GraphQL: MealGraphQL,
    createSchema: mealShared.createMealSchema,
    // The only model in the set with no schema options at all: `created_at`
    // and `updated_at` are ordinary declared paths, not `timestamps`.
    expectedPaths: [
      'user_id',
      'name',
      'meal_type',
      'food_items',
      'is_deleted',
      'created_at',
      'updated_at',
    ],
    expectedVirtuals: [],
    serializesVirtuals: false,
    ownerField: 'user_id',
    doc: () => ({
      user_id: OWNER,
      name: 'Post-consolidation probe bowl',
      meal_type: 'lunch',
      food_items: [
        { food_item_id: new mongoose.Types.ObjectId(), servings: 2 },
        { food_item_id: new mongoose.Types.ObjectId(), servings: 0.5 },
      ],
      is_deleted: false,
    }),
    // `food_items` is a DocumentArray of a shared sub-schema — the one path in
    // this set whose contents a drifted copy would eat item-by-item.
    probe: (doc) => ({
      name: doc.name,
      meal_type: doc.meal_type,
      is_deleted: doc.is_deleted,
      servings: doc.food_items.map((i) => i.servings),
      refs: doc.food_items.map((i) => String(i.food_item_id)),
    }),
  },
];

/** The filter that scopes a pair's probe rows to this run's owner. */
const ownerFilter = (pair) => ({ [pair.ownerField]: OWNER });

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

      // Which pairs opt into virtual serialization is itself part of the wire
      // contract, so assert the shipped answer either way.
      for (const m of [pair.Rest, pair.GraphQL]) {
        if (pair.serializesVirtuals) {
          expect(m.schema.options.toJSON).toEqual({ virtuals: true });
          expect(m.schema.options.toObject).toEqual({ virtuals: true });
        } else {
          expect(m.schema.options.toJSON).toBeUndefined();
          expect(m.schema.options.toObject).toBeUndefined();
        }
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
      await pair.GraphQL.deleteMany(ownerFilter(pair));
    });

    test('both models resolve to the same collection', () => {
      // The rollback claim depends on this: the collection is the contract, so
      // a half-switched deploy is indistinguishable at the database level.
      expect(pair.GraphQL.collection.name).toBe(pair.Rest.collection.name);
    });

    test('a document written by the REST model reads back whole through GraphQL', async () => {
      const doc = pair.doc();
      await RestSide.create(doc);

      const after = await pair.GraphQL.findOne(ownerFilter(pair)).lean();
      expect(after).toBeTruthy();
      expect(pair.probe(after)).toEqual(pair.probe(doc));
    });

    test('a document written by the GraphQL model reads back whole through REST', async () => {
      const doc = pair.doc();
      await pair.GraphQL.create(doc);

      const after = await RestSide.findOne(ownerFilter(pair)).lean();
      expect(after).toBeTruthy();
      expect(pair.probe(after)).toEqual(pair.probe(doc));
    });

    test('control: strict mode really does drop a path neither schema declares', async () => {
      // If this ever fails, strict mode is off and the two tests above prove
      // nothing — they would pass no matter how far the schemas drifted.
      await pair.GraphQL.findOneAndUpdate(
        ownerFilter(pair),
        { $set: { ...pair.doc(), not_a_real_field: 'nope' } },
        { upsert: true, new: true }
      );

      const after = await pair.GraphQL.findOne(ownerFilter(pair)).lean();
      expect(after).toBeTruthy();
      expect(after.not_a_real_field).toBeUndefined();
    });
  }
);

// ---------------------------------------------------------------------------
// Medication — the enums and bounds, enforced by both models
// ---------------------------------------------------------------------------

describe('Medication enums and bounds', () => {
  const { MED_TIME_OF_DAY, MED_TYPES, medicationBounds } = medicationShared;

  test('both models declare the shared enums, not a local copy', () => {
    for (const Model of [MedicationRest, MedicationGraphQL]) {
      const p = Model.schema.paths;
      expect(p.med_type.enumValues).toEqual([...MED_TYPES]);
      expect(p.med_type.options.default).toBe('rx');
      expect(p.times_of_day.caster.enumValues).toEqual([...MED_TIME_OF_DAY]);
    }
  });

  test('both models enforce the shared numeric bounds', () => {
    const { days_supply: DS, notes: NOTES } = medicationBounds;
    for (const Model of [MedicationRest, MedicationGraphQL]) {
      const p = Model.schema.paths;
      expect([p.days_supply.options.min, p.days_supply.options.max]).toEqual([DS.min, DS.max]);
      expect(p.notes.options.maxlength).toBe(NOTES.maxlength);
    }
  });

  test('an out-of-enum med_type is rejected by both, not silently coerced', () => {
    for (const Model of [MedicationRest, MedicationGraphQL]) {
      const err = new Model({
        user_id: OWNER,
        display_name: 'X',
        med_type: 'prescription',
      }).validateSync();
      expect(err && err.errors.med_type).toBeTruthy();
    }
  });

  test('an out-of-enum times_of_day slot is rejected by both', () => {
    for (const Model of [MedicationRest, MedicationGraphQL]) {
      const err = new Model({
        user_id: OWNER,
        display_name: 'X',
        times_of_day: ['noon'],
      }).validateSync();
      expect(err).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// LoginStreak — the shared instance method, against a real collection
// ---------------------------------------------------------------------------

describe('LoginStreak recordLogin (shared instance method)', () => {
  const { applyLoginToStreak } = loginStreakShared;
  const day = (y, m, d) => new Date(Date.UTC(y, m, d));
  const todayUtc = () => {
    const n = new Date();
    return day(n.getFullYear(), n.getMonth(), n.getDate());
  };

  afterEach(async () => {
    await LoginStreakGraphQL.deleteMany({ user_id: OWNER });
  });

  test('both models carry it, from the same implementation', () => {
    // Two separate `createLoginStreakSchema(mongoose)` calls, so these are two
    // function objects — but they are the same source, because they come from
    // the one factory. That is the property worth asserting: not that a method
    // by this name exists on both, but that neither side wrote its own.
    expect(typeof LoginStreakRest.schema.methods.recordLogin).toBe('function');
    expect(String(LoginStreakGraphQL.schema.methods.recordLogin)).toBe(
      String(LoginStreakRest.schema.methods.recordLogin)
    );
    expect(String(LoginStreakRest.schema.methods.recordLogin)).toContain('applyLoginToStreak');
  });

  test('it persists the incremented streak through the real collection', async () => {
    const doc = await LoginStreakGraphQL.create({
      user_id: OWNER,
      current_streak: 3,
      longest_streak: 3,
      last_login_date: new Date(todayUtc().getTime() - 24 * 60 * 60 * 1000),
    });

    await doc.recordLogin();

    const after = await LoginStreakGraphQL.findOne({ user_id: OWNER }).lean();
    expect(after.current_streak).toBe(4);
    expect(after.longest_streak).toBe(4);
    expect(new Date(after.last_login_date)).toEqual(todayUtc());
  });

  test('a gap resets it, and the reset persists', async () => {
    const doc = await LoginStreakGraphQL.create({
      user_id: OWNER,
      current_streak: 9,
      longest_streak: 9,
      last_login_date: day(2026, 0, 1),
    });

    await doc.recordLogin();

    const after = await LoginStreakGraphQL.findOne({ user_id: OWNER }).lean();
    expect(after.current_streak).toBe(1);
    expect(after.longest_streak).toBe(9);
  });

  test('the exported arithmetic matches what the method does', () => {
    // `applyLoginToStreak` is what the hermetic fitnessgeek suite asserts
    // against; this proves it is the same code the method runs.
    const plain = {
      current_streak: 3,
      longest_streak: 3,
      last_login_date: new Date(todayUtc().getTime() - 24 * 60 * 60 * 1000),
      streak_start_date: null,
    };
    applyLoginToStreak(plain);
    expect(plain.current_streak).toBe(4);
    expect(plain.last_login_date).toEqual(todayUtc());
  });
});

// ---------------------------------------------------------------------------
// The statics divergence is deliberate, and it survived the move
// ---------------------------------------------------------------------------

describe('ownership guards stayed app-side (statics policy)', () => {
  // DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md §3: fields, indexes, virtuals and
  // instance methods move into @geeksuite/schemas; statics do not, because the
  // gateway fails closed on an unscoped query while fitnessgeek's callers are
  // already past auth. Statics don't affect `schema.paths`, so the two writers
  // are free to disagree. These assertions are what makes that a decision
  // rather than an accident.
  let WeightGoalsRestSide;
  let NutritionGoalsRestSide;
  let MealRestSide;

  beforeAll(() => {
    // fitnessgeek's own schema — statics included, since they live on the
    // schema — bound to the in-memory connection on the same collection.
    WeightGoalsRestSide = WeightGoalsGraphQL.db.model(
      'WeightGoalsGuardProbe',
      WeightGoalsRest.schema,
      WeightGoalsGraphQL.collection.name
    );
    NutritionGoalsRestSide = NutritionGoalsGraphQL.db.model(
      'NutritionGoalsGuardProbe',
      NutritionGoalsRest.schema,
      NutritionGoalsGraphQL.collection.name
    );
    MealRestSide = MealGraphQL.db.model(
      'MealGuardProbe',
      MealRest.schema,
      MealGraphQL.collection.name
    );
  });

  afterEach(async () => {
    await MealGraphQL.deleteMany({});
  });

  test('the gateway refuses an unscoped getOrCreateStreak', async () => {
    await expect(LoginStreakGraphQL.getOrCreateStreak(undefined)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test.each(['getActiveWeightGoals', 'createWeightGoals', 'updateWeightGoals'])(
    'the gateway refuses an unscoped %s',
    async (name) => {
      await expect(WeightGoalsGraphQL[name](undefined, {})).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    }
  );

  test('fitnessgeek’s copy is unguarded, deliberately, and still works', async () => {
    // Not a bug to fix here: every fitnessgeek caller is post-auth. Tightening
    // it is the hardening follow-up the plan names (PRE-4), and it belongs in
    // a commit whose title says so.
    await expect(WeightGoalsRestSide.getActiveWeightGoals(undefined)).resolves.toBeNull();
  });

  test.each(['getActiveGoals', 'createGoals', 'updateGoals'])(
    'the gateway refuses an unscoped NutritionGoals.%s',
    async (name) => {
      await expect(NutritionGoalsGraphQL[name](undefined, {})).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    }
  );

  test('fitnessgeek’s NutritionGoals copy is unguarded, deliberately', async () => {
    await expect(NutritionGoalsRestSide.getActiveGoals(undefined)).resolves.toBeNull();
  });

  test('the two sides really are separate implementations', () => {
    expect(LoginStreakGraphQL.schema.statics.getOrCreateStreak).not.toBe(
      LoginStreakRest.schema.statics.getOrCreateStreak
    );
    for (const name of ['getActiveWeightGoals', 'createWeightGoals', 'updateWeightGoals']) {
      expect(WeightGoalsGraphQL.schema.statics[name]).not.toBe(
        WeightGoalsRest.schema.statics[name]
      );
    }
    for (const name of ['getActiveGoals', 'createGoals', 'updateGoals']) {
      expect(NutritionGoalsGraphQL.schema.statics[name]).not.toBe(
        NutritionGoalsRest.schema.statics[name]
      );
    }
    for (const name of ['getActiveMeals', 'getMealsByType', 'searchMeals']) {
      expect(MealGraphQL.schema.statics[name]).not.toBe(MealRest.schema.statics[name]);
    }
  });

  // -------------------------------------------------------------------------
  // Meal — divergence C4, asserted as a decision rather than described as one
  // -------------------------------------------------------------------------

  test('FoodItem is registered, so the populating statics can actually run', () => {
    // Guard for the three tests below: without this the `populate()` inside
    // fitnessgeek's list statics would throw MissingSchemaError and the
    // "returns everybody's meals" assertion would pass for the wrong reason.
    expect(FoodItemGraphQL.modelName).toBe('FoodItem');
  });

  test.each([
    ['getActiveMeals', []],
    ['getMealsByType', ['lunch']],
    ['searchMeals', ['bowl']],
    ['findOwned', [String(new mongoose.Types.ObjectId())]],
  ])('the gateway refuses an unscoped Meal.%s', async (name, args) => {
    await expect(MealGraphQL[name](...args, undefined)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('fitnessgeek’s Meal copy returns EVERY user’s meals when unscoped', async () => {
    // This is the divergence, not a bug being introduced: fitnessgeek's
    // statics scope only `if (userId)`. Every live caller passes one
    // (routes/mealRoutes.js:19, :21, :23 take it from the authenticated
    // request), so this is latent — but it is why neither side's statics were
    // promoted. Tightening this is its own ticket with its own test; if
    // someone does it, this assertion is what makes them say so.
    const other = String(new mongoose.Types.ObjectId());
    await MealGraphQL.create([
      { user_id: OWNER, name: 'Mine', meal_type: 'lunch' },
      { user_id: other, name: 'Somebody else’s', meal_type: 'dinner' },
    ]);

    const all = await MealRestSide.getActiveMeals(undefined);
    expect(all.map((m) => m.name).sort()).toEqual(['Mine', 'Somebody else’s']);

    const mine = await MealRestSide.getActiveMeals(OWNER);
    expect(mine.map((m) => m.name)).toEqual(['Mine']);
  });

  test('findOwned exists only on the gateway', () => {
    expect(typeof MealGraphQL.findOwned).toBe('function');
    expect(MealRest.schema.statics.findOwned).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// NutritionGoals — the shared instance methods, behaviour not presence
// ---------------------------------------------------------------------------

describe('NutritionGoals goal arithmetic (shared instance methods)', () => {
  const { evaluateGoalsMet, computeGoalProgress } = nutritionGoalsShared;

  const GOALS = {
    user_id: OWNER,
    calories: 2000,
    protein_grams: 150,
    carbs_grams: 50,
    fat_grams: 130,
    fiber_grams: 25,
    sugar_grams: 30,
    sodium_mg: 2300,
  };

  test('both models carry both methods, from the same implementation', () => {
    for (const name of ['checkGoalsMet', 'getProgress']) {
      expect(typeof NutritionGoalsRest.schema.methods[name]).toBe('function');
      expect(String(NutritionGoalsGraphQL.schema.methods[name])).toBe(
        String(NutritionGoalsRest.schema.methods[name])
      );
    }
    expect(String(NutritionGoalsRest.schema.methods.checkGoalsMet)).toContain(
      'evaluateGoalsMet'
    );
    expect(String(NutritionGoalsRest.schema.methods.getProgress)).toContain(
      'computeGoalProgress'
    );
  });

  test('sugar and sodium are ceilings while the other five are floors', () => {
    // The one piece of real logic in `checkGoalsMet`, and it was a trailing
    // comment on two lines in two files before it lived in one module.
    const totals = {
      calories: 2000,
      protein_grams: 150,
      carbs_grams: 50,
      fat_grams: 130,
      fiber_grams: 25,
      sugar_grams: 30,
      sodium_mg: 2300,
    };
    const onTheNose = evaluateGoalsMet(GOALS, totals);
    expect(onTheNose).toEqual({
      calories: true,
      protein: true,
      carbs: true,
      fat: true,
      fiber: true,
      sugar: true,
      sodium: true,
    });

    const overEverything = evaluateGoalsMet(GOALS, {
      ...totals,
      calories: 2500,
      sugar_grams: 31,
      sodium_mg: 2301,
    });
    expect(overEverything.calories).toBe(true); // more is better
    expect(overEverything.sugar).toBe(false); // more is worse
    expect(overEverything.sodium).toBe(false);
  });

  test('an unset goal reads as not-met and zero progress, not as met', () => {
    const bare = { user_id: OWNER };
    const totals = { calories: 9999, sugar_grams: 0 };
    expect(evaluateGoalsMet(bare, totals).calories).toBe(false);
    expect(evaluateGoalsMet(bare, totals).sugar).toBe(false);
    expect(computeGoalProgress(bare, totals).calories).toBe(0);
  });

  test('progress is clamped at 100 and matches the model’s own method', () => {
    const doc = new NutritionGoalsGraphQL(GOALS);
    const totals = {
      calories: 3000,
      protein_grams: 75,
      carbs_grams: 50,
      fat_grams: 0,
      fiber_grams: 25,
      sugar_grams: 15,
      sodium_mg: 1150,
    };
    const viaMethod = doc.getProgress(totals);
    expect(viaMethod).toEqual(computeGoalProgress(GOALS, totals));
    expect(viaMethod.calories).toBe(100); // clamped, not 150
    expect(viaMethod.protein).toBe(50);
    expect(viaMethod.fat).toBe(0);
    // Sugar and sodium are floors HERE even though they are ceilings in
    // checkGoalsMet. Shipped asymmetry, moved verbatim, asserted so nobody
    // "fixes" one without the other.
    expect(viaMethod.sugar).toBe(50);
    expect(viaMethod.sodium).toBe(50);
  });

  test('and the REST model’s method agrees with the GraphQL one', () => {
    const totals = { calories: 1000, protein_grams: 150, sugar_grams: 60, sodium_mg: 3000 };
    expect(new NutritionGoalsRest(GOALS).checkGoalsMet(totals)).toEqual(
      new NutritionGoalsGraphQL(GOALS).checkGoalsMet(totals)
    );
  });
});

// ---------------------------------------------------------------------------
// Meal — the sub-schema, the hook and the nutrition arithmetic
// ---------------------------------------------------------------------------

describe('Meal sub-schema, hook and getNutrition', () => {
  const { sumMealNutrition, MEAL_TYPES } = mealShared;

  const food = (over = {}) => ({
    food_item_id: {
      nutrition: {
        calories_per_serving: 100,
        protein_grams: 10,
        carbs_grams: 5,
        fat_grams: 4,
        fiber_grams: 2,
        sugar_grams: 1,
        sodium_mg: 200,
        ...over,
      },
    },
    servings: 1,
  });

  afterEach(async () => {
    await MealGraphQL.deleteMany({ user_id: OWNER });
  });

  test('both models embed the same food_items sub-schema', () => {
    const sub = (M) => M.schema.paths.food_items.schema;
    expect(Object.keys(sub(MealRest).paths).sort()).toEqual(
      Object.keys(sub(MealGraphQL).paths).sort()
    );
    expect(Object.keys(sub(MealGraphQL).paths).sort()).toEqual([
      '_id',
      'food_item_id',
      'servings',
    ]);
    expect(sub(MealGraphQL).paths.food_item_id.options.ref).toBe('FoodItem');
    expect(sub(MealGraphQL).paths.servings.options.default).toBe(1);
  });

  test('both models declare the shared meal_type enum', () => {
    for (const M of [MealRest, MealGraphQL]) {
      expect(M.schema.paths.meal_type.enumValues).toEqual([...MEAL_TYPES]);
    }
    const err = new MealGraphQL({ name: 'X', meal_type: 'brunch' }).validateSync();
    expect(err && err.errors.meal_type).toBeTruthy();
  });

  test('the pre(save) hook stamps updated_at on both sides', async () => {
    // The only hook either side declares. It fires on save() only — nothing
    // stamps updated_at on a findOneAndUpdate, on either side. Shipped
    // behaviour; see the shared module's header.
    const doc = await MealGraphQL.create({
      user_id: OWNER,
      name: 'Hook probe',
      meal_type: 'snack',
      updated_at: new Date('2020-01-01T00:00:00.000Z'),
    });
    expect(doc.updated_at.getFullYear()).toBeGreaterThan(2020);
  });

  test('getNutrition multiplies by servings and rounds to the shipped precision', () => {
    const items = [food(), { ...food(), servings: 2.5 }];
    const totals = sumMealNutrition(items);
    expect(totals).toEqual({
      calories: 350,
      protein_grams: 35,
      carbs_grams: 17.5,
      fat_grams: 14,
      fiber_grams: 7,
      sugar_grams: 3.5,
      sodium_mg: 700,
    });
    // Grams to one decimal, calories and sodium to the unit.
    expect(sumMealNutrition([{ ...food({ protein_grams: 3.33 }), servings: 1 }]).protein_grams)
      .toBe(3.3);
  });

  test('an un-populated or nutrition-less item contributes nothing, not NaN', () => {
    const zero = {
      calories: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0,
      fiber_grams: 0,
      sugar_grams: 0,
      sodium_mg: 0,
    };
    expect(sumMealNutrition([{ food_item_id: new mongoose.Types.ObjectId(), servings: 3 }]))
      .toEqual(zero);
    expect(sumMealNutrition([{ food_item_id: {}, servings: 3 }])).toEqual(zero);
    expect(sumMealNutrition([])).toEqual(zero);
    expect(sumMealNutrition(undefined)).toEqual(zero);
  });

  test('both models’ method is the shared implementation and agrees with it', () => {
    expect(String(MealGraphQL.schema.methods.getNutrition)).toBe(
      String(MealRest.schema.methods.getNutrition)
    );
    expect(String(MealRest.schema.methods.getNutrition)).toContain('sumMealNutrition');

    // Called against a stand-in `this` rather than a real document: assigning
    // a populated food item to an ObjectId path by hand would hit mongoose's
    // caster, and what is under test here is that the method body delegates.
    for (const M of [MealRest, MealGraphQL]) {
      const totals = M.schema.methods.getNutrition.call({
        food_items: [{ ...food(), servings: 2 }],
      });
      expect(totals.calories).toBe(200);
      expect(totals).toEqual(sumMealNutrition([{ ...food(), servings: 2 }]));
    }
  });
});
