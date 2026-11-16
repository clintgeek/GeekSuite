/**
 * fitnessgeekHistoryArgs.test.js — SUITE_REVIEW_2026-11 FitnessGeek #1.
 *
 * `fitnessWeights` and `bloodPressures` take optional `startDate`, `endDate`
 * and `limit`, so Home can ask for the newest few rows and the BP page for a
 * window, instead of every row ever on every load. With no arguments the
 * answer is exactly what it was — every row, newest first — because a
 * frontend older than the arguments still sends the bare query.
 *
 * Run as real operations against the merged schema (in-memory Mongo).
 */
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';

const { typeDefs, resolvers } = await import('../graphql/index.js');
const { default: BloodPressure } = await import('../graphql/fitnessgeek/models/BloodPressure.js');
const { default: Weight } = await import('../graphql/fitnessgeek/models/Weight.js');

const HEATHER = String(new mongoose.Types.ObjectId());
const CHEF = String(new mongoose.Types.ObjectId());

let server;
const run = async (query, variables = {}, userId = HEATHER) => {
  const res = await server.executeOperation(
    { query, variables },
    { contextValue: { user: userId ? { id: userId } : null } },
  );
  const r = res.body.singleResult;
  return { data: r.data ?? null, errors: r.errors ?? null };
};
const ok = async (...a) => {
  const { data, errors } = await run(...a);
  if (errors) throw new Error(JSON.stringify(errors));
  return data;
};

const day = (n) => new Date(Date.UTC(2026, 0, 1 + n)); // 2026-01-01 + n days, UTC midnight
const ymd = (n) => day(n).toISOString().slice(0, 10);

beforeAll(async () => {
  await BloodPressure.db.asPromise();
  await BloodPressure.init();
  server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
}, 60000);

beforeEach(async () => {
  // 150 days of weigh-ins and BP readings for Heather — more than the 100
  // the old REST default would have kept — and one row each for Chef.
  const weights = [];
  const bps = [];
  for (let n = 0; n < 150; n += 1) {
    weights.push({ userId: HEATHER, weight_value: 200 - n / 10, log_date: day(n) });
    bps.push({ userId: HEATHER, systolic: 120 + (n % 10), diastolic: 80, log_date: day(n), measured_at: new Date(day(n).getTime() + 12 * 3600e3) });
  }
  weights.push({ userId: CHEF, weight_value: 300, log_date: day(149) });
  bps.push({ userId: CHEF, systolic: 150, diastolic: 95, log_date: day(149), measured_at: new Date(day(149).getTime() + 3600e3) });
  await Weight.insertMany(weights);
  await BloodPressure.insertMany(bps);
});

afterEach(async () => {
  await Promise.all([BloodPressure.deleteMany({}), Weight.deleteMany({})]);
});

afterAll(async () => {
  await server.stop();
  await BloodPressure.db.close();
  try {
    const { getAIGeekConnection } = await import('../config/database.js');
    await getAIGeekConnection().close();
  } catch { /* not opened */ }
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const W = `query ($s: Date, $e: Date, $l: Int) { fitnessWeights(startDate: $s, endDate: $e, limit: $l) { weight_value log_date } }`;
const B = `query ($s: Date, $e: Date, $l: Int) { bloodPressures(startDate: $s, endDate: $e, limit: $l) { systolic log_date } }`;

describe.each([
  ['fitnessWeights', W, 'fitnessWeights'],
  ['bloodPressures', B, 'bloodPressures'],
])('%s history arguments', (_name, query, field) => {
  test('no arguments: every row of the caller, newest first (old frontends)', async () => {
    const bare = `{ ${field} { log_date } }`;
    const rows = (await ok(bare))[field];
    expect(rows).toHaveLength(150);
    expect(rows[0].log_date).toBe(day(149).toISOString());
    expect(rows[149].log_date).toBe(day(0).toISOString());
  });

  test('limit keeps the newest N', async () => {
    const rows = (await ok(query, { l: 20 }))[field];
    expect(rows).toHaveLength(20);
    expect(rows[0].log_date).toBe(day(149).toISOString());
    expect(rows[19].log_date).toBe(day(130).toISOString());
  });

  test('startDate/endDate bound log_date inclusively, with no hidden cap', async () => {
    const rows = (await ok(query, { s: ymd(10), e: ymd(129) }))[field];
    expect(rows).toHaveLength(120);
    expect(rows[0].log_date).toBe(day(129).toISOString());
    expect(rows[119].log_date).toBe(day(10).toISOString());
  });

  test('a window never leaks another user\'s rows', async () => {
    const rows = (await ok(query, { s: ymd(149) }))[field];
    expect(rows).toHaveLength(1);
  });

  test('a limit outside 1-5000 is BAD_USER_INPUT, not a silent default', async () => {
    for (const l of [0, -1, 5001]) {
      const { errors } = await run(query, { l });
      expect(errors[0].extensions.code).toBe('BAD_USER_INPUT');
    }
  });
});
