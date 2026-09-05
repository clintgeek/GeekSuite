/**
 * sharedSchemaParity.test.js — the fitnessgeek half of the model-consolidation
 * tripwire (DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md).
 *
 * Each model listed here has TWO writers pointed at ONE collection in the
 * `fitnessgeek` database:
 *
 *   REST    — this backend's controllers/routes, via src/models/<M>.js
 *   GraphQL — apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js,
 *             via that app's own <M> model
 *
 * Mongoose strict mode drops unknown paths from a `$set` silently, so a field
 * one copy didn't know about is accepted, logged as a success, and never
 * persisted — which is how keto config vanished in April 2026. The field sets
 * now live in @geeksuite/schemas and both models build from them.
 *
 * WHY THIS SUITE DOESN'T IMPORT BASEGEEK'S MODELS
 * ----------------------------------------------
 * This suite is deliberately hermetic (see jest.setup.js): no Mongo, no Redis,
 * no network. basegeek's models call `getAppConnection('fitnessgeek')` at
 * import time, which opens a real Mongoose connection — importing one here
 * would leave an open handle in a suite built to have none.
 *
 * So the split is:
 *   - here      — fitnessgeek's real models vs the shared definitions, plus a
 *                 source-level check that basegeek's copies still consume the
 *                 shared modules and declare no schema of their own.
 *   - basegeek  — src/__tests__/fitnessgeekSchemaParity.test.js imports BOTH
 *                 real models per pair, compares them path-by-path and
 *                 index-by-index, and proves the write-through on an in-memory
 *                 Mongo.
 *
 * `UserSettings` (the first pair) keeps its own suite next door; this one is
 * the general harness. To add pair 3..10, add a row to PAIRS.
 */

import { describe, test, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

import { createWeightSchema } from '@geeksuite/schemas/fitnessgeek/weight';
import {
  createBloodPressureSchema,
  bloodPressureBounds,
  classifyBloodPressure,
} from '@geeksuite/schemas/fitnessgeek/bloodPressure';
import {
  createMedicationSchema,
  MED_TIME_OF_DAY,
  MED_TYPES,
  medicationBounds,
} from '@geeksuite/schemas/fitnessgeek/medication';
import {
  createLoginStreakSchema,
  applyLoginToStreak,
} from '@geeksuite/schemas/fitnessgeek/loginStreak';
import { createWeightGoalsSchema } from '@geeksuite/schemas/fitnessgeek/weightGoals';
import {
  createNutritionGoalsSchema,
  evaluateGoalsMet,
  computeGoalProgress,
} from '@geeksuite/schemas/fitnessgeek/nutritionGoals';
import {
  createMealSchema,
  createMealItemSchema,
  sumMealNutrition,
  MEAL_TYPES,
} from '@geeksuite/schemas/fitnessgeek/meal';

import Weight from '../../models/Weight.js';
import BloodPressure from '../../models/BloodPressure.js';
import Medication from '../../models/Medication.js';
import LoginStreak from '../../models/LoginStreak.js';
import WeightGoals from '../../models/WeightGoals.js';
import NutritionGoals from '../../models/NutritionGoals.js';
import Meal from '../../models/Meal.js';
import { createBPSchema } from '../../validation/schemas/bloodPressure.js';
import { createMedicationSchema as createMedicationZodSchema } from '../../validation/schemas/medication.js';

// ESM has no __dirname; the source-level checks below resolve sibling files
// relative to this test file.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const basegeekModel = (name) =>
  path.resolve(
    __dirname,
    `../../../../../basegeek/packages/api/src/graphql/fitnessgeek/models/${name}.js`
  );

// `_id` and `__v` appear only once a schema is compiled into a model.
const COMPILED_ONLY = new Set(['_id', '__v']);
// Mongoose's own timestamps plugin installs this on every schema that renames
// or enables timestamps. It is not ours and it is not a divergence.
const MONGOOSE_BUILT_IN_METHODS = new Set(['initializeTimestamps']);
const fieldKeys = (paths) => Object.keys(paths).filter((k) => !COMPILED_ONLY.has(k)).sort();

const PAIRS = [
  {
    name: 'Weight',
    Model: Weight,
    createSchema: createWeightSchema,
    factory: 'createWeightSchema',
    specifier: '@geeksuite/schemas/fitnessgeek/weight',
    modelFile: '../../models/Weight.js',
    expectedPaths: ['userId', 'weight_value', 'log_date', 'notes', 'created_at', 'updated_at'],
    expectedVirtuals: ['formatted_date'],
    serializesVirtuals: true,
    expectedStatics: [],
  },
  {
    name: 'BloodPressure',
    Model: BloodPressure,
    createSchema: createBloodPressureSchema,
    factory: 'createBloodPressureSchema',
    specifier: '@geeksuite/schemas/fitnessgeek/bloodPressure',
    modelFile: '../../models/BloodPressure.js',
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
    expectedStatics: [],
  },
  {
    name: 'Medication',
    Model: Medication,
    createSchema: createMedicationSchema,
    factory: 'createMedicationSchema',
    specifier: '@geeksuite/schemas/fitnessgeek/medication',
    modelFile: '../../models/Medication.js',
    // `updatedAt` (camel) is not a typo: this model renames `createdAt` to
    // `created_at` and leaves `updatedAt` alone. Both shipped copies did, and
    // that is what is on disk. See the shared module's header.
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
    // No virtual is declared, but both copies pass `virtuals: true` — so
    // mongoose's automatic `id` virtual is serialized and nothing else is.
    expectedVirtuals: [],
    serializesVirtuals: true,
    expectedStatics: [],
  },
  {
    name: 'LoginStreak',
    Model: LoginStreak,
    createSchema: createLoginStreakSchema,
    factory: 'createLoginStreakSchema',
    specifier: '@geeksuite/schemas/fitnessgeek/loginStreak',
    modelFile: '../../models/LoginStreak.js',
    // Four timestamp paths: `created_at`/`updated_at` are declared by hand and
    // `createdAt`/`updatedAt` are added by `timestamps: true`. Both shipped
    // copies did this; see the shared module's header.
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
    expectedMethods: ['recordLogin'],
    expectedStatics: ['getOrCreateStreak'],
  },
  {
    name: 'WeightGoals',
    Model: WeightGoals,
    createSchema: createWeightGoalsSchema,
    factory: 'createWeightGoalsSchema',
    specifier: '@geeksuite/schemas/fitnessgeek/weightGoals',
    modelFile: '../../models/WeightGoals.js',
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
    expectedStatics: ['getActiveWeightGoals', 'createWeightGoals', 'updateWeightGoals'],
  },
  {
    name: 'NutritionGoals',
    Model: NutritionGoals,
    createSchema: createNutritionGoalsSchema,
    factory: 'createNutritionGoalsSchema',
    specifier: '@geeksuite/schemas/fitnessgeek/nutritionGoals',
    modelFile: '../../models/NutritionGoals.js',
    // NOT `UserSettings.nutrition_goal`, which is a nested sub-document on the
    // `usersettings` collection describing a *plan*. Different collection,
    // different field set, and `DailySummary` reads that one, not this.
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
    expectedMethods: ['checkGoalsMet', 'getProgress'],
    expectedStatics: ['getActiveGoals', 'createGoals', 'updateGoals'],
  },
  {
    name: 'Meal',
    Model: Meal,
    createSchema: createMealSchema,
    factory: 'createMealSchema',
    specifier: '@geeksuite/schemas/fitnessgeek/meal',
    modelFile: '../../models/Meal.js',
    // The only pair with no schema options at all: no `timestamps`, no
    // `toJSON`. `created_at`/`updated_at` are ordinary declared paths and a
    // `pre('save')` hook maintains the latter. See the shared module's header.
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
    expectedMethods: ['getNutrition'],
    // `findOwned` is basegeek-only. These three are this side's, and they
    // scope only `if (userId)` — divergence C4. Left alone deliberately.
    expectedStatics: ['getActiveMeals', 'getMealsByType', 'searchMeals'],
  },
];

describe.each(PAIRS.map((p) => [p.name, p]))(
  'fitnessgeek %s model tracks the shared schema',
  (name, pair) => {
    test('its paths are exactly the shared @geeksuite/schemas definition', () => {
      const shared = pair.createSchema(mongoose);

      const modelKeys = fieldKeys(pair.Model.schema.paths);
      const sharedKeys = fieldKeys(shared.paths);

      const onlyInModel = modelKeys.filter((k) => !sharedKeys.includes(k));
      const onlyInShared = sharedKeys.filter((k) => !modelKeys.includes(k));

      // Named so a failure points at the field rather than dumping both arrays.
      expect({ onlyInModel, onlyInShared }).toEqual({ onlyInModel: [], onlyInShared: [] });
      // Sanity: this is not passing because both sides are empty.
      expect(modelKeys).toEqual([...pair.expectedPaths].sort());
    });

    test('its indexes are exactly the shared definition’s', () => {
      const norm = (schema) =>
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

      expect(norm(pair.Model.schema)).toEqual(norm(pair.createSchema(mongoose)));
      // Not vacuous: each of these pairs carries one compound index.
      expect(norm(pair.Model.schema).length).toBeGreaterThan(0);
    });

    test('its virtuals are the shared definition’s, and they serialize', () => {
      const virtuals = Object.keys(pair.Model.schema.virtuals)
        .filter((v) => v !== 'id')
        .sort();
      expect(virtuals).toEqual([...pair.expectedVirtuals].sort());

      // Not every pair opts into virtual serialization, and which ones do is
      // itself part of the wire contract — `Weight`, `BloodPressure` and
      // `Medication` ship `virtuals: true`, `LoginStreak` and `WeightGoals`
      // do not. Assert the shipped answer either way rather than assuming one.
      if (pair.serializesVirtuals) {
        expect(pair.Model.schema.options.toJSON).toEqual({ virtuals: true });
        expect(pair.Model.schema.options.toObject).toEqual({ virtuals: true });
      } else {
        expect(pair.Model.schema.options.toJSON).toBeUndefined();
        expect(pair.Model.schema.options.toObject).toBeUndefined();
      }
    });

    test('its shared instance methods came across, and its statics stayed here', () => {
      // Instance methods move into @geeksuite/schemas (they mutate declared
      // paths, so a divergence corrupts data); statics stay app-side, because
      // the two writers deliberately disagree about ownership guards and
      // statics don't affect `schema.paths`.
      const methods = Object.keys(pair.Model.schema.methods)
        .filter((m) => !MONGOOSE_BUILT_IN_METHODS.has(m))
        .sort();
      expect(methods).toEqual([...(pair.expectedMethods || [])].sort());

      for (const name of pair.expectedStatics || []) {
        expect(typeof pair.Model[name]).toBe('function');
      }
    });

    test('the model file declares no schema of its own', () => {
      const src = fs.readFileSync(path.resolve(__dirname, pair.modelFile), 'utf8');
      expect(src).toContain(pair.specifier);
      expect(src).toMatch(new RegExp(`${pair.factory}\\s*\\(\\s*mongoose\\s*\\)`));
      expect(src).not.toMatch(/new\s+mongoose\.Schema\s*\(/);
    });
  }
);

describe.each(PAIRS.map((p) => [p.name, p]))(
  "basegeek's %s copy still consumes the shared schema",
  (name, pair) => {
    // Source-level, because importing the ESM model would open a connection.
    const file = basegeekModel(name);

    test('the model file exists', () => {
      expect(fs.existsSync(file)).toBe(true);
    });

    test('it imports @geeksuite/schemas and builds from the shared factory', () => {
      const src = fs.readFileSync(file, 'utf8');
      expect(src).toContain(pair.specifier);
      expect(src).toMatch(new RegExp(`${pair.factory}\\s*\\(\\s*mongoose\\s*\\)`));
    });

    test('it does not re-declare the schema inline', () => {
      // The failure mode this whole exercise exists to prevent: someone pastes
      // a schema literal back in and the two copies start drifting again.
      const src = fs.readFileSync(file, 'utf8');
      expect(src).not.toMatch(/new\s+mongoose\.Schema\s*\(\s*\{/);
    });
  }
);

describe('the two basegeek orphan models stay deleted', () => {
  // AIFoodPromptCache and MedicationLog were declared in basegeek's gateway
  // with zero consumers there — no resolver, no typeDef, no test. fitnessgeek
  // is the sole reader and writer of both collections. They were deleted on
  // 2026-09-05; a second declaration would put a second process back in the
  // race to create their indexes (AIFoodPromptCache carries a 45-day TTL).
  test.each(['AIFoodPromptCache', 'MedicationLog'])('%s is gone from the gateway', (name) => {
    expect(fs.existsSync(basegeekModel(name))).toBe(false);
  });
});

describe('the BloodPressure status virtual and bounds', () => {
  const CASES = [
    [110, 70, 'Normal'],
    [119, 79, 'Normal'],
    [120, 79, 'Elevated'],
    [130, 79, 'High Normal'],
    [140, 89, 'Stage 1'],
    [160, 99, 'Stage 2'],
    [180, 109, 'Crisis'],
    // Both numbers must clear a band's ceiling.
    [110, 95, 'Stage 1'],
  ];

  test.each(CASES)('%i/%i reads as %s through the real model', (sys, dia, expected) => {
    const doc = new BloodPressure({
      userId: 'u1',
      systolic: sys,
      diastolic: dia,
      log_date: new Date('2026-09-05T00:00:00.000Z'),
    });
    expect(doc.status).toBe(expected);
    expect(classifyBloodPressure(sys, dia)).toBe(expected);
    expect(doc.toJSON().status).toBe(expected);
    expect(doc.toJSON().formatted_date).toBe('2026-09-05');
  });

  test('the zod request validator enforces the shared bounds, not its own copy', () => {
    // src/validation/schemas/bloodPressure.js used to restate these four
    // numbers with a comment promising it mirrored the model. It now imports
    // `bloodPressureBounds`, so this asserts the two really are one thing.
    const ok = (systolic, diastolic) =>
      createBPSchema.safeParse({ systolic, diastolic }).success;

    const { systolic: SYS, diastolic: DIA } = bloodPressureBounds;

    expect(ok(SYS.min, DIA.min)).toBe(true);
    expect(ok(SYS.max, DIA.max)).toBe(true);
    expect(ok(SYS.min - 1, DIA.min)).toBe(false);
    expect(ok(SYS.max + 1, DIA.max)).toBe(false);
    expect(ok(SYS.min, DIA.max + 1)).toBe(false);

    // And the model agrees, path for path.
    const p = BloodPressure.schema.paths;
    expect([p.systolic.options.min, p.systolic.options.max]).toEqual([SYS.min, SYS.max]);
    expect([p.diastolic.options.min, p.diastolic.options.max]).toEqual([DIA.min, DIA.max]);
  });
});

describe('the Medication enums and bounds', () => {
  test('the zod request validator enforces the shared enums, not its own copies', () => {
    // src/validation/schemas/medication.js used to declare its own MED_TYPES
    // and TIME_OF_DAY arrays and its own days_supply/notes numbers. It now
    // imports them, so this asserts the two really are one thing.
    const ok = (body) =>
      createMedicationZodSchema.safeParse({ display_name: 'Metformin', ...body }).success;

    for (const t of MED_TYPES) expect(ok({ med_type: t })).toBe(true);
    expect(ok({ med_type: 'prescription' })).toBe(false);

    for (const slot of MED_TIME_OF_DAY) expect(ok({ times_of_day: [slot] })).toBe(true);
    expect(ok({ times_of_day: ['noon'] })).toBe(false);
    // The array cannot be longer than the enum it draws from.
    expect(ok({ times_of_day: [...MED_TIME_OF_DAY, 'morning'] })).toBe(false);

    const { days_supply: DS, notes: NOTES } = medicationBounds;
    expect(ok({ days_supply: DS.min })).toBe(true);
    expect(ok({ days_supply: DS.max })).toBe(true);
    expect(ok({ days_supply: DS.min - 1 })).toBe(false);
    expect(ok({ days_supply: DS.max + 1 })).toBe(false);
    expect(ok({ notes: 'x'.repeat(NOTES.maxlength) })).toBe(true);
    expect(ok({ notes: 'x'.repeat(NOTES.maxlength + 1) })).toBe(false);
  });

  test('and the model enforces exactly the same ones, path for path', () => {
    const p = Medication.schema.paths;
    expect(p.med_type.enumValues).toEqual([...MED_TYPES]);
    expect(p.med_type.options.default).toBe('rx');
    expect(p.times_of_day.caster.enumValues).toEqual([...MED_TIME_OF_DAY]);
    expect([p.days_supply.options.min, p.days_supply.options.max]).toEqual([
      medicationBounds.days_supply.min,
      medicationBounds.days_supply.max,
    ]);
    expect(p.notes.options.maxlength).toBe(medicationBounds.notes.maxlength);
  });

  test('a document rejects an out-of-enum value rather than storing it', () => {
    const bad = new Medication({ user_id: 'u1', display_name: 'X', med_type: 'prescription' });
    const err = bad.validateSync();
    expect(err && err.errors.med_type).toBeTruthy();
  });

  test('the last two hand-written copies of these enums are gone', () => {
    // Follow-ups carried over from pairs 3-5: `models/MedicationLog.js`
    // restated MED_TIME_OF_DAY, and `routes/medicationRoutes.js` had the
    // med_type list inline in two defaulting ternaries. Both now import.
    const read = (f) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

    const log = read('../../models/MedicationLog.js');
    expect(log).toContain('@geeksuite/schemas/fitnessgeek/medication');
    expect(log).not.toMatch(/\[\s*'morning'\s*,/);

    const routes = read('../../routes/medicationRoutes.js');
    expect(routes).toContain('@geeksuite/schemas/fitnessgeek/medication');
    expect(routes).not.toContain("'rx','otc','supplement'");
  });
});

describe('the LoginStreak arithmetic', () => {
  // `recordLogin` calls `this.save()`, so the shared module exports the same
  // arithmetic as `applyLoginToStreak(streak, now)` — which is what lets this
  // hermetic suite (no Mongo) assert the branches at all.
  const NOW = new Date(2026, 8, 5, 19, 30); // local 2026-09-05 19:30
  const day = (y, m, d) => new Date(Date.UTC(y, m, d));

  const base = (over = {}) => ({
    current_streak: 0,
    longest_streak: 0,
    last_login_date: null,
    streak_start_date: null,
    updated_at: null,
    ...over,
  });

  test('a first-ever login starts the streak at 1 and seeds the start date', () => {
    const s = applyLoginToStreak(base(), NOW);
    expect(s.current_streak).toBe(1);
    expect(s.longest_streak).toBe(1);
    expect(s.streak_start_date).toEqual(day(2026, 8, 5));
    expect(s.last_login_date).toEqual(day(2026, 8, 5));
  });

  test('a login the day after yesterday increments and keeps the start date', () => {
    const started = day(2026, 8, 1);
    const s = applyLoginToStreak(
      base({ current_streak: 4, longest_streak: 9, last_login_date: day(2026, 8, 4), streak_start_date: started }),
      NOW
    );
    expect(s.current_streak).toBe(5);
    expect(s.longest_streak).toBe(9); // not beaten yet
    expect(s.streak_start_date).toEqual(started);
  });

  test('beating the record raises longest_streak too', () => {
    const s = applyLoginToStreak(
      base({ current_streak: 9, longest_streak: 9, last_login_date: day(2026, 8, 4) }),
      NOW
    );
    expect(s.current_streak).toBe(10);
    expect(s.longest_streak).toBe(10);
  });

  test('a gap resets to 1 and re-seeds the start date, leaving longest alone', () => {
    const s = applyLoginToStreak(
      base({ current_streak: 7, longest_streak: 7, last_login_date: day(2026, 8, 1) }),
      NOW
    );
    expect(s.current_streak).toBe(1);
    expect(s.longest_streak).toBe(7);
    expect(s.streak_start_date).toEqual(day(2026, 8, 5));
  });

  test('a second login the same day changes neither counter', () => {
    const started = day(2026, 8, 1);
    const s = applyLoginToStreak(
      base({ current_streak: 5, longest_streak: 5, last_login_date: day(2026, 8, 5), streak_start_date: started }),
      NOW
    );
    expect(s.current_streak).toBe(5);
    expect(s.longest_streak).toBe(5);
    expect(s.streak_start_date).toEqual(started);
    expect(s.last_login_date).toEqual(day(2026, 8, 5));
  });

  test('"today" is the LOCAL calendar day stored at UTC midnight, not a UTC truncation', () => {
    // The regression this guards: `setUTCHours(0,0,0,0)` on the raw instant
    // would roll the day forward after ~18:00 US-Central. 19:30 local on the
    // 5th must still be the 5th.
    const s = applyLoginToStreak(base(), new Date(2026, 8, 5, 19, 30));
    expect(s.last_login_date.toISOString()).toBe('2026-09-05T00:00:00.000Z');
  });

  test('the real model carries recordLogin and it is the shared implementation', () => {
    const doc = new LoginStreak({ user_id: 'u1' });
    expect(typeof doc.recordLogin).toBe('function');
    // Same arithmetic, applied to the document directly (no save, no Mongo).
    applyLoginToStreak(doc, NOW);
    expect(doc.current_streak).toBe(1);
    expect(doc.last_login_date).toEqual(day(2026, 8, 5));
  });
});

describe("the deliberate statics divergence is still deliberate", () => {
  // §3 of DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md: statics stay app-side
  // precisely so the gateway can fail closed while this side stays post-auth.
  // If someone "helpfully" unifies them, that is a behaviour change and it
  // should have to delete these assertions to ship.
  test.each([
    ['LoginStreak', ['getOrCreateStreak']],
    ['WeightGoals', ['getActiveWeightGoals', 'createWeightGoals', 'updateWeightGoals']],
    ['NutritionGoals', ['getActiveGoals', 'createGoals', 'updateGoals']],
    ['Meal', ['findOwned', 'getActiveMeals', 'getMealsByType', 'searchMeals']],
  ])("basegeek's %s still guards its statics with requireUser", (name, statics) => {
    const src = fs.readFileSync(basegeekModel(name), 'utf8');
    expect(src).toContain("from '../ownership.js'");
    for (const s of statics) {
      expect(src).toContain(`statics.${s}`);
      // The guard is the first statement of each.
      expect(src).toMatch(new RegExp(`statics\\.${s} = async function[^{]*\\{\\s*requireUser\\(`));
    }
  });

  test.each([
    ['LoginStreak', '../../models/LoginStreak.js'],
    ['WeightGoals', '../../models/WeightGoals.js'],
    ['NutritionGoals', '../../models/NutritionGoals.js'],
    ['Meal', '../../models/Meal.js'],
  ])('fitnessgeek %s keeps its own unguarded statics', (name, file) => {
    const raw = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
    // The wrappers explain the divergence in prose, so strip comments before
    // asserting there is no actual guard — otherwise the explanation trips it.
    const code = raw
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toContain('ownership.js');
    expect(code).not.toContain('requireUser');
  });
});

describe('the NutritionGoals goal arithmetic', () => {
  // `checkGoalsMet` and `getProgress` are instance methods on a document, so
  // the shared module exports the same arithmetic as `evaluateGoalsMet(goals,
  // totals)` and `computeGoalProgress(goals, totals)` — which is what lets
  // this hermetic suite (no Mongo) assert the branches at all.
  const GOALS = {
    calories: 2000,
    protein_grams: 150,
    carbs_grams: 50,
    fat_grams: 130,
    fiber_grams: 25,
    sugar_grams: 30,
    sodium_mg: 2300,
  };
  const HIT = {
    calories: 2000,
    protein_grams: 150,
    carbs_grams: 50,
    fat_grams: 130,
    fiber_grams: 25,
    sugar_grams: 30,
    sodium_mg: 2300,
  };

  test('the five macro targets are floors: at or over the goal is met', () => {
    const met = evaluateGoalsMet(GOALS, { ...HIT, calories: 2400, protein_grams: 200 });
    expect(met.calories).toBe(true);
    expect(met.protein).toBe(true);
    const short = evaluateGoalsMet(GOALS, { ...HIT, calories: 1999, protein_grams: 149 });
    expect(short.calories).toBe(false);
    expect(short.protein).toBe(false);
  });

  test('sugar and sodium are ceilings: over the goal is NOT met', () => {
    // The one asymmetry in the function, and it was a trailing comment on two
    // lines in two files before it lived in one module.
    expect(evaluateGoalsMet(GOALS, HIT).sugar).toBe(true);
    expect(evaluateGoalsMet(GOALS, HIT).sodium).toBe(true);
    expect(evaluateGoalsMet(GOALS, { ...HIT, sugar_grams: 31 }).sugar).toBe(false);
    expect(evaluateGoalsMet(GOALS, { ...HIT, sodium_mg: 2301 }).sodium).toBe(false);
  });

  test('an unset or zero goal reads as not-met, not as trivially met', () => {
    expect(evaluateGoalsMet({}, HIT)).toEqual({
      calories: false,
      protein: false,
      carbs: false,
      fat: false,
      fiber: false,
      sugar: false,
      sodium: false,
    });
    expect(evaluateGoalsMet({ ...GOALS, sugar_grams: 0 }, { ...HIT, sugar_grams: 0 }).sugar)
      .toBe(false);
  });

  test('progress is a percentage clamped at 100, and 0 for an unset goal', () => {
    const p = computeGoalProgress(GOALS, { ...HIT, calories: 4000, protein_grams: 75 });
    expect(p.calories).toBe(100);
    expect(p.protein).toBe(50);
    expect(computeGoalProgress({}, HIT).calories).toBe(0);
  });

  test('progress treats sugar and sodium as floors even though checkGoalsMet does not', () => {
    // Shipped asymmetry between the two methods, moved verbatim. Asserted so
    // nobody "fixes" one of them without noticing the other.
    const halfway = computeGoalProgress(GOALS, { ...HIT, sugar_grams: 15, sodium_mg: 1150 });
    expect(halfway.sugar).toBe(50);
    expect(halfway.sodium).toBe(50);
    expect(evaluateGoalsMet(GOALS, { ...HIT, sugar_grams: 15, sodium_mg: 1150 }).sugar).toBe(true);
  });

  test('the real model carries both methods and they are the shared implementation', () => {
    const doc = new NutritionGoals({ user_id: 'u1', ...GOALS });
    expect(typeof doc.checkGoalsMet).toBe('function');
    expect(typeof doc.getProgress).toBe('function');
    expect(doc.checkGoalsMet(HIT)).toEqual(evaluateGoalsMet(GOALS, HIT));
    expect(doc.getProgress(HIT)).toEqual(computeGoalProgress(GOALS, HIT));
  });
});

describe('the Meal sub-schema, enum and nutrition arithmetic', () => {
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
  const ZERO = {
    calories: 0,
    protein_grams: 0,
    carbs_grams: 0,
    fat_grams: 0,
    fiber_grams: 0,
    sugar_grams: 0,
    sodium_mg: 0,
  };

  test('food_items embeds the shared sub-schema, ref and servings default intact', () => {
    const sub = Meal.schema.paths.food_items.schema;
    expect(Object.keys(sub.paths).sort()).toEqual(['_id', 'food_item_id', 'servings']);
    expect(sub.paths.food_item_id.options.ref).toBe('FoodItem');
    expect(sub.paths.servings.options.default).toBe(1);
    // Same shape as a stand-alone build of the exported sub-schema factory.
    const standalone = createMealItemSchema(mongoose);
    expect(Object.keys(standalone.paths).sort()).toEqual(Object.keys(sub.paths).sort());
  });

  test('meal_type is the shared enum and an unknown value is rejected', () => {
    expect(Meal.schema.paths.meal_type.enumValues).toEqual([...MEAL_TYPES]);
    const err = new Meal({ name: 'X', meal_type: 'brunch' }).validateSync();
    expect(err && err.errors.meal_type).toBeTruthy();
  });

  test('the pre(save) hook is attached by the shared factory', () => {
    // The schema passes no `timestamps` option, so this hook is the only thing
    // that maintains `updated_at` — and it fires on save() only, on both
    // sides. See the shared module's header before changing that.
    // Compiling a model adds mongoose's own pre-save hooks, so count is not
    // the comparison — presence of *this* hook is.
    const stamps = (schema) =>
      (schema.s.hooks._pres.get('save') || []).some((h) =>
        String(h.fn).includes('this.updated_at = new Date()')
      );
    expect(stamps(createMealSchema(mongoose))).toBe(true);
    expect(stamps(Meal.schema)).toBe(true);
    // And the wrapper does not declare one of its own. Comments stripped
    // first: the wrapper explains the hook in prose.
    const code = fs
      .readFileSync(path.resolve(__dirname, '../../models/Meal.js'), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toContain("pre('save'");
  });

  test('getNutrition multiplies by servings and rounds to the shipped precision', () => {
    expect(sumMealNutrition([food(), { ...food(), servings: 2.5 }])).toEqual({
      calories: 350,
      protein_grams: 35,
      carbs_grams: 17.5,
      fat_grams: 14,
      fiber_grams: 7,
      sugar_grams: 3.5,
      sodium_mg: 700,
    });
    // Grams round to one decimal; calories and sodium to the unit.
    expect(sumMealNutrition([food({ protein_grams: 3.33 })]).protein_grams).toBe(3.3);
    expect(sumMealNutrition([food({ calories_per_serving: 100.6 })]).calories).toBe(101);
  });

  test('a missing servings count means one serving, not zero', () => {
    expect(sumMealNutrition([{ food_item_id: food().food_item_id }]).calories).toBe(100);
  });

  test('an un-populated item contributes nothing rather than NaN', () => {
    // The realistic failure: a caller that forgot to `.populate()`. Both sides
    // return zeros quietly; that is shipped behaviour, asserted so it stays
    // deliberate.
    expect(sumMealNutrition([{ food_item_id: new mongoose.Types.ObjectId(), servings: 3 }]))
      .toEqual(ZERO);
    expect(sumMealNutrition([{ food_item_id: {}, servings: 3 }])).toEqual(ZERO);
    expect(sumMealNutrition([])).toEqual(ZERO);
    expect(sumMealNutrition(undefined)).toEqual(ZERO);
  });

  test('the real model carries getNutrition and it is the shared implementation', () => {
    const items = [{ ...food(), servings: 2 }];
    expect(Meal.schema.methods.getNutrition.call({ food_items: items })).toEqual(
      sumMealNutrition(items)
    );
    expect(String(Meal.schema.methods.getNutrition)).toContain('sumMealNutrition');
  });
});
