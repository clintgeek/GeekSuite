// The REAL `UserSettings.updateSettings` static — its write shape, with the
// model's own `findOneAndUpdate` spied rather than executed, so no database
// is needed.
//
// The rule (apps/fitnessgeek/DOCS/CONTEXT.md, "Settings writes are PARTIAL"):
// ONE `$set` of dot paths, so MongoDB MERGES a sub-document instead of
// replacing it. `PUT /api/settings` and basegeek's `updateFitnessUserSettings`
// were fixed on 2026-09-05 (BURN_REVIEW #5, #6); this static was the writer
// still `$set`-ing whole nested objects, which mongoose leaves undotted:
//
//   updateSettings(id, { ai: { enabled: false } })  → deleted ai.features
//   updateSettings(id, { nutrition_goal: {...} })   → deleted bmr, tdee,
//                                                      weekly_schedule, keto
//
// Callers: PUT /api/settings/ai, PUT /api/settings/dashboard, POST /api/goals.

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import UserSettings from '../../models/UserSettings.js';

const OWNER = 'user-owner';
let spy;

beforeEach(() => {
  spy = jest.spyOn(UserSettings, 'findOneAndUpdate').mockResolvedValue({});
});

afterEach(() => {
  spy.mockRestore();
});

describe('UserSettings.updateSettings', () => {
  test('a partial `ai` patch merges instead of replacing the sub-document', async () => {
    await UserSettings.updateSettings(OWNER, { ai: { enabled: false } });

    const [filter, update, options] = spy.mock.calls[0];
    expect(filter).toEqual({ user_id: OWNER });
    expect(update).toEqual({ $set: { 'ai.enabled': false } });
    // The bug shape: a nested object under $set, which Mongo treats as a
    // whole-sub-document replacement.
    expect(update.$set).not.toHaveProperty('ai');
    expect(options).toMatchObject({ upsert: true, new: true });
  });

  test('a partial nutrition_goal patch does not disturb its siblings', async () => {
    await UserSettings.updateSettings(OWNER, {
      nutrition_goal: { enabled: false, keto: { net_carb_limit_g: 20 } },
    });

    expect(spy.mock.calls[0][1]).toEqual({
      $set: {
        'nutrition_goal.enabled': false,
        'nutrition_goal.keto.net_carb_limit_g': 20,
      },
    });
  });

  test('arrays stay whole values', async () => {
    await UserSettings.updateSettings(OWNER, { dashboard: { card_order: ['a', 'b'] } });
    expect(spy.mock.calls[0][1]).toEqual({ $set: { 'dashboard.card_order': ['a', 'b'] } });
  });

  test('exactly ONE $set — never two keys, which silently loses the first', async () => {
    await UserSettings.updateSettings(OWNER, { theme: 'dark', garmin: { enabled: true } });
    const update = spy.mock.calls[0][1];
    expect(Object.keys(update)).toEqual(['$set']);
    expect(update.$set).toEqual({ theme: 'dark', 'garmin.enabled': true });
  });

  test('nothing writable falls back to $setOnInsert — an empty $set is a Mongo error', async () => {
    await UserSettings.updateSettings(OWNER, { nutrition_goal: {} });
    expect(spy.mock.calls[0][1]).toEqual({ $setOnInsert: { user_id: OWNER } });
  });

  test('every dotted path it produces is a real schema path', async () => {
    await UserSettings.updateSettings(OWNER, {
      ai: { enabled: true, features: { meal_suggestions: false } },
      nutrition_goal: { keto: { macro_split: { preset: 'classic' } } },
      units: { weight: 'kg' },
    });

    const paths = Object.keys(spy.mock.calls[0][1].$set);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(UserSettings.schema.path(path)).toBeDefined();
    }
  });
});
