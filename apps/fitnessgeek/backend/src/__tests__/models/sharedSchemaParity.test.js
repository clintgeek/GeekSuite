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

import Weight from '../../models/Weight.js';
import BloodPressure from '../../models/BloodPressure.js';
import Medication from '../../models/Medication.js';
import LoginStreak from '../../models/LoginStreak.js';
import WeightGoals from '../../models/WeightGoals.js';
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
