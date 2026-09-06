// jest resolves an `unstable_mockModule` specifier against the *setup* file
// rather than this one, so every relative mock target is made absolute first
// (same shape as weight.test.js).
const mod = (p) => new URL(p, import.meta.url).pathname;

// Q41 (2026-09-06): `POST /api/foods` used to open-code its own two-rung,
// non-sequential dedupe check (barcode OR source/source_id, `if`/`else if`,
// no name+brand rung) — a third copy of the ladder `findOrCreateFoodItem`
// already shares between this app and basegeek's gateway. It now walks the
// same shared `foodItemDedupeFilters` rungs, sequentially. These tests pin
// that the route (a) still creates a user-owned row when nothing matches
// (the ownership divergence from `findOrCreateFoodItem` is deliberate and
// unchanged), and (b) now catches a duplicate via the previously-missing
// name+brand rung, and via source/source_id even when a (non-matching)
// barcode was also supplied.
//
// `GET /api/foods/:id` is also pinned here: it used to inline its own
// `{user_id: null}` visibility check; it now uses the shared
// `foodCatalogVisibilityFilter`, which additionally matches a legacy row
// with no `user_id` key at all.

import { describe, test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const OWNER = 'user-owner';

jest.unstable_mockModule(mod('../../middleware/auth.js'), () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: OWNER, _id: OWNER };
    next();
  },
  optionalAuth: (req, res, next) => next(),
}));

jest.unstable_mockModule(mod('../../models/FoodLog.js'), () => ({ __esModule: true, default: {} }));
jest.unstable_mockModule(mod('../../models/UserSettings.js'), () => ({
  __esModule: true,
  default: { findOne: jest.fn().mockResolvedValue(null) },
}));
jest.unstable_mockModule(mod('../../services/unifiedFoodService.js'), () => ({
  __esModule: true,
  default: { search: jest.fn(), getByBarcode: jest.fn() },
}));

jest.unstable_mockModule(mod('../../models/FoodItem.js'), () => {
  function FoodItem(attrs) {
    Object.assign(this, attrs);
    this.save = jest.fn().mockResolvedValue({ _id: 'new-food', ...attrs });
  }
  FoodItem.findOne = jest.fn();
  return { __esModule: true, default: FoodItem };
});

const { default: FoodItem } = await import('../../models/FoodItem.js');
const { default: foodRoutes } = await import('../../routes/foodRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/foods', foodRoutes);
  return app;
}

describe('POST /api/foods — dedupe ladder (Q41)', () => {
  test('a name+brand match is now caught (previously-missing rung)', async () => {
    const existing = { _id: 'existing-1', name: 'Peanut Butter', brand: 'AcmeCo' };
    // No barcode, no source_id on the request -> only the name/brand rung
    // applies, and it must be tried (it used to not exist at all).
    FoodItem.findOne.mockResolvedValueOnce(existing);

    const res = await request(buildApp())
      .post('/api/foods')
      .send({
        name: 'Peanut Butter',
        brand: 'AcmeCo',
        nutrition: { calories_per_serving: 190 },
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Food item already exists');
    expect(res.body.data._id).toBe('existing-1');
    expect(FoodItem.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Peanut Butter', brand: 'AcmeCo', is_deleted: false })
    );
  });

  test('source/source_id is still checked even when a (non-matching) barcode is also present', async () => {
    // The old `if (barcode) ... else if (...)` skipped this rung whenever a
    // barcode was supplied at all, matching or not. The shared ladder does
    // not: it tries barcode first, then falls through.
    const existing = { _id: 'existing-2', source: 'usda', source_id: 'usda-1' };
    FoodItem.findOne
      .mockResolvedValueOnce(null) // barcode rung: no match
      .mockResolvedValueOnce(existing); // source/source_id rung: match

    const res = await request(buildApp())
      .post('/api/foods')
      .send({
        name: 'Some Bar',
        barcode: '0000000000000',
        source: 'usda',
        source_id: 'usda-1',
        nutrition: { calories_per_serving: 100 },
      });

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe('existing-2');
    expect(FoodItem.findOne).toHaveBeenCalledTimes(2);
  });

  test('nothing matches -> a fresh row is created, still user-owned (deliberate divergence from findOrCreateFoodItem)', async () => {
    // No barcode, no source/source_id, no brand -> foodItemDedupeFilters()
    // returns zero rungs for this input, so findOne is never called at all.
    const res = await request(buildApp())
      .post('/api/foods')
      .send({
        name: 'Homemade Soup',
        nutrition: { calories_per_serving: 120 },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.user_id).toBe(OWNER);
    expect(FoodItem.findOne).not.toHaveBeenCalled();
  });
});

describe('GET /api/foods/:id — catalog visibility (Q41)', () => {
  test('the query now carries the shared foodCatalogVisibilityFilter shape', async () => {
    FoodItem.findOne.mockResolvedValueOnce({ _id: 'f1', name: 'Global Food', user_id: null });

    const res = await request(buildApp()).get('/api/foods/f1');

    expect(res.status).toBe(200);
    expect(FoodItem.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'f1',
        is_deleted: false,
        $or: expect.arrayContaining([
          { user_id: OWNER },
          { user_id: null },
          { user_id: { $exists: false } },
        ]),
      })
    );
  });
});
