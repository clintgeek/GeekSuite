/**
 * fitnessgeekErrorsAndBp.test.js — review 2026-10-16: B13, C1, and the P2s
 * on blood pressure, deletes and medications. Run as real operations against
 * the real merged schema, so what is asserted is what a browser receives.
 *
 *   - Errors never leak: CastError / E11000 / bugs reach the client as one
 *     plain sentence; deliberate messages pass through untouched.
 *   - C1: a second BP reading in the same instant is BP_DUPLICATE, in words.
 *   - The newest BP reading of a day comes first.
 *   - A delete of nothing is an error, not `false`.
 *   - Deleting a medication deletes its dose logs.
 */
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';
import { GraphQLError } from 'graphql';

const { typeDefs, resolvers } = await import('../graphql/index.js');
const { default: BloodPressure } = await import('../graphql/fitnessgeek/models/BloodPressure.js');
const { default: Weight } = await import('../graphql/fitnessgeek/models/Weight.js');
const { default: Medication } = await import('../graphql/fitnessgeek/models/Medication.js');
const { isInternalError, INTERNAL_MESSAGE } = await import('../graphql/fitnessgeek/errors.js');

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

const doseLogs = () => Medication.db.collection('medicationlogs');

beforeAll(async () => {
  await BloodPressure.db.asPromise();
  await BloodPressure.init(); // the (userId, measured_at) unique index
  server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
}, 60000);

afterEach(async () => {
  await Promise.all([
    BloodPressure.deleteMany({}),
    Weight.deleteMany({}),
    Medication.deleteMany({}),
    doseLogs().deleteMany({}),
  ]);
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

const ADD_BP = `mutation ($input: BloodPressureInput!) { addBloodPressure(input: $input) { id systolic measured_at } }`;
const UPDATE_BP = `mutation ($id: ID!, $input: BloodPressureInput!) { updateBloodPressure(id: $id, input: $input) { id } }`;
const LIST_BP = `{ bloodPressures { id systolic measured_at } }`;

describe('errors never leak (B13)', () => {
  test('a CastError reaches the client as a plain sentence, not mongoose text', async () => {
    const { errors } = await run(`{ fitnessWeight(id: "not-an-id") { id } }`);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe(INTERNAL_MESSAGE);
    expect(errors[0].extensions.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(errors)).not.toMatch(/Cast to|ObjectId|not-an-id/);
  });

  test('a deliberate plain-Error message still passes through', async () => {
    const { errors } = await run(
      `mutation { updateFoodLog(id: "nope", input: { servings: 2 }) { id } }`
    );
    expect(errors[0].message).toBe('Food log not found');
  });

  test('a GraphQLError with a code passes through untouched', async () => {
    const { errors } = await run(`{ fitnessMeals(search: "${'x'.repeat(201)}") { id } }`);
    expect(errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });

  test('"Unauthorized" still says Unauthorized (the client signs out on it)', async () => {
    const { errors } = await run(`{ bloodPressures { id } }`, {}, null);
    expect(errors[0].message).toBe('Unauthorized');
  });

  test('what counts as internal', () => {
    expect(isInternalError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(true);
    expect(isInternalError(Object.assign(new Error('E11000 duplicate key error collection: x'), { code: 11000 }))).toBe(true);
    expect(isInternalError(new Error('Request failed with status code 502'))).toBe(true);
    class MongoServerError extends Error {}
    expect(isInternalError(new MongoServerError('anything'))).toBe(true);
    expect(isInternalError(new Error('Household not found'))).toBe(false);
    expect(isInternalError(new GraphQLError('You already saved a reading at that time.'))).toBe(false);
  });
});

describe('C1 — a duplicate BP reading', () => {
  const reading = { systolic: 128, diastolic: 82, pulse: 70, measured_at: '2026-10-16T12:42:00.000Z', log_date: '2026-10-16' };

  test('adding the same instant twice is BP_DUPLICATE, in plain words, with no Mongo text', async () => {
    await ok(ADD_BP, { input: reading });
    const { errors } = await run(ADD_BP, { input: { ...reading, systolic: 124 } });
    expect(errors[0].message).toBe('You already saved a reading at that time.');
    expect(errors[0].extensions.code).toBe('BP_DUPLICATE');
    expect(JSON.stringify(errors)).not.toMatch(/E11000|duplicate key|userId/);
    expect(await BloodPressure.countDocuments({ userId: HEATHER })).toBe(1);
  });

  test('moving a reading onto another one\'s instant is BP_DUPLICATE too', async () => {
    await ok(ADD_BP, { input: reading });
    const other = await ok(ADD_BP, { input: { ...reading, measured_at: '2026-10-16T12:43:00.000Z' } });
    const { errors } = await run(UPDATE_BP, { id: other.addBloodPressure.id, input: reading });
    expect(errors[0].extensions.code).toBe('BP_DUPLICATE');
  });

  test('the same instant for a different person is fine', async () => {
    await ok(ADD_BP, { input: reading });
    await ok(ADD_BP, { input: reading }, CHEF);
  });
});

describe('BP order — newest reading of the day first', () => {
  test('the evening reading is listed before the morning one', async () => {
    const day = { diastolic: 80, log_date: '2026-10-16' };
    await ok(ADD_BP, { input: { ...day, systolic: 131, measured_at: '2026-10-16T12:05:00.000Z' } }); // morning, saved first
    await ok(ADD_BP, { input: { ...day, systolic: 119, measured_at: '2026-10-17T00:30:00.000Z' } }); // evening
    await ok(ADD_BP, { input: { diastolic: 80, systolic: 140, log_date: '2026-10-15', measured_at: '2026-10-15T13:00:00.000Z' } });
    const { bloodPressures } = await ok(LIST_BP);
    expect(bloodPressures.map((b) => b.systolic)).toEqual([119, 131, 140]);
  });

  test('the AI context\'s "latest" is the newest too', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const at = (h) => `${today}T${String(h).padStart(2, '0')}:00:00.000Z`;
    await ok(ADD_BP, { input: { systolic: 131, diastolic: 85, log_date: today, measured_at: at(1) } });
    await ok(ADD_BP, { input: { systolic: 119, diastolic: 75, log_date: today, measured_at: at(2) } });
    const { fitnessInsightsContext } = await ok(`{ fitnessInsightsContext(days: 3) }`);
    expect(fitnessInsightsContext.bloodPressure.latest).toEqual({ systolic: 119, diastolic: 75 });
  });
});

describe('a delete of nothing is an error, not false', () => {
  test('BP', async () => {
    const id = String(new mongoose.Types.ObjectId());
    const { errors } = await run(`mutation ($id: ID!) { deleteBloodPressure(id: $id) }`, { id });
    expect(errors[0].extensions.code).toBe('NOT_FOUND');
    expect(errors[0].message).toBe('That reading was already deleted.');
  });

  test('another person\'s BP reading is "already deleted" too, and stays', async () => {
    const chefs = await BloodPressure.create({ userId: CHEF, systolic: 120, diastolic: 80, log_date: new Date('2026-10-16') });
    const { errors } = await run(`mutation ($id: ID!) { deleteBloodPressure(id: $id) }`, { id: String(chefs._id) });
    expect(errors[0].extensions.code).toBe('NOT_FOUND');
    expect(await BloodPressure.countDocuments({ _id: chefs._id })).toBe(1);
  });

  test('a real BP delete still answers true', async () => {
    const mine = await BloodPressure.create({ userId: HEATHER, systolic: 120, diastolic: 80, log_date: new Date('2026-10-16') });
    expect((await ok(`mutation ($id: ID!) { deleteBloodPressure(id: $id) }`, { id: String(mine._id) })).deleteBloodPressure).toBe(true);
  });

  test('weight', async () => {
    const { errors } = await run(`mutation { deleteFitnessWeight(id: "${new mongoose.Types.ObjectId()}") }`);
    expect(errors[0].extensions.code).toBe('NOT_FOUND');
    expect(errors[0].message).toBe('That weight was already deleted.');
  });
});

describe('deleteFitnessMedication takes its dose logs with it', () => {
  test('only that medication\'s, only that person\'s', async () => {
    const med = await Medication.create({ user_id: HEATHER, display_name: 'Lisinopril', times_of_day: ['morning'] });
    const keep = await Medication.create({ user_id: HEATHER, display_name: 'Vitamin D', times_of_day: ['morning'] });
    await doseLogs().insertMany([
      { user_id: HEATHER, medication_id: med._id, log_date: new Date('2026-10-15'), time_of_day: 'morning', taken: true },
      { user_id: HEATHER, medication_id: med._id, log_date: new Date('2026-10-16'), time_of_day: 'morning', taken: true },
      { user_id: HEATHER, medication_id: keep._id, log_date: new Date('2026-10-16'), time_of_day: 'morning', taken: true },
      { user_id: CHEF, medication_id: med._id, log_date: new Date('2026-10-16'), time_of_day: 'morning', taken: true },
    ]);
    const data = await ok(`mutation ($id: ID!) { deleteFitnessMedication(id: $id) }`, { id: String(med._id) });
    expect(data.deleteFitnessMedication).toBe(true);
    expect(await Medication.countDocuments({ _id: med._id })).toBe(0);
    expect(await doseLogs().countDocuments({ medication_id: med._id, user_id: HEATHER })).toBe(0);
    expect(await doseLogs().countDocuments({ medication_id: keep._id })).toBe(1);
    expect(await doseLogs().countDocuments({ user_id: CHEF })).toBe(1);
  });

  test('another person\'s medication is not found, and its doses stay', async () => {
    const chefs = await Medication.create({ user_id: CHEF, display_name: 'Statin', times_of_day: ['evening'] });
    await doseLogs().insertOne({ user_id: CHEF, medication_id: chefs._id, log_date: new Date('2026-10-16'), time_of_day: 'evening' });
    const { errors } = await run(`mutation ($id: ID!) { deleteFitnessMedication(id: $id) }`, { id: String(chefs._id) });
    expect(errors[0].extensions.code).toBe('NOT_FOUND');
    expect(await doseLogs().countDocuments({ user_id: CHEF })).toBe(1);
  });
});
