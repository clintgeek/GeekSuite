/**
 * A household has a name ("Crocker"), and it is the household's: set on
 * create, taken by whoever joins, and a rename shows for every member.
 */
import mongoose from 'mongoose';

const { default: UserSettings } = await import('../graphql/fitnessgeek/models/UserSettings.js');
const { resolvers } = await import('../graphql/fitnessgeek/resolvers.js');

const { Query: Q, Mutation: M } = resolvers;
const CHEF = String(new mongoose.Types.ObjectId());
const HEATHER = String(new mongoose.Types.ObjectId());
const ctx = (id) => ({ user: { id } });

beforeAll(async () => {
  await UserSettings.db.asPromise();
  await UserSettings.syncIndexes();
}, 60000);

afterEach(async () => {
  await UserSettings.deleteMany({});
});

test('named on create, inherited on join, renamed for everyone', async () => {
  const created = await M.createFitnessHousehold(null, { display_name: 'Clint', name: '  Crocker  ' }, ctx(CHEF));
  expect(created.name).toBe('Crocker');

  const joined = await M.joinFitnessHousehold(null, { household_id: created.household_id, display_name: 'Heather' }, ctx(HEATHER));
  expect(joined.name).toBe('Crocker');
  expect((await Q.fitnessHousehold(null, {}, ctx(HEATHER))).name).toBe('Crocker');

  await M.updateFitnessHouseholdSettings(null, { input: { name: 'The Crockers' } }, ctx(HEATHER));
  expect((await Q.fitnessHousehold(null, {}, ctx(CHEF))).name).toBe('The Crockers');
  expect((await Q.fitnessHousehold(null, {}, ctx(HEATHER))).name).toBe('The Crockers');
});

test('a rename never touches another household', async () => {
  await M.createFitnessHousehold(null, { display_name: 'A', name: 'Ours' }, ctx(CHEF));
  const other = await M.createFitnessHousehold(null, { display_name: 'B', name: 'Theirs' }, ctx(HEATHER));
  await M.updateFitnessHouseholdSettings(null, { input: { name: 'Renamed' } }, ctx(CHEF));
  expect((await Q.fitnessHousehold(null, {}, ctx(HEATHER))).name).toBe('Theirs');
  expect(other.name).toBe('Theirs');
});

test('names are trimmed and capped; blank means no name', async () => {
  const h = await M.createFitnessHousehold(null, { display_name: 'A', name: 'x'.repeat(80) }, ctx(CHEF));
  expect(h.name).toHaveLength(40);
  await M.updateFitnessHouseholdSettings(null, { input: { name: '   ' } }, ctx(CHEF));
  expect((await Q.fitnessHousehold(null, {}, ctx(CHEF))).name).toBeNull();
});
