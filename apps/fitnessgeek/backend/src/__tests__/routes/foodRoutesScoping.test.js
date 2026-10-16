// Ownership on the REST food reads (REVIEW_2026-10 P2, "Ownership, latent"):
// `GET /api/foods` with no search listed EVERY user's custom foods, and the
// barcode lookup was unscoped. Both now see global rows plus the caller's own.
// Also pins `GET /api/foods/suggest?meals=1` handing the opt-in through (C6).
const mod = (p) => new URL(p, import.meta.url).pathname;

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
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
const getByBarcode = jest.fn(async () => null);
const suggest = jest.fn(async () => []);
jest.unstable_mockModule(mod('../../services/unifiedFoodService.js'), () => ({
  __esModule: true,
  default: { search: jest.fn(async () => []), getByBarcode, suggest },
}));

const find = jest.fn();
jest.unstable_mockModule(mod('../../models/FoodItem.js'), () => ({
  __esModule: true,
  default: { find, findOne: jest.fn() },
}));

const { default: foodRoutes } = await import('../../routes/foodRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/foods', foodRoutes);
  return app;
}

const chain = (value) => {
  const self = { sort: () => self, limit: () => self, lean: async () => value };
  return self;
};

beforeEach(() => {
  find.mockReset();
  find.mockImplementation(() => chain([]));
  getByBarcode.mockClear();
  suggest.mockClear();
});

describe('GET /api/foods with no search', () => {
  test('is scoped to global rows plus the caller\'s own', async () => {
    const res = await request(buildApp()).get('/api/foods');
    expect(res.status).toBe(200);

    const [filter] = find.mock.calls[0];
    expect(filter.is_deleted).toBe(false);
    expect(filter.$or).toEqual(expect.arrayContaining([
      { user_id: OWNER },
      { user_id: null },
      { user_id: { $exists: false } },
    ]));
    // And nobody else's: no clause that would match another owner.
    expect(filter.$or).toHaveLength(3);
  });

  test('a source filter still applies alongside it', async () => {
    await request(buildApp()).get('/api/foods?source=usda');
    const [filter] = find.mock.calls[0];
    expect(filter.source).toBe('usda');
    expect(filter.$or).toBeDefined();
  });
});

describe('GET /api/foods?barcode=', () => {
  test('passes the caller through so the lookup can be scoped', async () => {
    await request(buildApp()).get('/api/foods?barcode=0123456789');
    expect(getByBarcode).toHaveBeenCalledWith('0123456789', OWNER);
  });
});

describe('GET /api/foods/suggest', () => {
  test('meals are opt-in', async () => {
    await request(buildApp()).get('/api/foods/suggest?q=ques');
    expect(suggest.mock.calls[0][1].includeMeals).toBe(false);

    await request(buildApp()).get('/api/foods/suggest?q=ques&meals=1');
    expect(suggest.mock.calls[1][1].includeMeals).toBe(true);
  });
});
