/**
 * userSettingsSchemaParity.test.js — the fitnessgeek half of the TODO_ORDER #21
 * tripwire.
 *
 * This document has two writers pointed at ONE collection:
 *
 *   REST    — src/routes/settingsRoutes.js via src/models/UserSettings.js
 *   GraphQL — apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js
 *             via that app's own UserSettings model
 *
 * The fitnessgeek frontend's apiService.js rewrites most REST settings calls to
 * GraphQL, so both writers are live in production. Mongoose strict mode drops
 * unknown paths from a `$set` silently, so a field one copy didn't know about
 * was accepted, logged as a success, and never persisted — which is how keto
 * config vanished in April 2026.
 *
 * The field set now lives in @geeksuite/schemas and both models build from it.
 *
 * WHY THIS SUITE DOESN'T IMPORT BASEGEEK'S MODEL
 * ---------------------------------------------
 * This suite is deliberately hermetic (see jest.setup.js): no Mongo, no Redis,
 * no network. basegeek's model is ESM and calls `getAppConnection('fitnessgeek')`
 * at import time, which opens a real Mongoose connection — importing it here
 * would leave an open handle in a suite built to have none.
 *
 * So the split is:
 *   - here      — fitnessgeek's real model vs the shared definition, plus a
 *                 source-level check that basegeek's copy still consumes the
 *                 shared module and declares no schema of its own.
 *   - basegeek  — src/__tests__/userSettingsSchemaParity.test.js imports BOTH
 *                 real models and compares them path-by-path, and proves the
 *                 write-through on an in-memory Mongo.
 *
 * Together they close the loop from both sides.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

import { createUserSettingsSchema } from '@geeksuite/schemas/fitnessgeek/userSettings';
import UserSettings from '../../models/UserSettings.js';

// ESM has no __dirname; the source-level checks below resolve sibling files
// relative to this test file.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASEGEEK_MODEL = path.resolve(
  __dirname,
  '../../../../../basegeek/packages/api/src/graphql/fitnessgeek/models/UserSettings.js'
);

// `_id` and `__v` appear only once a schema is compiled into a model.
const COMPILED_ONLY = new Set(['_id', '__v']);
const fieldKeys = (paths) => Object.keys(paths).filter((k) => !COMPILED_ONLY.has(k)).sort();

describe('fitnessgeek UserSettings model tracks the shared schema', () => {
  test('its paths are exactly the shared @geeksuite/schemas definition', () => {
    const shared = createUserSettingsSchema(mongoose);

    const modelKeys = fieldKeys(UserSettings.schema.paths);
    const sharedKeys = fieldKeys(shared.paths);

    const onlyInModel = modelKeys.filter((k) => !sharedKeys.includes(k));
    const onlyInShared = sharedKeys.filter((k) => !modelKeys.includes(k));

    // Named so a failure points at the field rather than dumping both arrays.
    expect({ onlyInModel, onlyInShared }).toEqual({ onlyInModel: [], onlyInShared: [] });
    // Sanity: this is not passing because both sides are empty.
    expect(modelKeys.length).toBeGreaterThan(50);
  });

  test('the model file declares no schema of its own', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../models/UserSettings.js'), 'utf8');
    expect(src).toContain('createUserSettingsSchema');
    expect(src).not.toMatch(/new\s+mongoose\.Schema\s*\(/);
  });
});

describe("basegeek's copy still consumes the shared schema", () => {
  // Source-level, because importing the ESM model would open a connection.
  let src;

  beforeAll(() => {
    expect(fs.existsSync(BASEGEEK_MODEL)).toBe(true);
    src = fs.readFileSync(BASEGEEK_MODEL, 'utf8');
  });

  test('it imports @geeksuite/schemas and builds from createUserSettingsSchema', () => {
    expect(src).toContain('@geeksuite/schemas/fitnessgeek/userSettings');
    expect(src).toMatch(/createUserSettingsSchema\s*\(\s*mongoose\s*\)/);
  });

  test('it does not re-declare the schema inline', () => {
    // The failure mode this whole ticket exists to prevent: someone pastes a
    // schema back in and the two copies start drifting again.
    expect(src).not.toMatch(/new\s+mongoose\.Schema\s*\(\s*\{/);
  });
});

describe('the REST allow-list only names fields the schema actually has', () => {
  // A second silent-drop path: settingsRoutes.js copies req.body keys listed in
  // `allowedFields` straight into a `$set`. A name that isn't a real schema
  // path is accepted by the route and then dropped by strict mode.
  const routeSrc = fs.readFileSync(
    path.resolve(__dirname, '../../routes/settingsRoutes.js'),
    'utf8'
  );

  function allowList(varName) {
    const m = routeSrc.match(new RegExp(`const ${varName} = \\[([\\s\\S]*?)\\]`));
    if (!m) throw new Error(`could not find ${varName} in settingsRoutes.js`);
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  }

  test.each([
    ['allowedFields', ''],
    ['allowedDashboardFields', 'dashboard.'],
    ['allowedAIFields', 'ai.'],
  ])('%s all resolve against the schema', (varName, prefix) => {
    const unknown = allowList(varName).filter(
      (f) => UserSettings.schema.pathType(`${prefix}${f}`) === 'adhocOrUndefined'
    );
    expect(unknown).toEqual([]);
  });
});
