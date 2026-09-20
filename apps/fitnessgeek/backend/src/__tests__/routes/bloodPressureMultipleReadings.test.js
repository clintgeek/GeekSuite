// Coverage for the three-part BP fix (DOCS/SUITE_TODO.md):
//   1. a second reading the same calendar day is no longer rejected
//   2. a TRUE duplicate (same userId + measured_at) is a clean 409, not a 500
//   3. the widened typo-guard bounds accept a genuine hypertensive-crisis
//      reading that the old 70-200/40-130 ceiling would have refused
// plus that `log_date` stays UTC-midnight while `measured_at` carries the
// full instant.
//
// Hermetic: the BloodPressure model and auth middleware are jest-mocked, no
// live Mongo — same shape as bloodPressureValidation.test.js.

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const OWNER = 'user-owner';

const mod = (p) => new URL(p, import.meta.url).pathname;

jest.unstable_mockModule(mod('../../middleware/auth.js'), () => ({
  authenticateToken: (req, res, next) => {
    const userId = req.header('x-test-user');
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    req.user = { id: userId, _id: userId, userId };
    next();
  },
  optionalAuth: (req, res, next) => next(),
}));

jest.unstable_mockModule(mod('../../models/BloodPressure.js'), () => {
  const BloodPressure = jest.fn().mockImplementation(function ctor(doc) {
    Object.assign(this, doc);
    this.save = jest.fn().mockResolvedValue(this);
  });
  BloodPressure.find = jest.fn();
  BloodPressure.countDocuments = jest.fn();
  BloodPressure.findOne = jest.fn();
  BloodPressure.findOneAndDelete = jest.fn();
  return { __esModule: true, default: BloodPressure };
});

const { default: BloodPressure } = await import('../../models/BloodPressure.js');
const { default: bloodPressureRoutes } = await import('../../routes/bloodPressureRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/blood-pressure', bloodPressureRoutes);
  return app;
}

beforeEach(() => {
  BloodPressure.findOne.mockResolvedValue(null);
});

describe('POST /api/blood-pressure — a second reading the same day (the headline fix)', () => {
  test('accepted even when a log already exists for that day', async () => {
    // Simulates the state the OLD controller's `findOne` dup-check would
    // have seen: a log already on file for the day. Under the code being
    // fixed, this made the controller answer 409 without ever constructing
    // a second document. The new controller doesn't consult `findOne` for
    // this at all, so the mocked "existing" row must not matter.
    BloodPressure.findOne.mockResolvedValue({
      _id: 'existing-am-reading',
      userId: OWNER,
      systolic: 118,
      diastolic: 76,
    });

    const res = await request(buildApp())
      .post('/api/blood-pressure')
      .set('x-test-user', OWNER)
      .send({ systolic: 145, diastolic: 92, measured_at: '2026-09-01T20:00:00.000Z' });

    expect(res.status).toBe(201);
    expect(res.body.data.systolic).toBe(145);
  });

  test('a morning and an evening reading both save as two distinct documents', async () => {
    const morning = await request(buildApp())
      .post('/api/blood-pressure')
      .set('x-test-user', OWNER)
      .send({ systolic: 120, diastolic: 80, log_date: '2026-09-01', measured_at: '2026-09-01T07:00:00.000Z' });
    const evening = await request(buildApp())
      .post('/api/blood-pressure')
      .set('x-test-user', OWNER)
      .send({ systolic: 118, diastolic: 76, log_date: '2026-09-01', measured_at: '2026-09-01T20:00:00.000Z' });

    expect(morning.status).toBe(201);
    expect(evening.status).toBe(201);
    expect(BloodPressure).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/blood-pressure — a true duplicate at the same instant', () => {
  test('an E11000 on (userId, measured_at) comes back as a clean 409, not a 500', async () => {
    const dupError = Object.assign(new Error('E11000 duplicate key error collection: fitnessgeek.bloodpressures'), {
      code: 11000,
    });
    BloodPressure.mockImplementationOnce(function ctor(doc) {
      Object.assign(this, doc);
      this.save = jest.fn().mockRejectedValue(dupError);
    });

    const res = await request(buildApp())
      .post('/api/blood-pressure')
      .set('x-test-user', OWNER)
      .send({ systolic: 120, diastolic: 80, measured_at: '2026-09-01T07:00:00.000Z' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('DUPLICATE_READING');
    expect(res.body.message).toMatch(/already been recorded/i);
  });

  test('a non-duplicate save error is still a 500 (the E11000 branch is not swallowing real failures)', async () => {
    const boom = new Error('connection reset');
    BloodPressure.mockImplementationOnce(function ctor(doc) {
      Object.assign(this, doc);
      this.save = jest.fn().mockRejectedValue(boom);
    });

    const res = await request(buildApp())
      .post('/api/blood-pressure')
      .set('x-test-user', OWNER)
      .send({ systolic: 120, diastolic: 80 });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/blood-pressure — widened bounds are typo guards, not a clinical ceiling', () => {
  test('200/130 (the OLD ceiling) is still accepted', async () => {
    const res = await request(buildApp())
      .post('/api/blood-pressure')
      .set('x-test-user', OWNER)
      .send({ systolic: 200, diastolic: 130 });

    expect(res.status).toBe(201);
    expect(res.body.data.systolic).toBe(200);
    expect(res.body.data.diastolic).toBe(130);
  });

  test('220/140 — a genuine hypertensive-crisis reading the OLD bounds (max 200/130) would have rejected', async () => {
    const res = await request(buildApp())
      .post('/api/blood-pressure')
      .set('x-test-user', OWNER)
      .send({ systolic: 220, diastolic: 140, measured_at: '2026-09-01T07:00:00.000Z' });

    expect(res.status).toBe(201);
    expect(res.body.data.systolic).toBe(220);
    expect(res.body.data.diastolic).toBe(140);
  });
});

describe('POST /api/blood-pressure — the two dates', () => {
  test('log_date normalizes to UTC midnight while measured_at keeps the full instant', async () => {
    const res = await request(buildApp())
      .post('/api/blood-pressure')
      .set('x-test-user', OWNER)
      .send({ systolic: 120, diastolic: 80, log_date: '2026-09-01', measured_at: '2026-09-01T20:15:00.000Z' });

    expect(res.status).toBe(201);
    expect(new Date(res.body.data.log_date).toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(new Date(res.body.data.measured_at).toISOString()).toBe('2026-09-01T20:15:00.000Z');
  });

  test('measured_at defaults to "now" (a real instant) when omitted', async () => {
    const before = Date.now();
    const res = await request(buildApp())
      .post('/api/blood-pressure')
      .set('x-test-user', OWNER)
      .send({ systolic: 120, diastolic: 80 });
    const after = Date.now();

    expect(res.status).toBe(201);
    const measuredAt = new Date(res.body.data.measured_at).getTime();
    expect(measuredAt).toBeGreaterThanOrEqual(before);
    expect(measuredAt).toBeLessThanOrEqual(after);
  });
});

describe('PUT /api/blood-pressure/:id — the same duplicate translation', () => {
  test('an E11000 on save comes back as a clean 409, not a 500', async () => {
    const dupError = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    const doc = {
      _id: 'bp1',
      userId: OWNER,
      systolic: 120,
      diastolic: 80,
      save: jest.fn().mockRejectedValue(dupError),
    };
    BloodPressure.findOne.mockResolvedValue(doc);

    const res = await request(buildApp())
      .put('/api/blood-pressure/bp1')
      .set('x-test-user', OWNER)
      .send({ systolic: 130, diastolic: 85, measured_at: '2026-09-01T07:00:00.000Z' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_READING');
  });
});
