// Bad input on the medication routes: a malformed id, an unreadable date,
// and the stack trace PUT /:id used to put in its 500.
//
// Hermetic: the same doubles as medicationLogs.test.js.

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const OWNER = 'user-owner';
const OTHER = 'user-other';

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

jest.unstable_mockModule(mod('../../models/Medication.js'), () => {
  const Medication = jest.fn();
  Medication.find = jest.fn();
  Medication.findOne = jest.fn();
  Medication.create = jest.fn();
  return { __esModule: true, default: Medication };
});

jest.unstable_mockModule(mod('../../services/rxService.js'), () => {
  const rx = {
    searchApproximate: jest.fn(),
    resolveRxcuiByName: jest.fn(),
    relatedByTty: jest.fn(),
    getRxTermsInfo: jest.fn(),
    getClassesByRxcui: jest.fn(),
  };
  return { __esModule: true, ...rx, default: rx };
});

jest.unstable_mockModule(mod('../../models/MedicationLog.js'), () => {
  const MedicationLog = jest.fn();
  MedicationLog.create = jest.fn();
  MedicationLog.find = jest.fn();
  MedicationLog.deleteMany = jest.fn();
  return { __esModule: true, default: MedicationLog };
});

const { default: Medication } = await import('../../models/Medication.js');
const { default: MedicationLog } = await import('../../models/MedicationLog.js');
const { default: rx } = await import('../../services/rxService.js');
const { default: medicationRoutes } = await import('../../routes/medicationRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/meds', medicationRoutes);
  return app;
}

// What Mongoose throws for `findOne({ _id: 'undefined' })`.
const castError = () => Object.assign(new Error('Cast to ObjectId failed for value "undefined" (type string) at path "_id" for model "Medication"'), { name: 'CastError' });

beforeEach(() => {
  Medication.findOne.mockReset();
  MedicationLog.create.mockReset();
  MedicationLog.find.mockReset();
});

describe('a malformed medication id is "not found", never a 500', () => {
  test('POST /:id/logs (ticking a dose)', async () => {
    Medication.findOne.mockReturnValue({ select: jest.fn().mockRejectedValue(castError()) });
    const res = await request(buildApp())
      .post('/api/meds/undefined/logs')
      .set('x-test-user', OWNER)
      .send({ date: '2026-01-01', time_of_day: 'morning' });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Medication not found');
    expect(MedicationLog.create).not.toHaveBeenCalled();
  });

  test('GET, PUT and DELETE /:id', async () => {
    Medication.findOne.mockRejectedValue(castError());
    const app = buildApp();
    for (const call of [
      request(app).get('/api/meds/undefined'),
      request(app).put('/api/meds/undefined').send({ display_name: 'Aspirin' }),
      request(app).delete('/api/meds/undefined'),
    ]) {
      const res = await call.set('x-test-user', OWNER);
      expect(res.status).toBe(404);
      expect(res.body.error.message).toBe('Medication not found');
    }
  });
});

describe('PUT /:id never sends a stack trace to the browser', () => {
  test('a failed save answers 500 with a message and no stack', async () => {
    Medication.findOne.mockResolvedValue({
      save: jest.fn().mockRejectedValue(new Error('db is down')),
    });
    const res = await request(buildApp())
      .put('/api/meds/507f1f77bcf86cd799439011')
      .set('x-test-user', OWNER)
      .send({ display_name: 'Aspirin' });
    expect(res.status).toBe(500);
    expect(res.body.error.stack).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/medicationRoutes\.js|at .*\(/);
  });
});

describe('GET /logs/by-date with an unreadable date', () => {
  test('is a 400 and never reaches the database', async () => {
    const res = await request(buildApp())
      .get('/api/meds/logs/by-date?date=yesterday')
      .set('x-test-user', OWNER);
    expect(res.status).toBe(400);
    expect(MedicationLog.find).not.toHaveBeenCalled();
  });
});
