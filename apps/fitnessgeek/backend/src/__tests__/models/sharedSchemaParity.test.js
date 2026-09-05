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

import Weight from '../../models/Weight.js';
import BloodPressure from '../../models/BloodPressure.js';
import { createBPSchema } from '../../validation/schemas/bloodPressure.js';

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
      expect(pair.Model.schema.options.toJSON).toEqual({ virtuals: true });
      expect(pair.Model.schema.options.toObject).toEqual({ virtuals: true });
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
