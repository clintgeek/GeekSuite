// GET /api/health/breakers — read-only circuit breaker stats endpoint.
// DOCS/TODO_ORDER.md #23.
//
// Exercises the real app (src/app.js), same as auth.test.js — this route
// touches no DB/Redis/network, so no mocks are needed beyond what app.js
// itself requires at load time (which auth.test.js already proves is safe
// to import standalone in jest).

const request = require('supertest');
const app = require('../../app');

describe('GET /api/health/breakers', () => {
  test('answers 200 with no auth, matching /api/health', async () => {
    const res = await request(app).get('/api/health/breakers');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
    expect(typeof res.body.breakers).toBe('object');
  });

  test('reports every upstream breaker instantiated by the service modules', async () => {
    const res = await request(app).get('/api/health/breakers');

    // usda + openfoodfacts (foodApiService.js), calorieninjas
    // (calorieNinjasService.js), and garmin (garminConnectService.js) are
    // all required transitively by app.js's routes, so their breakers exist
    // by the time this request runs.
    for (const name of ['usda', 'openfoodfacts', 'calorieninjas', 'garmin']) {
      expect(res.body.breakers[name]).toEqual({
        state: expect.stringMatching(/^(open|halfOpen|closed)$/),
        stats: expect.objectContaining({
          fires: expect.any(Number),
          successes: expect.any(Number),
          failures: expect.any(Number),
          rejects: expect.any(Number),
          timeouts: expect.any(Number),
        }),
      });
    }
  });
});
