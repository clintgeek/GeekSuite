import mongoose from 'mongoose';
import Habit from '../models/Habit.js';
import HabitLog from '../models/HabitLog.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How far back a streak is allowed to reach. A streak longer than a year is not
 * worth a bigger read, and the cap doubles as the loop's termination guard.
 */
const STREAK_LOOKBACK_DAYS = 366;

/**
 * HabitService — habits and their daily logs.
 *
 * Ownership discipline mirrors collectionService: every method funnels through
 * `requireUser`, every query carries `createdBy`, and an id belonging to
 * somebody else is indistinguishable from an id that does not exist.
 *
 * Dates are calendar dates, never instants: everything is normalised to UTC
 * midnight so "did I do this on the 5th" is an equality test.
 */
class HabitService {
  requireUser(userId) {
    if (!userId) {
      const err = new Error('Unauthorized');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    return userId;
  }

  /**
   * Coerce a calendar date to UTC midnight.
   *
   * Strings are read as calendar dates (`2026-01-05`, or the date half of an
   * ISO timestamp) — the API only ever accepts that form. Date instances are
   * read by their UTC components, because any Date reaching this service was
   * built from such a string and is already anchored to UTC.
   */
  toUtcMidnight(value) {
    if (!value) return new Date(new Date().setUTCHours(0, 0, 0, 0));
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    }
    const parts = String(value).split('T')[0].split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n))) return null;
    const [y, m, d] = parts;
    const date = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  /** `yyyy-MM-dd` for a UTC-midnight date — the key used to compare days. */
  dateKey(date) {
    const d = new Date(date);
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${d.getUTCFullYear()}-${m}-${day}`;
  }

  /** Sorted, de-duplicated day numbers; anything out of 0-6 is dropped. */
  normalizeDays(days) {
    if (!Array.isArray(days)) return [];
    const set = new Set();
    for (const raw of days) {
      const n = Number(raw);
      if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n);
    }
    return [...set].sort((a, b) => a - b);
  }

  /** Is this habit due on this (UTC-midnight) day? Empty schedule = every day. */
  isScheduled(habit, date) {
    const days = Array.isArray(habit?.daysOfWeek) ? habit.daysOfWeek : [];
    if (days.length === 0) return true;
    return days.includes(new Date(date).getUTCDay());
  }

  /** The user's habits — unarchived first, then alphabetical. */
  async listHabits(userId, includeArchived = false) {
    this.requireUser(userId);
    const filter = { createdBy: userId };
    if (!includeArchived) filter.archived = false;
    return Habit.find(filter).sort({ archived: 1, name: 1 });
  }

  /**
   * Load a habit by id, scoped to its owner. Null for a malformed id, a
   * missing one, and somebody else's alike — callers must not tell them apart.
   */
  async findOwnedHabit(habitId, userId) {
    this.requireUser(userId);
    if (!mongoose.Types.ObjectId.isValid(habitId)) return null;
    return Habit.findOne({ _id: habitId, createdBy: userId });
  }

  async createHabit({ name, daysOfWeek, color, createdBy }) {
    this.requireUser(createdBy);
    return new Habit({
      name,
      daysOfWeek: this.normalizeDays(daysOfWeek),
      color: color ?? null,
      createdBy,
    }).save();
  }

  async updateHabit(habitId, updates, userId) {
    this.requireUser(userId);
    if (!mongoose.Types.ObjectId.isValid(habitId)) return null;

    const safe = {};
    if (updates?.name !== undefined) safe.name = updates.name;
    if (updates?.daysOfWeek !== undefined) safe.daysOfWeek = this.normalizeDays(updates.daysOfWeek);
    if (updates?.color !== undefined) safe.color = updates.color ?? null;
    if (updates?.archived !== undefined) safe.archived = Boolean(updates.archived);

    return Habit.findOneAndUpdate({ _id: habitId, createdBy: userId }, safe, {
      new: true,
      runValidators: true,
    });
  }

  /** Deleting a habit takes its whole history with it — the logs mean nothing alone. */
  async deleteHabit(habitId, userId) {
    this.requireUser(userId);
    const habit = await this.findOwnedHabit(habitId, userId);
    if (!habit) return null;

    await HabitLog.deleteMany({ createdBy: userId, habitId: habit._id });
    await Habit.deleteOne({ _id: habit._id, createdBy: userId });
    return habit;
  }

  /**
   * Mark a day done, or un-mark it — whichever the current state is not.
   *
   * Returns `{ habit, done, log }`, or null when the habit is not the caller's.
   * A concurrent duplicate create loses the unique index race and is reported
   * as done rather than as an error: the caller asked for the day to be marked,
   * and it is.
   */
  async toggleHabitLog(habitId, date, userId) {
    this.requireUser(userId);
    const habit = await this.findOwnedHabit(habitId, userId);
    if (!habit) return null;

    const day = this.toUtcMidnight(date);
    if (!day) {
      const err = new Error('Invalid date');
      err.code = 'BAD_USER_INPUT';
      throw err;
    }

    const removed = await HabitLog.findOneAndDelete({
      habitId: habit._id,
      createdBy: userId,
      date: day,
    });
    if (removed) return { habit, done: false, log: null };

    try {
      const log = await HabitLog.create({ habitId: habit._id, createdBy: userId, date: day });
      return { habit, done: true, log };
    } catch (err) {
      if (err?.code === 11000) {
        const log = await HabitLog.findOne({ habitId: habit._id, createdBy: userId, date: day });
        return { habit, done: true, log };
      }
      throw err;
    }
  }

  /** Every log the user has in a date window, oldest first. */
  async getLogs({ userId, startDate, endDate }) {
    this.requireUser(userId);
    const start = this.toUtcMidnight(startDate);
    const end = this.toUtcMidnight(endDate);
    if (!start || !end) return [];
    return HabitLog.find({ createdBy: userId, date: { $gte: start, $lte: end } }).sort({ date: 1 });
  }

  /**
   * Consecutive scheduled days done, counting back from today.
   *
   * Three rules make this behave the way a person keeps a streak in their head:
   *   - a day the habit is not scheduled for is skipped entirely — it neither
   *     counts nor breaks (a weekday habit survives the weekend);
   *   - today, if scheduled and not yet logged, does not break the streak
   *     either — the day is not over. It just does not count yet;
   *   - any *earlier* scheduled day that is unlogged ends the count.
   */
  async getCurrentStreak(habit, userId, today = undefined) {
    this.requireUser(userId);
    const habitId = habit?._id ?? habit?.id ?? habit;
    if (!mongoose.Types.ObjectId.isValid(habitId)) return 0;

    const end = this.toUtcMidnight(today);
    if (!end) return 0;
    const start = new Date(end.getTime() - STREAK_LOOKBACK_DAYS * DAY_MS);

    const logs = await HabitLog.find({
      createdBy: userId,
      habitId,
      date: { $gte: start, $lte: end },
    }).select('date');
    if (logs.length === 0) return 0;

    const done = new Set(logs.map((log) => this.dateKey(log.date)));

    // The schedule may have to come from the DB when we were handed a bare id.
    const schedule =
      habit && typeof habit === 'object' && 'daysOfWeek' in habit
        ? habit
        : await Habit.findOne({ _id: habitId, createdBy: userId }).select('daysOfWeek');
    if (!schedule) return 0;

    let streak = 0;
    let cursor = end;
    for (let i = 0; i <= STREAK_LOOKBACK_DAYS; i += 1) {
      if (this.isScheduled(schedule, cursor)) {
        if (done.has(this.dateKey(cursor))) {
          streak += 1;
        } else if (i > 0) {
          break; // an earlier scheduled day was missed
        }
        // i === 0 and unlogged: today is still open, keep looking back.
      }
      cursor = new Date(cursor.getTime() - DAY_MS);
    }
    return streak;
  }
}

export default new HabitService();
