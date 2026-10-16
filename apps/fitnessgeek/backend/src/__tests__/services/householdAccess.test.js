/**
 * householdAccess — the C4 read rule: global, your own, or your household's.
 * Never anybody else's, and a failed lookup narrows rather than widens.
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const mod = (p) => new URL(p, import.meta.url).pathname;

const settings = [];
const chain = (value) => ({ select: () => ({ lean: async () => value }) });
const findOne = jest.fn(({ user_id: id }) => chain(settings.find((s) => s.user_id === id) || null));
const find = jest.fn((filter) => chain(settings.filter((s) =>
  s.household?.household_id === filter['household.household_id'] && s.user_id !== filter.user_id.$ne)));

jest.unstable_mockModule(mod('../../models/UserSettings.js'), () => ({
  __esModule: true,
  default: { findOne, find }
}));

const { householdMemberIds, foodReadableFilter } = await import('../../services/householdAccess.js');

beforeEach(() => {
  settings.length = 0;
  settings.push(
    { user_id: 'chef', household: { household_id: 'crocker' } },
    { user_id: 'heather', household: { household_id: 'crocker' } },
    { user_id: 'stranger', household: { household_id: 'elsewhere' } },
    { user_id: 'loner' }
  );
  findOne.mockClear();
});

describe('householdMemberIds', () => {
  test('the other members of the same household, and nobody else', async () => {
    expect(await householdMemberIds('heather')).toEqual(['chef']);
    expect(await householdMemberIds('chef')).toEqual(['heather']);
  });

  test('no household means nobody', async () => {
    expect(await householdMemberIds('loner')).toEqual([]);
    expect(await householdMemberIds(null)).toEqual([]);
  });

  test('a failed lookup is nobody, not everybody', async () => {
    findOne.mockImplementationOnce(() => { throw new Error('mongo down'); });
    expect(await householdMemberIds('heather')).toEqual([]);
  });
});

describe('foodReadableFilter', () => {
  test('global rows, her own, and her household\'s', () => {
    expect(foodReadableFilter('heather', ['chef'])).toEqual({
      $or: [
        { user_id: { $in: ['heather', 'chef'] } },
        { user_id: null },
        { user_id: { $exists: false } }
      ]
    });
  });

  test('with no household it is exactly global plus her own', () => {
    expect(foodReadableFilter('heather').$or[0]).toEqual({ user_id: { $in: ['heather'] } });
  });
});
