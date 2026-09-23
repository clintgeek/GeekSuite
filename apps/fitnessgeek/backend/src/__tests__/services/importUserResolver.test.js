// resolveImportUser — a drop-folder name to a suite user id: username or
// email, case-insensitive, exact. The collection is faked; the query shape is
// what is under test.
import { describe, test, expect } from '@jest/globals';
import { resolveImportUser } from '../../services/importUserResolver.js';

const USERS = [
  { _id: 'id-clint', username: 'clint@clintgeek.com', email: 'clint@clintgeek.com' },
  { _id: 'id-heather', username: 'heather', email: 'heather@example.com' },
];
const fakeUsers = {
  findOne: async (query, opts) => {
    expect(opts).toEqual({ projection: { _id: 1 } }); // only the id is ever read
    const [a, b] = query.$or;
    return USERS.find((u) => a.username.test(u.username) || b.email.test(u.email)) ?? null;
  },
};
const resolve = (n) => resolveImportUser(n, { users: fakeUsers });

describe('resolveImportUser', () => {
  test('matches a username, case-insensitively', async () => {
    expect(await resolve('Heather')).toBe('id-heather');
  });
  test('matches an email', async () => {
    expect(await resolve('HEATHER@example.com')).toBe('id-heather');
  });
  test('exact only — a prefix or a regex-looking name matches nobody', async () => {
    expect(await resolve('heath')).toBeNull();
    expect(await resolve('.*')).toBeNull();
    expect(await resolve('heather.')).toBeNull();
  });
  test('blank names resolve to nobody without querying', async () => {
    expect(await resolveImportUser('  ', { users: { findOne: () => { throw new Error('queried'); } } })).toBeNull();
  });
});
