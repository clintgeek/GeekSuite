/**
 * bujogeekHabits.test.js
 *
 * Covers habit tracking — the repeating-intention side of BuJoGeek, tracked by
 * presence (one log per day done) rather than by task state:
 *   1. Habit CRUD is owner-scoped end to end (cross-user reads and writes are
 *      indistinguishable from not-found).
 *   2. toggleHabitLog is an idempotent per-day switch, and the (habitId, date)
 *      unique index makes a duplicate create resolve cleanly instead of throwing.
 *   3. Streak computation: gaps break it, unscheduled days do not, today
 *      unlogged does not, and an empty history is zero.
 *   4. deleteHabit cascades its logs.
 */

import mongoose from 'mongoose';
// ESM: the `jest` object is not a global here the way describe/test are.
import { jest } from '@jest/globals';

const { default: Habit } = await import('../graphql/bujogeek/models/Habit.js');
const { default: HabitLog } = await import('../graphql/bujogeek/models/HabitLog.js');
const { default: habitService } = await import('../graphql/bujogeek/services/habitService.js');
const { resolvers } = await import('../graphql/bujogeek/resolvers.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});

const makeHabit = (overrides = {}) =>
  Habit.create({ name: 'Meditate', createdBy: ALICE, ...overrides });

/** Log a day directly, bypassing the toggle. */
const logDay = (habit, day, userId = ALICE) =>
  HabitLog.create({
    habitId: habit._id,
    createdBy: userId,
    date: habitService.toUtcMidnight(day),
  });

beforeAll(async () => {
  await Habit.db.asPromise();
  // The unique index is load-bearing for the toggle — make sure it is built
  // before anything races against it.
  await HabitLog.init();
}, 60000);

afterEach(async () => {
  await Habit.deleteMany({});
  await HabitLog.deleteMany({});
  jest.restoreAllMocks();
});

afterAll(async () => {
  await Habit.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('habit CRUD — owner scoped', () => {
  test('createHabit stamps the caller as owner, trims, and normalises the schedule', async () => {
    const created = await resolvers.Mutation.createHabit(
      null,
      { name: '  Morning pages  ', daysOfWeek: [5, 1, 1, 9, -2], color: '#6098CC' },
      ctx(ALICE)
    );
    expect(created.name).toBe('Morning pages');
    // De-duplicated, sorted, out-of-range values dropped.
    expect(created.daysOfWeek).toEqual([1, 5]);
    expect(created.color).toBe('#6098CC');
    expect(created.archived).toBe(false);
    expect(String(created.createdBy)).toBe(String(ALICE));
  });

  test('a habit with no schedule means every day', async () => {
    const created = await resolvers.Mutation.createHabit(null, { name: 'Water' }, ctx(ALICE));
    expect(created.daysOfWeek).toEqual([]);
    expect(habitService.isScheduled(created, habitService.toUtcMidnight('2026-01-05'))).toBe(true);
    expect(habitService.isScheduled(created, habitService.toUtcMidnight('2026-01-10'))).toBe(true);
  });

  test('habits lists only the caller’s, and hides archived unless asked', async () => {
    await makeHabit({ name: 'Zebra' });
    await makeHabit({ name: 'Apple' });
    await makeHabit({ name: 'Retired', archived: true });
    await makeHabit({ name: 'Bob’s habit', createdBy: BOB });

    const active = await resolvers.Query.habits(null, {}, ctx(ALICE));
    expect(active.map((h) => h.name)).toEqual(['Apple', 'Zebra']);

    const all = await resolvers.Query.habits(null, { includeArchived: true }, ctx(ALICE));
    expect(all.map((h) => h.name)).toEqual(['Apple', 'Zebra', 'Retired']);

    const bobs = await resolvers.Query.habits(null, { includeArchived: true }, ctx(BOB));
    expect(bobs.map((h) => h.name)).toEqual(['Bob’s habit']);

    expect(await resolvers.Query.habits(null, {}, ctx(null))).toEqual([]);
  });

  test('updateHabit renames, reschedules and archives; cross-user denied', async () => {
    const habit = await makeHabit();

    const updated = await resolvers.Mutation.updateHabit(
      null,
      { id: String(habit._id), name: 'Sit', daysOfWeek: [1, 2, 3, 4, 5], archived: true },
      ctx(ALICE)
    );
    expect(updated.name).toBe('Sit');
    expect(updated.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(updated.archived).toBe(true);

    await expect(
      resolvers.Mutation.updateHabit(null, { id: String(habit._id), name: 'pwned' }, ctx(BOB))
    ).rejects.toThrow('Habit not found');
    expect((await Habit.findById(habit._id)).name).toBe('Sit');

    await expect(
      resolvers.Mutation.updateHabit(null, { id: 'not-an-objectid', name: 'x' }, ctx(ALICE))
    ).rejects.toThrow('Habit not found');
  });

  test('unauthenticated writes throw, and the service refuses to run unscoped', async () => {
    const habit = await makeHabit();
    await expect(
      resolvers.Mutation.createHabit(null, { name: 'nope' }, ctx(null))
    ).rejects.toThrow('Unauthorized');
    await expect(
      resolvers.Mutation.deleteHabit(null, { id: String(habit._id) }, ctx(null))
    ).rejects.toThrow('Unauthorized');
    await expect(
      resolvers.Mutation.toggleHabitLog(
        null,
        { habitId: String(habit._id), date: '2026-01-05' },
        ctx(null)
      )
    ).rejects.toThrow('Unauthorized');

    await expect(habitService.listHabits()).rejects.toThrow('Unauthorized');
    await expect(habitService.findOwnedHabit(String(habit._id))).rejects.toThrow('Unauthorized');
    await expect(habitService.getLogs({ startDate: '2026-01-01', endDate: '2026-01-07' })).rejects.toThrow(
      'Unauthorized'
    );
  });
});

describe('toggleHabitLog', () => {
  test('toggles a day on, then off — and is idempotent per day', async () => {
    const habit = await makeHabit();
    const args = { habitId: String(habit._id), date: '2026-01-05' };

    const on = await resolvers.Mutation.toggleHabitLog(null, args, ctx(ALICE));
    expect(on.done).toBe(true);
    expect(on.log.date.toISOString()).toBe('2026-01-05T00:00:00.000Z');
    expect(await HabitLog.countDocuments({ habitId: habit._id })).toBe(1);

    const off = await resolvers.Mutation.toggleHabitLog(null, args, ctx(ALICE));
    expect(off.done).toBe(false);
    expect(off.log).toBeNull();
    expect(await HabitLog.countDocuments({ habitId: habit._id })).toBe(0);

    const onAgain = await resolvers.Mutation.toggleHabitLog(null, args, ctx(ALICE));
    expect(onAgain.done).toBe(true);
    expect(await HabitLog.countDocuments({ habitId: habit._id })).toBe(1);
  });

  test('a date with a time component is stored at UTC midnight', async () => {
    const habit = await makeHabit();
    const res = await resolvers.Mutation.toggleHabitLog(
      null,
      { habitId: String(habit._id), date: '2026-01-05T17:42:11.000Z' },
      ctx(ALICE)
    );
    expect(res.log.date.toISOString()).toBe('2026-01-05T00:00:00.000Z');
  });

  test('the (habitId, date) index rejects a second row for the same day', async () => {
    const habit = await makeHabit();
    await logDay(habit, '2026-01-05');
    await expect(logDay(habit, '2026-01-05')).rejects.toMatchObject({ code: 11000 });
  });

  test('a duplicate create loses the race cleanly and reports the day as done', async () => {
    const habit = await makeHabit();
    await logDay(habit, '2026-01-05');

    // Simulate the race: the delete probe misses the row another writer just
    // inserted, so the create hits the unique index.
    jest.spyOn(HabitLog, 'findOneAndDelete').mockResolvedValueOnce(null);

    const res = await habitService.toggleHabitLog(String(habit._id), '2026-01-05', ALICE);
    expect(res.done).toBe(true);
    expect(res.log).not.toBeNull();
    expect(await HabitLog.countDocuments({ habitId: habit._id })).toBe(1);
  });

  test('concurrent toggles of the same day never throw', async () => {
    const habit = await makeHabit();
    const toggle = () => habitService.toggleHabitLog(String(habit._id), '2026-01-05', ALICE);
    await expect(Promise.all([toggle(), toggle(), toggle()])).resolves.toHaveLength(3);
    expect(await HabitLog.countDocuments({ habitId: habit._id })).toBeLessThanOrEqual(1);
  });

  test('cannot toggle somebody else’s habit, nor one that does not exist', async () => {
    const habit = await makeHabit();
    await expect(
      resolvers.Mutation.toggleHabitLog(
        null,
        { habitId: String(habit._id), date: '2026-01-05' },
        ctx(BOB)
      )
    ).rejects.toThrow('Habit not found');
    await expect(
      resolvers.Mutation.toggleHabitLog(null, { habitId: 'not-an-objectid', date: '2026-01-05' }, ctx(ALICE))
    ).rejects.toThrow('Habit not found');
    expect(await HabitLog.countDocuments({})).toBe(0);
  });

  test('habitLogs returns only the caller’s logs, inside the window, oldest first', async () => {
    const mine = await makeHabit();
    const bobs = await makeHabit({ name: 'Bob’s habit', createdBy: BOB });
    await logDay(mine, '2026-01-07');
    await logDay(mine, '2026-01-05');
    await logDay(mine, '2026-01-20'); // outside the window
    await logDay(bobs, '2026-01-06', BOB);

    const logs = await resolvers.Query.habitLogs(
      null,
      { startDate: '2026-01-01', endDate: '2026-01-10' },
      ctx(ALICE)
    );
    expect(logs.map((l) => l.date.toISOString().slice(0, 10))).toEqual(['2026-01-05', '2026-01-07']);

    const bobsLogs = await resolvers.Query.habitLogs(
      null,
      { startDate: '2026-01-01', endDate: '2026-01-10' },
      ctx(BOB)
    );
    expect(bobsLogs).toHaveLength(1);
  });
});

describe('currentStreak', () => {
  test('an every-day habit counts back to the first gap', async () => {
    const habit = await makeHabit();
    // Today = Thu 2026-01-08. Done the 8th, 7th, 6th; missed the 5th.
    for (const day of ['2026-01-08', '2026-01-07', '2026-01-06', '2026-01-03']) {
      await logDay(habit, day);
    }
    expect(await habitService.getCurrentStreak(habit, ALICE, '2026-01-08')).toBe(3);
  });

  test('today unlogged does not break the streak — it just does not count', async () => {
    const habit = await makeHabit();
    await logDay(habit, '2026-01-07');
    await logDay(habit, '2026-01-06');
    // Today (the 8th) is still open.
    expect(await habitService.getCurrentStreak(habit, ALICE, '2026-01-08')).toBe(2);
    // Logging it makes it count.
    await logDay(habit, '2026-01-08');
    expect(await habitService.getCurrentStreak(habit, ALICE, '2026-01-08')).toBe(3);
  });

  test('yesterday unlogged does break it', async () => {
    const habit = await makeHabit();
    await logDay(habit, '2026-01-06');
    expect(await habitService.getCurrentStreak(habit, ALICE, '2026-01-08')).toBe(0);
  });

  test('a weekday-only habit survives the weekend', async () => {
    // 2026-01-02 is a Friday; 3rd/4th are Sat/Sun; 5th Mon, 6th Tue.
    const habit = await makeHabit({ name: 'Standup', daysOfWeek: [1, 2, 3, 4, 5] });
    for (const day of ['2026-01-06', '2026-01-05', '2026-01-02', '2026-01-01']) {
      await logDay(habit, day);
    }
    // Tue, Mon, Fri, Thu — the untracked weekend is skipped, not a break.
    expect(await habitService.getCurrentStreak(habit, ALICE, '2026-01-06')).toBe(4);

    // Asked on the Sunday, the streak still stands at Fri+Thu — an unscheduled
    // "today" neither counts nor breaks.
    expect(await habitService.getCurrentStreak(habit, ALICE, '2026-01-04')).toBe(2);
  });

  test('a missed scheduled weekday breaks it even across a weekend', async () => {
    const habit = await makeHabit({ name: 'Standup', daysOfWeek: [1, 2, 3, 4, 5] });
    await logDay(habit, '2026-01-05'); // Mon
    // Friday the 2nd was missed, so the streak is just Monday.
    expect(await habitService.getCurrentStreak(habit, ALICE, '2026-01-05')).toBe(1);
  });

  test('a habit with no history has a zero streak', async () => {
    const habit = await makeHabit();
    expect(await habitService.getCurrentStreak(habit, ALICE, '2026-01-08')).toBe(0);
  });

  test('another user’s logs never feed a streak', async () => {
    const habit = await makeHabit();
    await logDay(habit, '2026-01-08');
    await logDay(habit, '2026-01-07');
    expect(await habitService.getCurrentStreak(habit, ALICE, '2026-01-08')).toBe(2);
    expect(await habitService.getCurrentStreak(habit, BOB, '2026-01-08')).toBe(0);
  });

  test('the Habit.currentStreak resolver is user-scoped', async () => {
    const habit = await makeHabit();
    await logDay(habit, habitService.dateKey(new Date()));
    expect(await resolvers.Habit.currentStreak(habit, {}, ctx(ALICE))).toBe(1);
    expect(await resolvers.Habit.currentStreak(habit, {}, ctx(BOB))).toBe(0);
    expect(await resolvers.Habit.currentStreak(habit, {}, ctx(null))).toBe(0);
  });
});

describe('deleteHabit', () => {
  test('takes the habit’s whole log history with it, leaving other habits alone', async () => {
    const habit = await makeHabit();
    const other = await makeHabit({ name: 'Read' });
    await logDay(habit, '2026-01-05');
    await logDay(habit, '2026-01-06');
    await logDay(other, '2026-01-05');

    const res = await resolvers.Mutation.deleteHabit(null, { id: String(habit._id) }, ctx(ALICE));
    expect(res.success).toBe(true);
    expect(await Habit.findById(habit._id)).toBeNull();
    expect(await HabitLog.countDocuments({ habitId: habit._id })).toBe(0);
    expect(await HabitLog.countDocuments({ habitId: other._id })).toBe(1);
  });

  test('cannot delete another user’s habit, nor touch its logs', async () => {
    const habit = await makeHabit();
    await logDay(habit, '2026-01-05');

    await expect(
      resolvers.Mutation.deleteHabit(null, { id: String(habit._id) }, ctx(BOB))
    ).rejects.toThrow('Habit not found');

    expect(await Habit.findById(habit._id)).not.toBeNull();
    expect(await HabitLog.countDocuments({ habitId: habit._id })).toBe(1);
  });
});
