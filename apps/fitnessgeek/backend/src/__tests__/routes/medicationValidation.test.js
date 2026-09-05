// Input-validation coverage for medicationRoutes.js (POST / create,
// PUT /:id update), added as part of DOCS/TODO_ORDER.md #22.
//
// Hermetic: the Medication model and auth middleware are jest-mocked, no
// live Mongo. MedicationLog/rxService/indicationMap are untouched by the two
// routes under test, so they're left as their real (require-only, no I/O at
// import time) modules.

const express = require('express');
const request = require('supertest');

const OWNER = 'user-owner';

jest.mock('../../middleware/auth', () => ({
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

jest.mock('../../models/Medication', () => {
  const Medication = jest.fn();
  Medication.find = jest.fn();
  Medication.findOne = jest.fn();
  Medication.create = jest.fn();
  return Medication;
});

const Medication = require('../../models/Medication');
const medicationRoutes = require('../../routes/medicationRoutes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/medications', medicationRoutes);
  return app;
}

beforeEach(() => {
  Medication.findOne.mockResolvedValue(null); // no existing med with that display_name
});

describe('POST /api/medications validation', () => {
  test('accepted: a minimal valid medication is created', async () => {
    Medication.create.mockResolvedValue({ _id: 'm1', display_name: 'Lisinopril', med_type: 'rx' });

    const res = await request(buildApp())
      .post('/api/medications')
      .set('x-test-user', OWNER)
      .send({ display_name: 'Lisinopril', med_type: 'rx', times_of_day: ['morning'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Medication.create).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: 'Lisinopril', med_type: 'rx' })
    );
  });

  test('rejected: missing display_name never reaches the controller', async () => {
    const res = await request(buildApp())
      .post('/api/medications')
      .set('x-test-user', OWNER)
      .send({ med_type: 'rx' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'display_name' })])
    );
    expect(Medication.findOne).not.toHaveBeenCalled();
  });

  test('rejected: an unrecognized med_type is now a 400 (previously silently defaulted to "rx")', async () => {
    const res = await request(buildApp())
      .post('/api/medications')
      .set('x-test-user', OWNER)
      .send({ display_name: 'Something', med_type: 'prescription' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'med_type' })])
    );
  });
});

describe('PUT /api/medications/:id validation', () => {
  test('accepted: updating times_of_day on an existing medication', async () => {
    const med = {
      _id: 'm1',
      user_id: OWNER,
      display_name: 'Lisinopril',
      times_of_day: ['morning'],
      save: jest.fn().mockResolvedValue(true),
    };
    Medication.findOne.mockResolvedValue(med);

    const res = await request(buildApp())
      .put('/api/medications/m1')
      .set('x-test-user', OWNER)
      .send({ times_of_day: ['morning', 'evening'] });

    expect(res.status).toBe(200);
    expect(med.times_of_day).toEqual(['morning', 'evening']);
  });

  test('rejected: an invalid times_of_day entry is a 400', async () => {
    const res = await request(buildApp())
      .put('/api/medications/m1')
      .set('x-test-user', OWNER)
      .send({ times_of_day: ['brunch'] });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'times_of_day.0' })])
    );
    expect(Medication.findOne).not.toHaveBeenCalled();
  });

  test('rejected: days_supply outside the model\'s bounds (1-3650) is a 400', async () => {
    const res = await request(buildApp())
      .put('/api/medications/m1')
      .set('x-test-user', OWNER)
      .send({ days_supply: 999999 });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'days_supply' })])
    );
  });
});

describe('400 shape', () => {
  test('matches { success:false, error: { message, code, details: [{ path, message }] } }', async () => {
    const res = await request(buildApp())
      .post('/api/medications')
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
