// Ownership and input-validation coverage for the medication DOSE-LOG routes
// (POST /:id/logs, GET /logs/by-date) in src/routes/medicationRoutes.js.
//
// The gap this pins: `POST /:id/logs` stamped the caller's `user_id` on the row
// but never checked that `:id` was one of the CALLER'S medications. Because
// `GET /logs/by-date` answers with `.populate('medication_id')`, a log written
// against a stranger's medication id handed that stranger's whole medication
// document — display name, rxcui, sig, notes — back to whoever wrote the log.
// The row's own owner field was never the problem; the reference was.
//
// Hermetic: Medication, MedicationLog and the auth middleware are jest-mocked.

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

// The route selects `_id` off the medication before creating the log.
const medFound = (id) => ({ select: jest.fn().mockResolvedValue({ _id: id }) });
const medMissing = () => ({ select: jest.fn().mockResolvedValue(null) });

beforeEach(() => {
  Medication.findOne.mockReset();
  MedicationLog.create.mockReset();
  MedicationLog.create.mockResolvedValue({ _id: 'log1' });
});

describe('POST /api/meds/:id/logs — medication ownership', () => {
  test("logging a dose against another user's medication is a 404, and writes nothing", async () => {
    Medication.findOne.mockReturnValue(medMissing());

    const res = await request(buildApp())
      .post('/api/meds/med-belonging-to-someone-else/logs')
      .set('x-test-user', OTHER)
      .send({ date: '2026-01-01', time_of_day: 'morning' });

    expect(res.status).toBe(404);
    expect(Medication.findOne).toHaveBeenCalledWith({
      _id: 'med-belonging-to-someone-else',
      user_id: OTHER,
    });
    expect(MedicationLog.create).not.toHaveBeenCalled();
  });

  test('the owner can log a dose against their own medication', async () => {
    Medication.findOne.mockReturnValue(medFound('med1'));

    const res = await request(buildApp())
      .post('/api/meds/med1/logs')
      .set('x-test-user', OWNER)
      .send({ date: '2026-01-01', time_of_day: 'morning' });

    expect(res.status).toBe(200);
    expect(MedicationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: OWNER, medication_id: 'med1', time_of_day: 'morning' })
    );
  });

  test('the stored log_date is the calendar day at UTC midnight', async () => {
    Medication.findOne.mockReturnValue(medFound('med1'));

    await request(buildApp())
      .post('/api/meds/med1/logs')
      .set('x-test-user', OWNER)
      .send({ date: '2026-01-01', time_of_day: 'evening' });

    const written = MedicationLog.create.mock.calls[0][0];
    expect(written.log_date.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  test('unauthenticated is 401 before any lookup', async () => {
    const res = await request(buildApp())
      .post('/api/meds/med1/logs')
      .send({ date: '2026-01-01', time_of_day: 'morning' });

    expect(res.status).toBe(401);
    expect(Medication.findOne).not.toHaveBeenCalled();
  });
});

describe('POST /api/meds/:id/logs — body validation', () => {
  test('a non-date `date` is a 400, not a 500 from an Invalid Date reaching mongoose', async () => {
    Medication.findOne.mockReturnValue(medFound('med1'));

    const res = await request(buildApp())
      .post('/api/meds/med1/logs')
      .set('x-test-user', OWNER)
      .send({ date: 'not-a-date', time_of_day: 'morning' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(MedicationLog.create).not.toHaveBeenCalled();
  });

  test('a time_of_day outside the shared enum is a 400', async () => {
    Medication.findOne.mockReturnValue(medFound('med1'));

    const res = await request(buildApp())
      .post('/api/meds/med1/logs')
      .set('x-test-user', OWNER)
      .send({ date: '2026-01-01', time_of_day: 'brunch' });

    expect(res.status).toBe(400);
    expect(MedicationLog.create).not.toHaveBeenCalled();
  });

  test('a missing time_of_day is a 400', async () => {
    Medication.findOne.mockReturnValue(medFound('med1'));

    const res = await request(buildApp())
      .post('/api/meds/med1/logs')
      .set('x-test-user', OWNER)
      .send({ date: '2026-01-01' });

    expect(res.status).toBe(400);
    expect(MedicationLog.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/meds/logs/by-date is not shadowed and is owner-scoped', () => {
  test('queries the caller\'s logs across the UTC day', async () => {
    MedicationLog.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([]) }),
    });

    const res = await request(buildApp())
      .get('/api/meds/logs/by-date?date=2026-01-01')
      .set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    const [filter] = MedicationLog.find.mock.calls[0];
    expect(filter.user_id).toBe(OWNER);
    expect(filter.log_date.$gte.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(filter.log_date.$lte.toISOString()).toBe('2026-01-01T23:59:59.999Z');
  });
});

describe('GET /api/meds/search answers the same SHAPE when RxNav fails', () => {
  test('an upstream failure is an empty ARRAY, not the detail route\'s object', async () => {
    // The old catch answered with `{ ingredient, strengths, atcClasses,
    // epcClasses, suggested }` — the DETAIL route's shape — so a caller that
    // mapped over `data` got a TypeError instead of an empty result list.
    rx.searchApproximate.mockRejectedValue(new Error('RxNav is down'));
    rx.resolveRxcuiByName.mockRejectedValue(new Error('RxNav is down'));

    const res = await request(buildApp())
      .get('/api/meds/search?q=lisinopril')
      .set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  test('a successful search still answers with the candidate array', async () => {
    rx.searchApproximate.mockResolvedValue({
      approximateGroup: { candidate: [{ rxcui: '29046', name: 'Lisinopril', score: 100 }] },
    });

    const res = await request(buildApp())
      .get('/api/meds/search?q=lisinopril')
      .set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ rxcui: '29046', name: 'Lisinopril', score: 100 }]);
  });

  test('a missing query is still a 400', async () => {
    const res = await request(buildApp()).get('/api/meds/search').set('x-test-user', OWNER);
    expect(res.status).toBe(400);
  });
});
