/**
 * userSettingsSchemaParity.test.js — the tripwire for TODO_ORDER #21.
 *
 * fitnessgeek's `UserSettings` document has two writers pointed at ONE
 * collection in the `fitnessgeek` database:
 *
 *   REST    — apps/fitnessgeek/backend/src/routes/settingsRoutes.js
 *             via apps/fitnessgeek/backend/src/models/UserSettings.js
 *   GraphQL — apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js
 *             via ../graphql/fitnessgeek/models/UserSettings.js
 *
 * Most of the fitnessgeek frontend's REST settings calls are rewritten to
 * GraphQL by apiService.js, so in practice BOTH paths are live.
 *
 * Mongoose runs strict mode by default: an unknown path in a `$set` is dropped
 * silently, not rejected. So when the two schema copies drifted, writes through
 * the copy that didn't know a field returned HTTP 200 and wrote nothing. That
 * is exactly how `nutrition_goal.mode` / `nutrition_goal.keto` evaporated in
 * April 2026 (fixed by 2258236, root-caused here).
 *
 * Both models now build their schema from @geeksuite/schemas. These tests fail
 * the moment either one stops doing that.
 */

import mongoose from 'mongoose';

const { default: UserSettingsGraphQL } = await import(
  '../graphql/fitnessgeek/models/UserSettings.js'
);

// fitnessgeek's backend is CommonJS and lives in a sibling workspace package.
// Importing it here is the whole point: the tripwire has to compare the two
// REAL models, not two copies of the shared definition (which would be
// tautological). Node's ESM→CJS interop hands us the compiled model.
const { default: UserSettingsRest } = await import(
  '../../../../../fitnessgeek/backend/src/models/UserSettings.js'
);

const { default: sharedModule } = await import('@geeksuite/schemas/fitnessgeek/userSettings');
const { createUserSettingsSchema } = sharedModule;

const OWNER = String(new mongoose.Types.ObjectId());

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
  });
}

describe('UserSettings schema parity (tripwire)', () => {
  test('both models expose exactly the same schema paths', () => {
    const restKeys = Object.keys(UserSettingsRest.schema.paths).sort();
    const graphqlKeys = Object.keys(UserSettingsGraphQL.schema.paths).sort();

    // Named explicitly so a failure names the offending fields rather than
    // dumping two 80-element arrays.
    const onlyInRest = restKeys.filter((k) => !graphqlKeys.includes(k));
    const onlyInGraphQL = graphqlKeys.filter((k) => !restKeys.includes(k));

    expect({ onlyInRest, onlyInGraphQL }).toEqual({ onlyInRest: [], onlyInGraphQL: [] });
    expect(restKeys).toEqual(graphqlKeys);
    // Sanity: the comparison is not passing because both are empty.
    expect(restKeys.length).toBeGreaterThan(50);
  });

  test('both models agree on every path type, default, enum and index flag', () => {
    const mismatches = [];
    for (const key of Object.keys(UserSettingsRest.schema.paths)) {
      const a = describePath(UserSettingsRest.schema.paths[key]);
      const b = describePath(UserSettingsGraphQL.schema.paths[key]);
      if (a !== b) mismatches.push({ path: key, rest: a, graphql: b });
    }
    expect(mismatches).toEqual([]);
  });

  test('both models match the shared @geeksuite/schemas definition', () => {
    const shared = createUserSettingsSchema(mongoose);
    // `_id` and `__v` are added when a schema is compiled into a model, so
    // compare against the model-level paths minus those two.
    const sharedKeys = Object.keys(shared.paths).filter((k) => k !== '_id' && k !== '__v').sort();
    const strip = (m) =>
      Object.keys(m.schema.paths).filter((k) => k !== '_id' && k !== '__v').sort();

    expect(strip(UserSettingsRest)).toEqual(sharedKeys);
    expect(strip(UserSettingsGraphQL)).toEqual(sharedKeys);
  });
});

describe('UserSettings write-through (REST ⇄ GraphQL on one collection)', () => {
  // Bind fitnessgeek's OWN schema object to the in-memory connection, on the
  // same collection basegeek's model uses. This is the production topology:
  // two models, two schemas, one collection.
  let RestSide;

  beforeAll(() => {
    const conn = UserSettingsGraphQL.db;
    const collection = UserSettingsGraphQL.collection.name;
    RestSide = conn.model('UserSettingsRestSide', UserSettingsRest.schema, collection);
  });

  afterEach(async () => {
    await UserSettingsGraphQL.deleteMany({ user_id: OWNER });
  });

  test('a field written by the REST model survives a GraphQL $set', async () => {
    // REST writes keto config — the exact field pair that used to vanish.
    await RestSide.findOneAndUpdate(
      { user_id: OWNER },
      {
        $set: {
          'nutrition_goal.mode': 'keto',
          'nutrition_goal.keto.net_carb_limit_g': 17,
        },
      },
      { upsert: true, new: true }
    );

    // GraphQL then updates something unrelated through its own model.
    await UserSettingsGraphQL.updateSettings(OWNER, { units: { weight: 'kg' } });

    const after = await RestSide.findOne({ user_id: OWNER }).lean();
    expect(after.nutrition_goal.mode).toBe('keto');
    expect(after.nutrition_goal.keto.net_carb_limit_g).toBe(17);
    expect(after.units.weight).toBe('kg');
  });

  test('a field written by the GraphQL model survives a REST $set', async () => {
    await UserSettingsGraphQL.updateSettings(OWNER, {
      'nutrition_goal.keto.macro_split.fat_pct': 65,
      'healthBaselines.restingHR': 54,
    });

    await RestSide.findOneAndUpdate(
      { user_id: OWNER },
      { $set: { theme: 'dark' } },
      { upsert: true, new: true }
    );

    const after = await UserSettingsGraphQL.findOne({ user_id: OWNER }).lean();
    expect(after.nutrition_goal.keto.macro_split.fat_pct).toBe(65);
    expect(after.healthBaselines.restingHR).toBe(54);
    expect(after.theme).toBe('dark');
  });

  test('control: strict mode really does drop a path neither schema declares', async () => {
    // If this test ever fails, strict mode is off and the two tests above
    // prove nothing — they would pass no matter how far the schemas drifted.
    await UserSettingsGraphQL.updateSettings(OWNER, { not_a_real_setting: 'nope' });

    const after = await UserSettingsGraphQL.findOne({ user_id: OWNER }).lean();
    expect(after).toBeTruthy();
    expect(after.not_a_real_setting).toBeUndefined();
  });
});
