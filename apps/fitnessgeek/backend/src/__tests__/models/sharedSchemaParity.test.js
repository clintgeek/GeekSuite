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
import {
  createFoodItemSchema,
  findOrCreateFoodItem,
  foodItemDedupeFilters,
  foodCatalogVisibilityFilter,
  newFoodItemAttrs,
  foodItemDefaults,
  FOOD_SOURCES,
} from '@geeksuite/schemas/fitnessgeek/foodItem';
import {
  createFoodLogSchema,
  scaleLogNutrition,
  MEAL_TYPES as FOOD_LOG_MEAL_TYPES,
} from '@geeksuite/schemas/fitnessgeek/foodLog';
import {
  createDailySummarySchema,
  summarizeFoodLogs,
  evaluateDailyGoalsMet,
  updateDailySummaryFromLogs,
  emptyMealBreakdown,
} from '@geeksuite/schemas/fitnessgeek/dailySummary';

import Weight from '../../models/Weight.js';
import BloodPressure from '../../models/BloodPressure.js';
import Medication from '../../models/Medication.js';
import LoginStreak from '../../models/LoginStreak.js';
import WeightGoals from '../../models/WeightGoals.js';
import NutritionGoals from '../../models/NutritionGoals.js';
import Meal from '../../models/Meal.js';
import FoodItem from '../../models/FoodItem.js';
import FoodLog from '../../models/FoodLog.js';
import DailySummary from '../../models/DailySummary.js';
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
  {
    name: 'FoodItem',
    Model: FoodItem,
    createSchema: createFoodItemSchema,
    factory: 'createFoodItemSchema',
    specifier: '@geeksuite/schemas/fitnessgeek/foodItem',
    modelFile: '../../models/FoodItem.js',
    // `nutrition` and `serving` are nested OBJECTS, not sub-schemas, so
    // mongoose flattens them into dotted paths. Contrast `Meal.food_items`,
    // which is a DocumentArray and needs its own comparison.
    expectedPaths: [
      'name',
      'brand',
      'barcode',
      'nutrition.calories_per_serving',
      'nutrition.protein_grams',
      'nutrition.carbs_grams',
      'nutrition.fat_grams',
      'nutrition.fiber_grams',
      'nutrition.sugar_grams',
      'nutrition.sodium_mg',
      'serving.size',
      'serving.unit',
      'source',
      'source_id',
      'user_id',
      'is_deleted',
      'created_at',
      'updated_at',
    ],
    // Declared but NOT serialized: this pair passes no `toJSON`/`toObject`.
    expectedVirtuals: ['totalCalories'],
    serializesVirtuals: false,
    expectedMethods: ['isGlobal'],
    // `findOrCreate` is here but it is a one-line delegate to the shared
    // `findOrCreateFoodItem` — the carve-out from the statics policy.
    // `search` is genuinely this side's; `findAccessible`/`findAccessibleMany`
    // are basegeek-only.
    expectedStatics: ['findOrCreate', 'search'],
  },
  {
    name: 'FoodLog',
    Model: FoodLog,
    createSchema: createFoodLogSchema,
    factory: 'createFoodLogSchema',
    specifier: '@geeksuite/schemas/fitnessgeek/foodLog',
    modelFile: '../../models/FoodLog.js',
    // `nutrition` is a nested OBJECT (dotted paths), not a sub-schema. And
    // `updatedAt` (camel) beside `created_at` (snake) is the asymmetric
    // timestamp rename both copies shipped — the `Medication` quirk again.
    // Spelled out here so nobody "fixes" it by accident.
    expectedPaths: [
      'user_id',
      'log_date',
      'meal_type',
      'food_item_id',
      'servings',
      'notes',
      'nutrition.calories_per_serving',
      'nutrition.protein_grams',
      'nutrition.carbs_grams',
      'nutrition.fat_grams',
      'nutrition.fiber_grams',
      'nutrition.sugar_grams',
      'nutrition.sodium_mg',
      'created_at',
      'updatedAt',
    ],
    // Declared AND serialized — this pair passes `virtuals: true`, so
    // `calculatedNutrition` is on the wire in every response carrying a log.
    expectedVirtuals: ['calculatedNutrition'],
    serializesVirtuals: true,
    // The four list statics stayed here: basegeek's are these plus
    // `requireUser`, and they are also where `toUtcMidnight` is called —
    // @geeksuite/utils is ESM-only and cannot be required from the CJS
    // shared package.
    expectedStatics: [
      'getLogsForDate',
      'getLogsForDateRange',
      'getRecentLogs',
      'getLogsByMealType',
    ],
  },
  {
    name: 'DailySummary',
    Model: DailySummary,
    createSchema: createDailySummarySchema,
    factory: 'createDailySummarySchema',
    specifier: '@geeksuite/schemas/fitnessgeek/dailySummary',
    modelFile: '../../models/DailySummary.js',
    // 32 paths, all nested OBJECTS rather than sub-schemas. The one that
    // matters is `totals.net_carbs_grams` — divergence C1, the field the
    // gateway's copy was missing and therefore erasing on every read.
    expectedPaths: [
      'user_id',
      'date',
      'totals.calories',
      'totals.protein_grams',
      'totals.carbs_grams',
      'totals.fat_grams',
      'totals.fiber_grams',
      'totals.net_carbs_grams',
      'totals.sugar_grams',
      'totals.sodium_mg',
      'meals.breakfast.calories',
      'meals.breakfast.protein_grams',
      'meals.breakfast.carbs_grams',
      'meals.breakfast.fat_grams',
      'meals.lunch.calories',
      'meals.lunch.protein_grams',
      'meals.lunch.carbs_grams',
      'meals.lunch.fat_grams',
      'meals.dinner.calories',
      'meals.dinner.protein_grams',
      'meals.dinner.carbs_grams',
      'meals.dinner.fat_grams',
      'meals.snack.calories',
      'meals.snack.protein_grams',
      'meals.snack.carbs_grams',
      'meals.snack.fat_grams',
      'goals_met.calories',
      'goals_met.protein',
      'goals_met.carbs',
      'goals_met.fat',
      'created_at',
      'updated_at',
    ],
    expectedVirtuals: [],
    serializesVirtuals: false,
    // `updateFromLogs` is here but it is a delegate to the shared
    // `updateDailySummaryFromLogs` — the second carve-out from the statics
    // policy after `FoodItem.findOrCreate`. `getOrCreate` and
    // `getSummaryRange` are genuinely this side's.
    expectedStatics: ['getOrCreate', 'updateFromLogs', 'getSummaryRange'],
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
                // `weights` is here for `FoodItem`'s text index, which
                // declares none on either side. Adding one on a single side
                // would silently re-rank that writer's search and nothing
                // else.
                weights: opts.weights,
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
    [
      'FoodLog',
      ['getLogsForDate', 'getLogsForDateRange', 'getRecentLogs', 'getLogsByMealType'],
    ],
    ['DailySummary', ['getOrCreate', 'updateFromLogs', 'getSummaryRange']],
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
    ['FoodLog', '../../models/FoodLog.js'],
    ['DailySummary', '../../models/DailySummary.js'],
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

  test('progress treats sugar and sodium as ceilings, same as checkGoalsMet (Q39, fixed 2026-09-06)', () => {
    // Used to disagree: progress read consumed/goal like the five floor
    // macros, so hitting the limit exactly showed "100% progress" and eating
    // nothing showed "0%" — backwards for a number you want to stay under.
    // Now progress is compliance headroom: 100 with nothing eaten, falling to
    // 0 right at the limit, never negative past it.
    expect(computeGoalProgress(GOALS, { ...HIT, sugar_grams: 0, sodium_mg: 0 }).sugar).toBe(100);
    expect(computeGoalProgress(GOALS, { ...HIT, sugar_grams: 0, sodium_mg: 0 }).sodium).toBe(100);
    expect(computeGoalProgress(GOALS, HIT).sugar).toBe(0); // at the limit exactly
    expect(computeGoalProgress(GOALS, HIT).sodium).toBe(0);
    expect(computeGoalProgress(GOALS, { ...HIT, sugar_grams: 60, sodium_mg: 4600 }).sugar).toBe(0); // over the limit, clamped not negative
    expect(computeGoalProgress(GOALS, { ...HIT, sugar_grams: 60, sodium_mg: 4600 }).sodium).toBe(0);
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

describe('the FoodItem dedupe ladder and catalog contract', () => {
  // `findOrCreate` is the one static that moved into the shared module — not
  // as a static, but as `findOrCreateFoodItem(Model, foodData)`, with the two
  // pure halves exported so this hermetic suite (no Mongo) can assert them.
  // The ladder is what stops this backend and the gateway minting duplicate
  // catalog rows for the same upstream food, so a divergence in it forks the
  // catalog quietly rather than throwing.

  const food = (over = {}) => ({
    name: 'Probe bar',
    brand: 'ProbeCo',
    source: 'usda',
    source_id: 'usda-777',
    ...over,
  });

  test('the rungs are barcode, then (source, source_id), then (name, brand)', () => {
    expect(foodItemDedupeFilters(food({ barcode: 'b1' }))).toEqual([
      { by: 'barcode', filter: { barcode: 'b1', is_deleted: false } },
      {
        by: 'source',
        filter: { source: 'usda', source_id: 'usda-777', is_deleted: false },
      },
      {
        by: 'name_brand',
        filter: { name: 'Probe bar', brand: 'ProbeCo', is_deleted: false },
      },
    ]);
  });

  test('a rung whose inputs are missing is skipped, not queried with undefined', () => {
    expect(foodItemDedupeFilters(food()).map((r) => r.by)).toEqual(['source', 'name_brand']);
    expect(foodItemDedupeFilters({ name: 'Only a name' })).toEqual([]);
    expect(foodItemDedupeFilters({ source: 'usda' })).toEqual([]); // needs source_id too
    expect(foodItemDedupeFilters({})).toEqual([]);
    expect(foodItemDedupeFilters(undefined)).toEqual([]);
  });

  test('every rung requires is_deleted:false, so a soft-deleted row is never resurrected', () => {
    for (const rung of foodItemDedupeFilters(food({ barcode: 'b1' }))) {
      expect(rung.filter.is_deleted).toBe(false);
    }
  });

  test('no rung is scoped by user — that is what makes a catalog row shared', () => {
    for (const rung of foodItemDedupeFilters(food({ barcode: 'b1' }))) {
      expect(Object.keys(rung.filter)).not.toContain('user_id');
    }
  });

  test('a created row is GLOBAL even when the caller passed a userId', () => {
    // The shipped rule. `POST /api/foods` is the path that mints a private
    // custom food; this one always mints a shared catalog entry.
    expect(newFoodItemAttrs(food()).user_id).toBeNull();
  });

  test('the create defaults are 100 g, source custom, and zeroed nutrition', () => {
    const attrs = newFoodItemAttrs({ name: 'Bare' });
    expect(attrs.serving).toEqual(foodItemDefaults.serving);
    expect(attrs.source).toBe(foodItemDefaults.source);
    expect(attrs.nutrition).toEqual({
      calories_per_serving: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0,
      fiber_grams: 0,
      sugar_grams: 0,
      sodium_mg: 0,
    });
  });

  test('the defaults use `||`, so a zero serving size becomes 100 — shipped coercion', () => {
    // Moved verbatim from both copies. `??` would keep the 0 and change
    // behaviour on both sides at once, which is not what a refactor does.
    expect(newFoodItemAttrs({ serving: { size: 0, unit: '' } }).serving).toEqual({
      size: 100,
      unit: 'g',
    });
    expect(newFoodItemAttrs({ source: '' }).source).toBe('custom');
    expect(newFoodItemAttrs({ serving: { size: 45, unit: 'ml' } }).serving).toEqual({
      size: 45,
      unit: 'ml',
    });
  });

  test('the ladder walks in order and stops at the first hit', async () => {
    // A fake model: no Mongo, but the call order is the thing under test.
    const seen = [];
    const Fake = {
      findOne: async (filter) => {
        seen.push(filter);
        return filter.source ? { _id: 'hit-by-source' } : null;
      },
    };

    const got = await findOrCreateFoodItem(Fake, food({ barcode: 'b1' }));

    expect(got).toEqual({ _id: 'hit-by-source' });
    expect(seen).toEqual([
      { barcode: 'b1', is_deleted: false },
      { source: 'usda', source_id: 'usda-777', is_deleted: false },
    ]);
  });

  test('a total miss constructs and saves exactly one row', async () => {
    const saved = [];
    function Fake(attrs) {
      this.attrs = attrs;
      this.save = async () => {
        saved.push(attrs);
        return { _id: 'created', ...attrs };
      };
    }
    Fake.findOne = async () => null;

    const got = await findOrCreateFoodItem(Fake, food());

    expect(got._id).toBe('created');
    expect(saved).toHaveLength(1);
    expect(saved[0].user_id).toBeNull();
    expect(saved[0].source_id).toBe('usda-777');
  });

  test('it refuses anything that is not a compiled model rather than throwing later', async () => {
    await expect(findOrCreateFoodItem(null, food())).rejects.toThrow(TypeError);
    await expect(findOrCreateFoodItem({}, food())).rejects.toThrow(TypeError);
  });

  test('the real model delegates rather than restating the ladder', () => {
    const src = String(FoodItem.schema.statics.findOrCreate);
    expect(src).toContain('findOrCreateFoodItem');
    expect(src).not.toContain('is_deleted');
    expect(src).not.toContain('source_id');
  });

  test('search stayed app-side, but its filter shape is the shared one (Q41, fixed 2026-09-06)', () => {
    // An ownership-scoping read: global rows plus the caller's own. The
    // static itself stays app-side (no `requireUser` guard here, unlike
    // basegeek's `findAccessible`), but it now builds its "who can see this"
    // clause from `foodCatalogVisibilityFilter` instead of a hand-rolled
    // `{user_id: null}` — reconciled with the gateway's `foodCatalogFilter`
    // (`ownership.js`), which always matched a wider "no owner" shape.
    expect(typeof FoodItem.search).toBe('function');
    expect(String(FoodItem.schema.statics.search)).toContain('foodCatalogVisibilityFilter');
    expect(String(FoodItem.schema.statics.search)).not.toContain('user_id: null');
    // And the shared factory attaches no statics whatsoever.
    expect(Object.keys(createFoodItemSchema(mongoose).statics)).toEqual([]);
  });

  test('foodCatalogVisibilityFilter is the union of the two old definitions', () => {
    // Used to disagree: `search` matched only `{user_id: null}`;
    // `foodCatalogFilter` (basegeek's ownership.js) also matched
    // `{user_id: {$exists: false}}`. The shared filter matches both shapes of
    // "no owner", plus the caller's own rows when a userId is given.
    expect(foodCatalogVisibilityFilter('me')).toEqual({
      $or: [
        { user_id: 'me' },
        { user_id: null },
        { user_id: { $exists: false } },
      ],
    });
    // No userId -> global-only, no "mine" clause (what `search`'s anonymous
    // callers rely on — it carries no ownership guard of its own).
    expect(foodCatalogVisibilityFilter(null)).toEqual({
      $or: [{ user_id: null }, { user_id: { $exists: false } }],
    });
    expect(foodCatalogVisibilityFilter(undefined)).toEqual({
      $or: [{ user_id: null }, { user_id: { $exists: false } }],
    });
  });

  test('the source enum is the shared one and an unknown source is rejected', () => {
    expect(FoodItem.schema.paths.source.enumValues).toEqual([...FOOD_SOURCES]);
    const err = new FoodItem({
      name: 'X',
      source: 'myfitnesspal',
      nutrition: { calories_per_serving: 1 },
      serving: { size: 1 },
    }).validateSync();
    expect(err && err.errors.source).toBeTruthy();
  });

  test('barcode is the only unique path, and it is a PARTIAL index (Q40, fixed 2026-09-06)', () => {
    // The first `unique` flag in packages/schemas/fitnessgeek. No path-level
    // `unique`/`sparse` any more — the constraint is declared explicitly in
    // createFoodItemSchema() as a schema-level index, filtered to live rows
    // with a string barcode, so it no longer collides with a soft-deleted
    // row's barcode (that used to E11000; the basegeek suite pins the fixed
    // runtime behaviour against real Mongo). If this index ever moves again,
    // both processes still have to redeploy together — see the shared
    // module's header.
    const unique = Object.entries(FoodItem.schema.paths)
      .filter(([, p]) => p.options?.unique)
      .map(([k]) => k);
    expect(unique).toEqual([]); // no more path-level unique flag

    const barcodeIndex = FoodItem.schema
      .indexes()
      .find(([keys]) => Object.keys(keys).length === 1 && keys.barcode === 1);
    expect(barcodeIndex).toBeTruthy();
    const [, opts] = barcodeIndex;
    expect(opts.unique).toBe(true);
    expect(opts.partialFilterExpression).toEqual({
      is_deleted: false,
      barcode: { $type: 'string' }
    });
  });

  test('the text index is on name and brand with no weights', () => {
    const [keys, opts = {}] = FoodItem.schema
      .indexes()
      .find(([k]) => Object.values(k).includes('text'));
    expect(keys).toEqual({ name: 'text', brand: 'text' });
    expect(opts.weights).toBeUndefined();
  });

  test('isGlobal is the shared predicate for an unowned catalog row', () => {
    const attrs = { name: 'X', source: 'custom', nutrition: { calories_per_serving: 1 },
                    serving: { size: 1 } };
    expect(new FoodItem(attrs).isGlobal()).toBe(true);
    expect(new FoodItem({ ...attrs, user_id: 'u1' }).isGlobal()).toBe(false);
  });

  test('totalCalories reads through but is not serialized', () => {
    const doc = new FoodItem({
      name: 'X',
      source: 'custom',
      nutrition: { calories_per_serving: 321 },
      serving: { size: 1 },
    });
    expect(doc.totalCalories).toBe(321);
    expect(doc.toJSON().totalCalories).toBeUndefined();
  });

  test("basegeek keeps its two findAccessible statics and this side has neither", () => {
    const src = fs.readFileSync(basegeekModel('FoodItem'), 'utf8');
    expect(src).toContain("from '../ownership.js'");
    for (const s of ['findAccessible', 'findAccessibleMany']) {
      expect(src).toMatch(new RegExp(`statics\\.${s} = async function[^{]*\\{\\s*requireUser\\(`));
    }
    // And its findOrCreate carries no guard — the accessibility re-check is in
    // resolvers.js (`resolveLogFoodItem`), which is the gateway's deliberate
    // divergence from REST. Moving it in here would change what the static
    // returns for every caller.
    expect(src).not.toMatch(/statics\.findOrCreate = async function[^{]*\{\s*requireUser\(/);

    const code = fs
      .readFileSync(path.resolve(__dirname, '../../models/FoodItem.js'), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toContain('ownership.js');
    expect(code).not.toContain('requireUser');
    expect(code).not.toContain('findAccessible');
  });
});

describe('the FoodLog meal-type enum and nutrition arithmetic', () => {
  // Pair 9's decision, asserted rather than described: `foodlogs` uses
  // `meal.js`'s MEAL_TYPES rather than a fourth frozen copy of the four
  // strings, because `logMeal` writes a saved Meal's `meal_type` straight into
  // a FoodLog row and `DailySummary` buckets those rows by it. If somebody
  // splits them again, these fail.

  test('FoodLog and Meal share one enum object, not two equal arrays', () => {
    // Object identity at the module level: foodLog.js re-exports meal.js's
    // constant rather than freezing its own. (Mongoose copies the array into
    // `enumValues` when it builds the path, so the paths themselves can only
    // be compared by value.)
    expect(FOOD_LOG_MEAL_TYPES).toBe(MEAL_TYPES);
    expect(MEAL_TYPES).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
    expect(FoodLog.schema.paths.meal_type.enumValues).toEqual([...MEAL_TYPES]);
    expect(Meal.schema.paths.meal_type.enumValues).toEqual([...MEAL_TYPES]);
  });

  test('neither model file restates the four strings', () => {
    // The last two hand-written copies were here. `mealRoutes.js` was rewired
    // in 3b842e7; these two were the remainder.
    for (const file of [
      path.resolve(__dirname, '../../models/FoodLog.js'),
      basegeekModel('FoodLog'),
    ]) {
      expect(fs.readFileSync(file, 'utf8')).not.toContain("'breakfast'");
    }
  });

  test('both collections reject the same non-member', () => {
    const log = new FoodLog({
      user_id: 'u1',
      log_date: new Date('2026-09-05T00:00:00.000Z'),
      meal_type: 'brunch',
      food_item_id: new mongoose.Types.ObjectId(),
      servings: 1,
    });
    expect(log.validateSync().errors.meal_type).toBeTruthy();

    const meal = new Meal({ name: 'x', meal_type: 'brunch' });
    expect(meal.validateSync().errors.meal_type).toBeTruthy();
  });

  test('every nutrition.* leaf floors at 0 (§12 follow-up #13, fixed 2026-09-06)', () => {
    // Used to accept a negative macro; FoodItem.nutrition.* and
    // DailySummary.totals.* have always floored at 0, so this closed the one
    // gap between the three nutrition-shaped leaves in the schema set.
    const log = new FoodLog({
      user_id: 'u1',
      log_date: new Date('2026-09-05T00:00:00.000Z'),
      meal_type: 'lunch',
      food_item_id: new mongoose.Types.ObjectId(),
      servings: 1,
      nutrition: { calories_per_serving: -1, sodium_mg: -5 },
    });
    const errors = log.validateSync().errors;
    expect(errors['nutrition.calories_per_serving']).toBeTruthy();
    expect(errors['nutrition.sodium_mg']).toBeTruthy();

    // Zero is still fine — only negative is rejected.
    const zeroLog = new FoodLog({
      user_id: 'u1',
      log_date: new Date('2026-09-05T00:00:00.000Z'),
      meal_type: 'lunch',
      food_item_id: new mongoose.Types.ObjectId(),
      servings: 1,
      nutrition: { calories_per_serving: 0 },
    });
    expect(zeroLog.validateSync()).toBeUndefined();
  });

  test('the stored snapshot wins, and an un-populated food contributes zero', () => {
    const stored = {
      calories_per_serving: 200,
      protein_grams: 10,
      carbs_grams: 20,
      fat_grams: 5,
      fiber_grams: 4,
      sugar_grams: 3,
      sodium_mg: 100,
    };
    // Stored values, doubled. Note the output key is `calories`, not
    // `calories_per_serving`, and it is already multiplied.
    expect(scaleLogNutrition(stored, null, 2)).toEqual({
      calories: 400,
      protein_grams: 20,
      carbs_grams: 40,
      fat_grams: 10,
      fiber_grams: 8,
      sugar_grams: 6,
      sodium_mg: 200,
    });
    // No snapshot and no populated food: zeros, not NaN and not a throw.
    expect(scaleLogNutrition({}, null, 3).calories).toBe(0);
    expect(scaleLogNutrition(undefined, null, 3).sodium_mg).toBe(0);
  });

  test('a stored ZERO falls through to the catalog value — `||`, not `??`', () => {
    // Shipped coercion on both sides. A genuinely zero-calorie entry reads the
    // food's number instead of its own zero. Preserved verbatim; asserted so
    // that "fixing" it has to be a deliberate commit.
    const food = { nutrition: { calories_per_serving: 90, sodium_mg: 7 } };
    expect(scaleLogNutrition({ calories_per_serving: 0 }, food, 1).calories).toBe(90);
    expect(scaleLogNutrition({ calories_per_serving: 150 }, food, 1).calories).toBe(150);
  });

  test('the real model’s virtual is the shared arithmetic, and it is serialized', () => {
    const doc = new FoodLog({
      user_id: 'u1',
      log_date: new Date('2026-09-05T00:00:00.000Z'),
      meal_type: 'lunch',
      food_item_id: new mongoose.Types.ObjectId(),
      servings: 2.5,
      nutrition: { calories_per_serving: 210, protein_grams: 21 },
    });
    // Un-populated here (no Mongo in this suite), which is the `food = null`
    // branch; the populated branch is asserted against real Mongo in
    // basegeek's half.
    expect(doc.calculatedNutrition).toEqual(scaleLogNutrition(doc.nutrition, null, 2.5));
    expect(doc.calculatedNutrition.calories).toBe(525);
    expect(doc.toJSON().calculatedNutrition.calories).toBe(525);
  });
});

describe('the DailySummary recompute (the shared updateFromLogs)', () => {
  // Pair 10's carve-out. `updateFromLogs` is the ONLY writer of `totals`,
  // `meals` and `goals_met` on either side and both write the whole
  // sub-document at once, so a divergence erases rather than throws — which is
  // exactly what happened to `totals.net_carbs_grams` (C1). The arithmetic is
  // exported so this hermetic suite can assert it with no database.

  const food = (over = {}) => ({
    nutrition: {
      calories_per_serving: 100,
      protein_grams: 5,
      carbs_grams: 20,
      fat_grams: 2,
      fiber_grams: 4,
      sugar_grams: 3,
      sodium_mg: 10,
      ...over,
    },
  });
  const log = (over = {}) => ({
    meal_type: 'lunch',
    servings: 1,
    food_item_id: food(),
    ...over,
  });

  test('totals sum every macro, and net carbs are carbs minus fiber', () => {
    const { totals } = summarizeFoodLogs([log(), log({ servings: 2 })]);
    expect(totals).toEqual({
      calories: 300,
      protein_grams: 15,
      carbs_grams: 60,
      fat_grams: 6,
      fiber_grams: 12,
      net_carbs_grams: 48,
      sugar_grams: 9,
      sodium_mg: 30,
    });
  });

  test('net carbs are floored PER LOG, so a high-fibre food cannot go negative', () => {
    // Floored per log rather than on the day's sum: one very fibrous food
    // must not subtract net carbs from the rest of the day. It is also what
    // keeps the value inside the schema's `min: 0`.
    const fibrous = log({ food_item_id: food({ carbs_grams: 2, fiber_grams: 30 }) });
    expect(summarizeFoodLogs([fibrous]).totals.net_carbs_grams).toBe(0);
    expect(summarizeFoodLogs([fibrous, log()]).totals.net_carbs_grams).toBe(16);
  });

  test('a log with no populated food, or no nutrition, is skipped whole', () => {
    const bare = { meal_type: 'lunch', servings: 5, food_item_id: new mongoose.Types.ObjectId() };
    const { totals, meals } = summarizeFoodLogs([bare, { ...bare, food_item_id: {} }, log()]);
    expect(totals.calories).toBe(100);
    expect(meals.lunch.calories).toBe(100);
  });

  test('a missing or zero servings count means one', () => {
    expect(summarizeFoodLogs([log({ servings: 0 })]).totals.calories).toBe(100);
    expect(summarizeFoodLogs([log({ servings: undefined })]).totals.calories).toBe(100);
  });

  test('the breakdown has one block per MEAL_TYPES entry, four macros each', () => {
    const empty = emptyMealBreakdown();
    expect(Object.keys(empty)).toEqual([...MEAL_TYPES]);
    expect(Object.keys(empty.breakfast)).toEqual([
      'calories',
      'protein_grams',
      'carbs_grams',
      'fat_grams',
    ]);
  });

  test('an unrecognised meal type counts in totals and vanishes from the breakdown', () => {
    // The guarded bucketing (`if (meals[log.meal_type])`) is shipped
    // behaviour, and it is the reason FoodLog's enum and MEAL_TYPES have to
    // stay one list: split them and a day's macros stop adding up.
    const { totals, meals } = summarizeFoodLogs([log({ meal_type: 'brunch' })]);
    expect(totals.calories).toBe(100);
    expect(Object.keys(meals)).toEqual([...MEAL_TYPES]);
    expect(meals.lunch.calories).toBe(0);
  });

  test('goals_met reads UserSettings.nutrition_goal, and an unset goal is NOT met', () => {
    const totals = { calories: 2000, protein_grams: 150, carbs_grams: 40, fat_grams: 130 };
    expect(evaluateDailyGoalsMet(totals, null)).toEqual({
      calories: false,
      protein: false,
      carbs: false,
      fat: false,
    });
    expect(evaluateDailyGoalsMet(totals, { daily_calorie_target: 0 }).calories).toBe(false);
    // `daily_calorie_target`, not `calories` — this is the UserSettings
    // sub-document, not the `nutritiongoals` collection.
    expect(evaluateDailyGoalsMet(totals, { calories: 1800 }).calories).toBe(false);
    expect(evaluateDailyGoalsMet(totals, { daily_calorie_target: 1800 }).calories).toBe(true);
  });

  test('every goal is a FLOOR, including carbs and fat', () => {
    // Shipped, and it means a keto user under their carb ceiling reads as not
    // meeting the carb goal. `NutritionGoals.checkGoalsMet` disagrees with
    // itself the same way (plan §10). A product question, not a refactor.
    const under = { calories: 0, protein_grams: 0, carbs_grams: 10, fat_grams: 0 };
    expect(evaluateDailyGoalsMet(under, { carbs_grams: 50 }).carbs).toBe(false);
    expect(evaluateDailyGoalsMet({ ...under, carbs_grams: 50 }, { carbs_grams: 50 }).carbs).toBe(
      true
    );
  });

  test('the helper writes the whole triple through one upsert, on the given window', async () => {
    // Fake models: this suite has no Mongo. What is being pinned down is the
    // shape of the write — the whole `totals` sub-document at once, which is
    // what made C1 a data-loss bug rather than a stale-field bug.
    const seen = {};
    const FoodLogModel = {
      find(filter) {
        seen.filter = filter;
        return {
          populate(field) {
            seen.populated = field;
            return Promise.resolve([log()]);
          },
        };
      },
    };
    const UserSettingsModel = {
      findOne: async () => ({ nutrition_goal: { daily_calorie_target: 50 } }),
    };
    const SummaryModel = {
      findOneAndUpdate: async (filter, update, options) => {
        Object.assign(seen, { filter2: filter, update, options });
        return { ok: true };
      },
    };

    const startDate = new Date('2026-09-05T00:00:00.000Z');
    const endDate = new Date('2026-09-05T23:59:59.999Z');
    const out = await updateDailySummaryFromLogs({
      SummaryModel,
      FoodLogModel,
      UserSettingsModel,
      userId: 'u1',
      startDate,
      endDate,
    });

    expect(out).toEqual({ ok: true });
    expect(seen.populated).toBe('food_item_id');
    expect(seen.filter).toEqual({ user_id: 'u1', log_date: { $gte: startDate, $lte: endDate } });
    expect(seen.filter2).toEqual({ user_id: 'u1', date: startDate });
    expect(seen.options).toEqual({ upsert: true, new: true });
    expect(Object.keys(seen.update).sort()).toEqual([
      'goals_met',
      'meals',
      'totals',
      'updated_at',
    ]);
    expect(seen.update.totals.net_carbs_grams).toBe(16);
    expect(seen.update.goals_met.calories).toBe(true);
  });

  test('the date normalization did NOT move into the CJS package', () => {
    // @geeksuite/utils is ESM-only, so `toUtcMidnight` cannot be required from
    // @geeksuite/schemas. The helper takes an already-normalized window and
    // each app's static does the normalizing. Plan §3, §11.
    expect(String(updateDailySummaryFromLogs)).not.toContain('toUtcMidnight');
    expect(String(summarizeFoodLogs)).not.toContain('toUtcMidnight');
  });

  test('both wrappers delegate the recompute instead of restating it', () => {
    const files = [
      fs.readFileSync(path.resolve(__dirname, '../../models/DailySummary.js'), 'utf8'),
      fs.readFileSync(basegeekModel('DailySummary'), 'utf8'),
    ];
    for (const raw of files) {
      const code = raw
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      expect(code).toContain('updateDailySummaryFromLogs');
      // Neither side keeps its own accumulator, its own net-carb line, or its
      // own goal comparison. This is the assertion C1 would have failed.
      expect(code).not.toContain('net_carbs_grams');
      expect(code).not.toContain('Math.max(');
      expect(code).not.toContain('daily_calorie_target');
      // But the date normalization IS still here, on both sides.
      expect(code).toContain('toUtcMidnight');
    }
  });

  test('the real model still exposes updateFromLogs as a static', () => {
    expect(typeof DailySummary.updateFromLogs).toBe('function');
    expect(typeof DailySummary.getOrCreate).toBe('function');
    expect(typeof DailySummary.getSummaryRange).toBe('function');
  });
});
