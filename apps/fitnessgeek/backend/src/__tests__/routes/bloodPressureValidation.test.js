// Input-validation coverage for bloodPressureRoutes.js (POST /, PUT /:id),
// added as part of DOCS/TODO_ORDER.md #22.
//
// Hermetic: the BloodPressure model and auth middleware are jest-mocked, no
// live Mongo.

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const OWNER = 'user-owner';

// jest resolves an `unstable_mockModule` specifier against the *setup* file
// rather than this one, so every relative mock target is made absolute first.
// (Same shape as flockgeek's and storygeek's ESM suites.)
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

// Dynamic imports: they must resolve AFTER the mock registrations above.
const { default: BloodPressure } = await import('../../models/BloodPressure.js');
const { default: bloodPressureRoutes } = await import('../../routes/bloodPressureRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/blood-pressure', bloodPressureRoutes);
  return app;
}

beforeEach(() => {
  BloodPressure.findOne.mockResolvedValue(null); // no same-day log already exists
});

describe('POST /api/blood-pressure validation', () => {
  test('accepted: a plausible systolic/diastolic/pulse reading is created', async () => {
    const res = await request(buildApp())
      .post('/api/blood-pressure')
      .set('x-test-user', OWNER)
      .send({ systolic: 120, diastolic: 80, pulse: 70, log_date: '2026-09-01' });

    expect(res.status).toBe(201);
    expect(res.body.data.systolic).toBe(120);
    expect(res.body.data.diastolic).toBe(80);
  });

  test('rejected: systolic <= diastolic is a 400 (matches the controller\'s own rule)', async () => {
    const res = await request(buildApp())
      .post('/api/blood-pressure')
      .set('x-test-user', OWNER)
      .send({ systolic: 80, diastolic: 90 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'systolic' })])
    );
    expect(BloodPressure.findOne).not.toHaveBeenCalled();
  });

  test('rejected: diastolic out of the model\'s bounds (40-130) is a 400', async () => {
    const res = await request(buildApp())
      .post('/api/blood-pressure')
      .set('x-test-user', OWNER)
      .send({ systolic: 150, diastolic: 20 });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'diastolic' })])
    );
  });
});

describe('PUT /api/blood-pressure/:id validation', () => {
  test('accepted: a valid updated reading is applied', async () => {
    const doc = { _id: 'bp1', userId: OWNER, systolic: 120, diastolic: 80, save: jest.fn().mockResolvedValue(true) };
    BloodPressure.findOne.mockResolvedValue(doc);

    const res = await request(buildApp())
      .put('/api/blood-pressure/bp1')
      .set('x-test-user', OWNER)
      .send({ systolic: 130, diastolic: 85 });

    expect(res.status).toBe(200);
    expect(doc.systolic).toBe(130);
  });

  test('rejected: missing diastolic is still required on update', async () => {
    const res = await request(buildApp())
      .put('/api/blood-pressure/bp1')
      .set('x-test-user', OWNER)
      .send({ systolic: 130 });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'diastolic' })])
    );
    expect(BloodPressure.findOne).not.toHaveBeenCalled();
  });

  test('rejected: an unrecognized field is a 400 (previously silently ignored)', async () => {
    const res = await request(buildApp())
      .put('/api/blood-pressure/bp1')
      .set('x-test-user', OWNER)
      .send({ systolic: 130, diastolic: 85, status: 'Normal' });

    expect(res.status).toBe(400);
    // zod's `.strict()` reports unrecognized keys as one root-level issue
    // naming them, rather than a per-key path.
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('status') })])
    );
  });
});

describe('400 shape', () => {
  test('matches { success:false, error: { message, code, details: [{ path, message }] } }', async () => {
    const res = await request(buildApp())
      .post('/api/blood-pressure')
      .set('x-test-user', OWNER)
      .send({});

    expect(res.body).toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
        code: 'VALIDATION_ERROR',
        details: expect.any(Array),
      },
    });
    expect(res.body.error.details[0]).toMatchObject({
      path: expect.any(String),
      message: expect.any(String),
    });
  });
});
