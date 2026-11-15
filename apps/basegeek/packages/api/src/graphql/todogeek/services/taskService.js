import Task from '../models/Task.js';
import TaskOrder from '../models/TaskOrder.js';
import Collection from '../models/Collection.js';
import mongoose from 'mongoose';
import { normalizeTag } from '@geeksuite/tags';
import { spellingsOf } from '../../shared/tagSpellings.js';
import rrulePkg from 'rrule';
import { isOrderTaskId, MAX_ORDERED_TASK_IDS } from '../validation.js';
import { hasDueTime as midnightRuleHasDueTime, effectiveHasDueTime } from './reminderService.js';

const { rrulestr, RRule } = rrulePkg;

const VALID_EDIT_SCOPES = ['THIS_INSTANCE', 'ALL_INSTANCES', 'FUTURE_INSTANCES'];

const LEGACY_PATTERN_FREQ = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' };

/**
 * Statuses a task may be blocked ("parked") FROM. The terminal states —
 * completed and cancelled — are deliberately absent: a finished task has
 * nothing left to wait on. There is no `carriedOver` status in this schema;
 * the migrated_* pair is its equivalent (a task pushed back to the backlog or
 * forward to a later day is still live work), so both are blockable.
 * Re-blocking an already-blocked task is allowed and just rewrites the
 * reason — `blockedAt` stays put so "parked since" never drifts.
 */
export const BLOCKABLE_STATUSES = ['pending', 'migrated_back', 'migrated_future', 'blocked'];

export const MAX_BLOCKED_REASON = 280;

/**
 * A caller-error: the request was well-formed GraphQL but asks for something
 * the task's current state does not allow. Resolvers translate the `code` into
 * a 400-style GraphQLError; the service stays transport-agnostic.
 */
export function badRequest(message) {
  const err = new Error(message);
  err.code = 'BAD_USER_INPUT';
  err.status = 400;
  return err;
}

/**
 * Format a Date as an iCalendar UTC timestamp (`20260315T090000Z`) — the exact
 * shape `RRule#toString()` emits and `rrulestr()` round-trips.
 */
export function formatDtstart(date) {
  return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Legacy shim: translate the deprecated `recurrencePattern` enum
 * ('daily' | 'weekly' | 'monthly') into the canonical RRULE string the
 * expansion code in `getTasksForDateRange` parses:
 *
 *   DTSTART:20260315T090000Z\nRRULE:FREQ=WEEKLY
 *
 * Returns null for 'none' / unknown patterns or an unusable start date.
 */
export function recurrencePatternToRRule(pattern, startDate) {
  const freq = LEGACY_PATTERN_FREQ[String(pattern ?? '').toLowerCase()];
  if (!freq) return null;
  const start = startDate ? new Date(startDate) : new Date();
  if (Number.isNaN(start.getTime())) return null;
  return `DTSTART:${ formatDtstart(start) }\nRRULE:FREQ=${ freq }`;
}

/* ─── Wall-clock repeats (DST) ─────────────────────────────────────────────
 *
 * An RRULE's DTSTART is a UTC instant (`DTSTART:20260315T140000Z`), and rrule
 * steps in UTC, so "9 am daily" written in July fired at 8 am from November.
 * rrule's own TZID support depends on the PROCESS time zone (measured: the
 * same rule gives different instants under TZ=UTC and TZ=America/Chicago), so
 * it is not used. Instead a series carries its IANA zone (`Task.timeZone`)
 * and each raw occurrence is moved by the difference between the zone's
 * offset at DTSTART and at the occurrence — the same local clock time, every
 * day of the year. A series without a zone (every one written before
 * 2026-11-15) expands exactly as before.
 */
const zoneFormatters = new Map();
function zoneFormatter(timeZone) {
  if (!zoneFormatters.has(timeZone)) {
    zoneFormatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return zoneFormatters.get(timeZone);
}

/** Minutes EAST of UTC for `timeZone` at `date` (local = utc + offset). */
export function zoneOffsetMinutes(timeZone, date) {
  const parts = {};
  for (const { type, value } of zoneFormatter(timeZone).formatToParts(date)) parts[type] = value;
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const whole = date.getTime() - date.getUTCMilliseconds();
  return Math.round((asUtc - whole) / 60000);
}

/**
 * A raw rrule occurrence moved to the same wall-clock time as `dtstart` in
 * `timeZone`. Returns `raw` untouched without a zone, or if the zone is bad.
 */
export function correctForZone(raw, dtstart, timeZone) {
  if (!timeZone || !(raw instanceof Date) || !(dtstart instanceof Date)) return raw;
  try {
    const base = zoneOffsetMinutes(timeZone, dtstart);
    const guess = new Date(raw.getTime() + (base - zoneOffsetMinutes(timeZone, raw)) * 60000);
    return new Date(raw.getTime() + (base - zoneOffsetMinutes(timeZone, guess)) * 60000);
  } catch {
    return raw;
  }
}

class TaskService {
  /**
   * How far either side of today the 'all' view expands recurring rules.
   * See `expansionWindow` for why this exists and what it costs.
   */
  static ALL_VIEW_HORIZON_DAYS = 365;

  /** How far ahead the 'all' view expands every occurrence (see expansionWindow). */
  static ALL_VIEW_DENSE_DAYS = 62;

  constructor() {
    this.taskModel = Task;
  }

  /**
   * Every ownership-sensitive service method funnels through this so that a
   * resolver can never accidentally issue an unscoped query.
   */
  requireUser(userId) {
    if (!userId) {
      const err = new Error('Unauthorized');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    return userId;
  }

  normalizeEditScope(editScope) {
    return VALID_EDIT_SCOPES.includes(editScope) ? editScope : 'THIS_INSTANCE';
  }

  /**
   * Recurring occurrences are surfaced to the client as synthetic ids of the
   * form `virtual_<masterId>_<epochMs>`. Returns null for a real (materialized)
   * task id.
   */
  parseVirtualId(taskId) {
    const id = String(taskId ?? '');
    if (!id.startsWith('virtual_')) return null;
    const parts = id.split('_');
    const masterId = parts[1];
    const epochMs = parseInt(parts[2], 10);
    if (!mongoose.Types.ObjectId.isValid(masterId) || Number.isNaN(epochMs)) return null;
    return { masterId, originalDueDate: new Date(epochMs) };
  }

  /**
   * Load a task by id, scoped to its owner. Returns null when the id is
   * malformed, does not exist, or belongs to somebody else — callers must not
   * be able to distinguish these cases.
   */
  async findOwnedTask(taskId, userId) {
    this.requireUser(userId);
    if (!mongoose.Types.ObjectId.isValid(taskId)) return null;
    return this.taskModel.findOne({ _id: taskId, createdBy: userId });
  }

  /**
   * Resolve either a real id or a `virtual_` occurrence id to the owned series
   * master / task document it refers to.
   */
  async resolveOwnedTarget(taskId, userId) {
    this.requireUser(userId);
    const virtual = this.parseVirtualId(taskId);
    if (virtual) {
      const master = await this.findOwnedTask(virtual.masterId, userId);
      if (!master) return null;
      return { virtual: true, master, task: master, originalDueDate: virtual.originalDueDate };
    }
    const task = await this.findOwnedTask(taskId, userId);
    if (!task) return null;
    return { virtual: false, master: null, task, originalDueDate: null };
  }

  toUtcMidnight(dateStr) {
    if (!dateStr) return new Date(new Date().setUTCHours(0, 0, 0, 0));
    let y, m, d;
    if (dateStr instanceof Date) {
      y = dateStr.getFullYear(); m = dateStr.getMonth(); d = dateStr.getDate();
    } else {
      const str = typeof dateStr === 'string' ? dateStr : new Date(dateStr).toISOString();
      const parts = str.split('T')[0].split('-').map(Number);
      y = parts[0]; m = parts[1] - 1; d = parts[2];
    }
    return new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  }

  formatDateKey(date) {
    const d = new Date(date);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${ y }-${ m }-${ day }`;
  }

  /**
   * Collection entries live OUTSIDE the log. An entry filed into a collection
   * only surfaces in a log view once it has been given a dueDate — that date is
   * the bridge between a collection and the daily log. Undated collection
   * entries are therefore excluded from every dated branch below, including the
   * `dueDate: null, status: 'pending'` carry-forward float.
   *
   * `{ collectionId: null }` matches both an explicit null and a missing field,
   * so pre-collections tasks are unaffected.
   *
   * The `all` view (the backlog / export corpus) is left whole on purpose — it
   * is not a log view.
   */
  collectionExclusionClause() {
    return { $or: [{ collectionId: null }, { dueDate: { $ne: null } }] };
  }

  /**
   * UTC midnight on the MONDAY of the week a date falls in.
   *
   * Weeks start on Monday everywhere else in this app — `utils/reviewWeek.js`
   * says so outright and `reviewDraft` refuses anything else — but the weekly
   * log view snapped to Sunday with `- getUTCDay()` while `WeeklySpread`
   * rendered Monday to Sunday. The two disagreed by one day, so the Sunday
   * column the UI drew was outside the window the gateway returned and could
   * never contain anything, while the Sunday the gateway did return was never
   * drawn.
   *
   * Extracted rather than fixed in place because this boundary is computed
   * TWICE in `getTasksForDateRange` — once for the Mongo filter and once for
   * the RRULE expansion window. Patching one copy is how those two silently
   * stop agreeing at a week edge, which drops or duplicates an occurrence.
   * One definition, two call sites.
   */
  startOfUtcWeek(date) {
    const start = new Date(date);
    // Sunday is 0, so (day + 6) % 7 is "days back to Monday": 0 for Monday,
    // 6 for Sunday. Plain `- getUTCDay()` is the Sunday-start version.
    const daysBack = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - daysBack);
    start.setUTCHours(0, 0, 0, 0);
    return start;
  }

  /**
   * UTC end-of-day on the Sunday closing the week `startOfUtcWeek` opened.
   */
  endOfUtcWeek(weekStart) {
    const end = new Date(weekStart);
    end.setUTCDate(end.getUTCDate() + 6);
    end.setUTCHours(23, 59, 59, 999);
    return end;
  }

  /**
   * The `dueDate` clause for a span of the USER'S calendar days.
   *
   * WHY THIS IS NOT ONE RANGE
   * -------------------------
   * `dueDate` carries two different kinds of value, and the app's own
   * convention is what tells them apart:
   *
   *   - UTC midnight exactly  -> a DATE, with no time of day
   *   - anything else         -> an INSTANT, a real due time
   *
   * The log views used a single UTC-day range for both, which is right for
   * the first kind and wrong for the second. A task due 8pm US-Central is
   * stored 01:00Z the NEXT day, so it fell outside today's UTC window and
   * appeared on tomorrow's page — while its push reminder, which is
   * instant-based and correct, fired at 8pm and deep-linked to a page that
   * did not contain it. Anything after 19:00 CDT / 18:00 CST was affected.
   *
   * The obvious repair — swap the UTC window for the user's local one —
   * trades the bug for a worse one. A date-only task for the 21st is stored
   * 2026-09-21T00:00:00Z, which falls INSIDE the local window for the 20th
   * in any zone west of UTC, so tomorrow's undated work would pile onto
   * today. Verified before writing this.
   *
   * So the clause is a union of the two readings:
   *
   *   1. date-only rows whose UTC midnight is one of the days in the span
   *   2. timed rows inside the span's LOCAL window, minus the UTC midnights
   *      that fall in it (those are branch 1's business, and a range cannot
   *      tell them apart)
   *
   * A 24-hour local window contains exactly one UTC midnight, so branch 2's
   * exclusion is a single `$ne` rather than a scan.
   *
   * @param {Date} spanStartUtcMidnight first day of the span, UTC midnight
   * @param {Date} spanEndUtcMidnight   last day of the span, UTC midnight
   * @param {number|null} tzOffsetMinutes the CALLER'S offset for that date,
   *   in JavaScript's sign convention (minutes WEST of UTC, so US-Central
   *   summer is 300). Null means "no offset supplied" and falls back to the
   *   old UTC-day behaviour — a caller that sends nothing behaves exactly as
   *   before, which is what keeps this change safe for anything not updated.
   * @returns {Object} a mongo clause for `dueDate`
   */
  dueDateClauseForDays(spanStartUtcMidnight, spanEndUtcMidnight, tzOffsetMinutes = null) {
    const spanEndOfDay = new Date(spanEndUtcMidnight);
    spanEndOfDay.setUTCHours(23, 59, 59, 999);

    if (tzOffsetMinutes === null || tzOffsetMinutes === undefined || !Number.isFinite(tzOffsetMinutes)) {
      // Unchanged behaviour for callers that do not say where they are.
      return { dueDate: { $gte: spanStartUtcMidnight, $lte: spanEndOfDay } };
    }

    const offsetMs = tzOffsetMinutes * 60000;
    const localStart = new Date(spanStartUtcMidnight.getTime() + offsetMs);
    const localEnd = new Date(spanEndOfDay.getTime() + offsetMs);

    // EVERY UTC midnight inside the local window, excluded from the timed
    // branch so no date-only task can leak in through it. A single day's
    // window contains exactly one; a week's contains seven or eight, and
    // excluding only the first let the day just past the end of a span match
    // — which is what the test caught.
    //
    // Excluding the span's OWN midnights here is harmless: branch 1 matches
    // those by enumeration, and a row only has to satisfy one branch.
    const midnightsInsideLocalWindow = [];
    const cursor = new Date(localStart);
    cursor.setUTCHours(0, 0, 0, 0);
    if (cursor < localStart) cursor.setUTCDate(cursor.getUTCDate() + 1);
    while (cursor <= localEnd) {
      midnightsInsideLocalWindow.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // Branch 1 ENUMERATES the span's UTC midnights rather than ranging over
    // it. A range would re-admit exactly what this fixes: 01:00Z on the 21st
    // (8pm Central on the 20th) sits inside the 21st's UTC day, which is how
    // it ended up on the wrong page to begin with. Date-only rows ARE the
    // midnights, so `$in` says that precisely — one entry for a day, seven
    // for a week, at most thirty-one for a month.
    const midnights = [];
    for (
      let d = new Date(spanStartUtcMidnight);
      d <= spanEndOfDay;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      midnights.push(new Date(d));
    }

    return {
      $or: [
        { dueDate: { $in: midnights } },
        { dueDate: { $gte: localStart, $lte: localEnd, $nin: midnightsInsideLocalWindow } },
      ],
    };
  }

  /**
   * The `dueDate` clause for "already past", from the user's point of view.
   *
   * The companion to `dueDateClauseForDays`, and it needs the same treatment
   * for the same reason. Overdue used to mean `dueDate < UTC midnight of the
   * requested day`, so a task due 8pm yesterday — stored 01:00Z today — was
   * not less than today's UTC midnight and never became overdue at all. With
   * the day clause fixed it would have shown on yesterday's page and then
   * silently vanished rather than carrying forward.
   *
   * A task is past if its own day is before the requested one:
   *
   *   - timed rows     -> earlier than the start of the user's day
   *   - date-only rows -> an earlier UTC midnight
   *
   * West of UTC the user's day starts AFTER the UTC midnight, so the single
   * date-only value caught in between is the requested day's own — excluded
   * by name. East of UTC the day starts before it, so nothing is caught and
   * the exclusion is a no-op. One `$ne` covers both directions.
   */
  overdueBeforeDayClause(dayUtcMidnight, tzOffsetMinutes = null) {
    if (tzOffsetMinutes === null || tzOffsetMinutes === undefined || !Number.isFinite(tzOffsetMinutes)) {
      return { $lt: dayUtcMidnight };
    }
    const localStart = new Date(dayUtcMidnight.getTime() + tzOffsetMinutes * 60000);
    return { $lt: localStart, $ne: dayUtcMidnight };
  }

  /**
   * The window an RRULE is expanded over for a given view.
   *
   * Extracted so it can be asserted without a database — and because the
   * 'all' branch below is the one that had to be bounded.
   */
  expansionWindow(viewType, startOfDayDate, endOfDayDate) {
    if (viewType === 'daily') {
      return { viewStart: startOfDayDate, viewEnd: endOfDayDate };
    }
    if (viewType === 'weekly') {
      // The same two helpers the Mongo filter uses — see startOfUtcWeek.
      const viewStart = this.startOfUtcWeek(startOfDayDate);
      return { viewStart, viewEnd: this.endOfUtcWeek(viewStart) };
    }
    if (viewType === 'monthly') {
      return {
        viewStart: new Date(Date.UTC(startOfDayDate.getUTCFullYear(), startOfDayDate.getUTCMonth(), 1, 0, 0, 0, 0)),
        viewEnd: new Date(Date.UTC(startOfDayDate.getUTCFullYear(), startOfDayDate.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
      };
    }

    // THE 'all' VIEW, BOUNDED — twice.
    //
    // It was `new Date(0)` to the end of representable time (one open-ended
    // daily rule: 2,912,443 occurrences, 12.5 s, measured), then a year either
    // side of today (~730 rows per daily series, every load).
    //
    // Since 2026-11-15 (plan 5.13 + decision D3) it is yesterday to
    // ALL_VIEW_DENSE_DAYS ahead. Nothing reads further back: TodoGeek shows
    // ONE late row per series (the carry-forward occurrence just before this
    // window, plus anything inside it), Done reads completed rows, which are
    // real documents and not expanded, and Search shows a series once. Ahead,
    // Upcoming needs 14 days in full and "Later" shows a series once at its
    // next occurrence, so the expansion adds one occurrence past the window
    // (`getTasksForDateRange`) and stops. A daily series is ~65 rows, not 730.
    const viewStart = new Date(startOfDayDate);
    viewStart.setUTCDate(viewStart.getUTCDate() - 1);
    viewStart.setUTCHours(0, 0, 0, 0);
    const viewEnd = new Date(startOfDayDate);
    viewEnd.setUTCDate(viewEnd.getUTCDate() + TaskService.ALL_VIEW_DENSE_DAYS);
    viewEnd.setUTCHours(23, 59, 59, 999);
    return { viewStart, viewEnd };
  }

  async getTasksForDateRange({ userId, startDate, endDate, viewType, tzOffsetMinutes = null }) {
    this.requireUser(userId);
    const query = { createdBy: userId, isSeriesMaster: { $ne: true } };
    if (viewType !== 'all') {
      query.isBacklog = { $ne: true };
      // `$and` sits alongside the per-view `$or` below; Mongo ANDs top-level keys.
      // A blocked task is parked: it keeps its dueDate but leaves the log
      // entirely, so it is neither "due today" nor overdue. It comes back the
      // moment it is unblocked. The `all` view (backlog / search / export
      // corpus) still sees it — that is not a log view.
      query.$and = [this.collectionExclusionClause(), { status: { $ne: 'blocked' } }];
    }
    const startOfDayDate = this.toUtcMidnight(startDate);
    const endOfDayDate = new Date(startOfDayDate);
    endOfDayDate.setUTCHours(23, 59, 59, 999);

    switch (viewType) {
      case 'daily': {
        // `dueDateClauseForDays` rather than a bare UTC range: a dueDate
        // carrying a TIME is an instant, and an evening one crosses into the
        // next UTC day. See that method for the full account.
        const dueOnDay = this.dueDateClauseForDays(startOfDayDate, startOfDayDate, tzOffsetMinutes);
        query.$or = [
          dueOnDay,
          { status: { $in: ['completed', 'cancelled'] }, updatedAt: { $gte: startOfDayDate, $lte: endOfDayDate }, $or: [dueOnDay, { dueDate: null }] },
          { dueDate: null, status: 'pending', createdAt: { $lte: endOfDayDate } },
          { dueDate: this.overdueBeforeDayClause(startOfDayDate, tzOffsetMinutes), status: { $in: ['pending', 'migrated_future'] } },
        ];
        break;
      }
      case 'weekly': {
        const startOfWeekDate = this.startOfUtcWeek(startOfDayDate);
        const endOfWeekDate = this.endOfUtcWeek(startOfWeekDate);
        // Same two helpers as the daily view — the span is seven days rather
        // than one, so an evening task on the Sunday is the case that used to
        // fall out of the week entirely.
        const lastDayOfWeek = new Date(endOfWeekDate);
        lastDayOfWeek.setUTCHours(0, 0, 0, 0);
        query.$or = [
          this.dueDateClauseForDays(startOfWeekDate, lastDayOfWeek, tzOffsetMinutes),
          { status: { $in: ['completed', 'cancelled'] }, updatedAt: { $gte: startOfWeekDate, $lte: endOfWeekDate } },
          { dueDate: null, status: 'pending', createdAt: { $lte: endOfWeekDate } },
          { dueDate: this.overdueBeforeDayClause(startOfWeekDate, tzOffsetMinutes), status: { $in: ['pending', 'migrated_future'] } },
        ];
        break;
      }
      case 'monthly': {
        const startOfMonthDate = new Date(Date.UTC(startOfDayDate.getUTCFullYear(), startOfDayDate.getUTCMonth(), 1, 0, 0, 0, 0));
        const endOfMonthDate = new Date(Date.UTC(startOfDayDate.getUTCFullYear(), startOfDayDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
        // Same two helpers again. The month-end evening task is the one this
        // catches: due 8pm on the 30th is 01:00Z on the 1st, so it used to
        // fall outside its own month's window and into the next.
        const lastDayOfMonth = new Date(endOfMonthDate);
        lastDayOfMonth.setUTCHours(0, 0, 0, 0);
        query.$or = [
          this.dueDateClauseForDays(startOfMonthDate, lastDayOfMonth, tzOffsetMinutes),
          { status: { $in: ['completed', 'cancelled'] }, updatedAt: { $gte: startOfMonthDate, $lte: endOfMonthDate } },
          { dueDate: null, status: 'pending', createdAt: { $lte: endOfMonthDate } },
          { dueDate: this.overdueBeforeDayClause(startOfMonthDate, tzOffsetMinutes), status: { $in: ['pending', 'migrated_future'] } },
        ];
        break;
      }
      case 'all':
        query.$or = [
          { dueDate: { $ne: null } },
          { status: { $in: ['completed', 'cancelled'] } },
          { dueDate: null, status: 'pending' },
          { status: 'migrated_back' },
          { isBacklog: true },
        ];
        break;
      default:
        throw new Error('Invalid view type');
    }

    const tasks = await this.taskModel.find(query)
      .populate('parentTask', 'content status')
      .sort({ status: 1, dueDate: -1, priority: 1, createdAt: -1 });

    const tasksWithDates = tasks.map(t => t.toObject());

    // --- RRULE EXPANSION START ---
    const { viewStart, viewEnd } = this.expansionWindow(viewType, startOfDayDate, endOfDayDate);

    // A blocked master parks the whole series — like completed/cancelled, it
    // stops producing occurrences. Blocking a single occurrence instead
    // materializes a blocked override, which lands in `overrideMap` below and
    // suppresses that date's virtual, so neither path can spawn a duplicate.
    const masterTasks = await this.taskModel.find({
      createdBy: userId,
      isSeriesMaster: true,
      status: { $nin: ['completed', 'cancelled', 'blocked'] }
    });

    // Each master's occurrences, worked out ONCE: wall-clock corrected
    // (`correctForZone`), exdates and the D3 late floor applied. The override
    // fetch and the rows below both read this list, so they cannot disagree
    // about which instant an occurrence is.
    const carryForward = viewType === 'daily' || viewType === 'all';
    const plans = [];
    for (const master of masterTasks) {
      if (!master.recurrenceRule) continue;
      try {
        const rule = rrulestr(master.recurrenceRule);
        const dtstart = rule.options?.dtstart;
        const zone = effectiveHasDueTime(master) ? master.timeZone : null;
        const fix = (raw) => correctForZone(raw, dtstart, zone);
        const floor = master.skipMissedBefore ? new Date(master.skipMissedBefore).getTime() : null;
        const excluded = (date) => (
          (master.exdates || []).some((ex) => ex.getTime() === date.getTime())
        );
        // A raw occurrence near a window edge can move up to an hour either
        // way, so the raw search is widened and the corrected date re-checked.
        const SLACK = 2 * 60 * 60 * 1000;
        const inWindow = rule
          .between(new Date(viewStart.getTime() - SLACK), new Date(viewEnd.getTime() + SLACK), true)
          .map(fix)
          .filter((d) => d >= viewStart && d <= viewEnd);
        const occurrences = [];
        for (const date of inWindow) {
          if (excluded(date)) continue;
          occurrences.push({ date, carried: false });
        }
        if (carryForward) {
          const raw = rule.before(new Date(viewStart.getTime() - SLACK), false);
          // The last occurrence before the window, corrected — or the one the
          // slack skipped over, if it corrects to before viewStart.
          const between = rule
            .between(new Date(viewStart.getTime() - SLACK), viewStart, true)
            .map(fix)
            .filter((d) => d < viewStart);
          const past = between.length ? between[between.length - 1] : (raw ? fix(raw) : null);
          if (past && !excluded(past)) occurrences.push({ date: past, carried: true });
        }
        if (viewType === 'all') {
          // One occurrence past the dense window, so a series whose next
          // date is further out is still in Upcoming's "Later" and in Search.
          const raw = rule.after(new Date(viewEnd.getTime() + SLACK), false);
          if (raw) {
            const next = fix(raw);
            if (!excluded(next)) occurrences.push({ date: next, carried: false });
          }
        }
        plans.push({
          master,
          // D3: no un-materialised occurrence before the late floor.
          occurrences: occurrences.filter(({ date }) => floor === null || date.getTime() >= floor),
        });
      } catch (e) {
        console.error("Invalid RRULE on task", master._id, e);
      }
    }

    // BOUNDED, NOT EVERY OVERRIDE EVER: exactly the (series, occurrence)
    // pairs about to be shown, by `$in` per series.
    const overrideClauses = plans
      .filter((p) => p.occurrences.length > 0)
      .map((p) => ({ seriesId: String(p.master._id), originalDueDate: { $in: p.occurrences.map((o) => o.date) } }));
    const overrides = overrideClauses.length === 0
      ? []
      : await this.taskModel.find({
          createdBy: userId,
          $or: overrideClauses,
        });
    const overrideMap = new Map();
    for (const ov of overrides) {
      if (ov.originalDueDate) {
        overrideMap.set(`${ov.seriesId}_${ov.originalDueDate.getTime()}`, ov);
      }
    }

    for (const { master, occurrences } of plans) {
      const timed = effectiveHasDueTime(master);
      for (const { date } of occurrences) {
        const key = `${master._id}_${date.getTime()}`;
        if (overrideMap.has(key)) continue;
        tasksWithDates.push({
          _id: `virtual_${master._id}_${date.getTime()}`,
          content: master.content,
          signifier: master.signifier,
          status: 'pending',
          priority: master.priority,
          note: master.note,
          tags: master.tags,
          dueDate: date,
          hasDueTime: timed,
          timeZone: master.timeZone || null,
          originalDueDate: date,
          seriesId: master._id,
          recurrenceRule: master.recurrenceRule,
          recurrencePattern: master.recurrencePattern,
          collectionId: master.collectionId,
          private: master.private === true,
          isVirtual: true,
          createdBy: master.createdBy
        });
      }
    }
    // --- RRULE EXPANSION END ---

    const sorted = this.sortTasks(tasksWithDates);

    if (viewType === 'daily') {
      const dateKey = this.formatDateKey(startDate);
      const orderDoc = await TaskOrder.findOne({ userId, dateKey }).lean();
      if (orderDoc && Array.isArray(orderDoc.orderedTaskIds) && orderDoc.orderedTaskIds.length > 0) {
        // Stored ids are strings (or, in rows older than 2026-10-29,
        // ObjectIds) — compared as strings either way.
        const idToTask = new Map(sorted.map(t => [String(t._id), t]));
        const stored = orderDoc.orderedTaskIds.map(id => String(id));
        const storedSet = new Set(stored);
        const inOrder = stored.filter(id => idToTask.has(id)).map(id => idToTask.get(id));
        const remaining = sorted.filter(t => !storedSet.has(String(t._id)));
        return [...inOrder, ...remaining];
      }
    }
    return sorted;
  }

  /**
   * The order tasks come back in — the SAME rules as the frontend's
   * `compareTasks` (`utils/taskSort.js`), which is the canonical comparator
   * named by DOCS/SORTING_RULES.md.
   *
   * This copy disagreed with it in three ways, and the disagreement was
   * visible: weekly, monthly and all-task lists render in THIS order on load
   * and are re-sorted by the canonical comparator on the first mutation, so
   * the list reordered itself the moment the user ticked anything.
   *
   *   - Undated tasks used `(b.priority) - (a.priority)`, which is
   *     DESCENDING — and 1 is High, 3 is Low, so Low sorted above High. The
   *     exact bug `TaskList.jsx:105` records having fixed on the client;
   *     it was still alive down here.
   *   - Dated tasks had no priority tiebreak at all, against the spec's
   *     "scheduled tasks sorted by priority".
   *   - Anything not `pending` sank, so `migrated_back` and `migrated_future`
   *     dropped below completed work. Only completed and cancelled sink.
   *
   * Kept as a copy rather than an import: `@geeksuite/schemas` is the shared
   * home for this pair of apps and the comparator lives in the todogeek
   * frontend's own utils, which the gateway cannot reach. The rules are
   * restated here with the spec cited, and both sides have tests naming the
   * same cases.
   */
  sortTasks(tasks) {
    const SUNK = new Set(['completed', 'cancelled']);
    // 1 High, 2 Medium, 3 Low, absent = None and sorts last.
    const priorityRank = (task) => {
      const p = Number(task?.priority);
      return Number.isFinite(p) && p > 0 ? p : Number.MAX_SAFE_INTEGER;
    };
    const dueTime = (task) => {
      if (!task?.dueDate) return null;
      const t = new Date(task.dueDate).getTime();
      return Number.isNaN(t) ? null : t;
    };

    return tasks.sort((a, b) => {
      const aDone = SUNK.has(a?.status) ? 1 : 0;
      const bDone = SUNK.has(b?.status) ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      if (aDone && a?.status !== b?.status) {
        if (a?.status === 'cancelled') return 1;
        if (b?.status === 'cancelled') return -1;
      }

      const aDue = dueTime(a);
      const bDue = dueTime(b);

      // Among incomplete tasks, scheduled comes before unscheduled.
      if (!aDone) {
        const aScheduled = aDue === null ? 1 : 0;
        const bScheduled = bDue === null ? 1 : 0;
        if (aScheduled !== bScheduled) return aScheduled - bScheduled;
      }

      const aPriority = priorityRank(a);
      const bPriority = priorityRank(b);
      if (aPriority !== bPriority) return aPriority - bPriority;

      if (aDue !== bDue) {
        if (aDue === null) return 1;
        if (bDue === null) return -1;
        return aDue - bDue;
      }

      return 0;
    });
  }

  /**
   * Persist a day's manual task order — one row per (user, dateKey), upserted,
   * so saving the same list twice is a no-op.
   *
   * The list the client sends is the list it RENDERED, and a rendered day
   * contains virtual occurrences of repeating tasks — `virtual_<masterId>_<epochMs>`
   * (see `expandOccurrences`). Until 2026-10-29 `orderedTaskIds` was
   * `[ObjectId]` and those ids were DROPPED here, so a dragged repeating task
   * snapped back on the next read. The field is `[String]` now and they are
   * kept. Anything that is neither shape is rejected (BAD_USER_INPUT), as is a
   * list longer than MAX_ORDERED_TASK_IDS; the resolver checks the same thing
   * first (`saveDailyTaskOrderArgsSchema`), this is the service's own guard.
   * Duplicates keep their first place.
   */
  async saveDailyOrder({ userId, dateKey, orderedTaskIds }) {
    this.requireUser(userId);
    if (typeof dateKey !== 'string' || !dateKey) throw badRequest('dateKey is required');
    const ids = Array.isArray(orderedTaskIds) ? orderedTaskIds.map((id) => String(id)) : [];
    if (ids.length > MAX_ORDERED_TASK_IDS) throw badRequest(`at most ${MAX_ORDERED_TASK_IDS} task ids`);
    const bad = ids.find((id) => !isOrderTaskId(id));
    if (bad !== undefined) throw badRequest('orderedTaskIds holds something that is not a task id');
    const persistable = [...new Set(ids)];
    return TaskOrder.findOneAndUpdate(
      { userId, dateKey },
      { orderedTaskIds: persistable, updatedAt: new Date() },
      { new: true, upsert: true }
    );
  }

  /**
   * The caller's saved order for one day, as id strings — `[]` when there is
   * none. Scoped by `userId` like every read here: another user's row for the
   * same day is never seen. Rows written before the ids became strings hold
   * ObjectIds; `String()` reads both the same.
   */
  async getDailyOrder({ userId, dateKey }) {
    this.requireUser(userId);
    const doc = await TaskOrder.findOne({ userId, dateKey }).lean();
    return Array.isArray(doc?.orderedTaskIds) ? doc.orderedTaskIds.map((id) => String(id)) : [];
  }

  /**
   * RRULE is the single source of truth for recurrence. Anything arriving with
   * only the deprecated `recurrencePattern` is translated to an equivalent
   * RRULE, and any task carrying an RRULE becomes a series master (its
   * occurrences are then expanded virtually per view window).
   */
  normalizeRecurrence(data, fallbackStart = null) {
    const out = { ...data };
    if (!out.recurrenceRule && out.recurrencePattern && out.recurrencePattern !== 'none') {
      const shimmed = recurrencePatternToRRule(
        out.recurrencePattern,
        out.dueDate || out.originalDate || fallbackStart
      );
      if (shimmed) out.recurrenceRule = shimmed;
    }
    if (out.recurrenceRule) {
      out.isSeriesMaster = true;
      // The legacy field is never persisted alongside an RRULE — one system only.
      out.recurrencePattern = 'none';
    }
    return out;
  }

  /**
   * A task may only be filed into a collection its own owner holds. Anything
   * else — a malformed id, a missing collection, somebody else's collection —
   * is indistinguishable to the caller.
   */
  async assertOwnedCollection(collectionId, userId) {
    this.requireUser(userId);
    if (collectionId === null || collectionId === undefined || collectionId === '') return;
    if (!mongoose.Types.ObjectId.isValid(collectionId)) throw new Error('Collection not found');
    const owned = await Collection.findOne({ _id: collectionId, createdBy: userId }).select('_id');
    if (!owned) throw new Error('Collection not found');
  }

  /**
   * `hasDueTime` for a write that sets `dueDate` (contract C2): the caller's
   * flag when it sent one, else the legacy midnight rule — what every client
   * before the flag meant. No due date is never timed.
   */
  resolveHasDueTime(dueDate, sent) {
    if (!dueDate) return false;
    if (typeof sent === 'boolean') return sent;
    return midnightRuleHasDueTime(dueDate);
  }

  async createTask(taskData) {
    this.requireUser(taskData?.createdBy);
    // A client-sent `isSeriesMaster` is ignored: a task is a series master
    // exactly when it carries a recurrenceRule (normalizeRecurrence sets it).
    // `isSeriesMaster: true` with no rule made a task every view filters out.
    const { isSeriesMaster: _ignored, ...input } = taskData;
    const data = this.normalizeRecurrence(input);
    if (!data.recurrenceRule) data.isSeriesMaster = false;
    // `private: null` (or absent — every pre-private client) is not private.
    if ('private' in data) data.private = data.private === true;
    if ('collectionId' in data) {
      await this.assertOwnedCollection(data.collectionId, data.createdBy);
      if (!data.collectionId) data.collectionId = null;
    }
    data.hasDueTime = this.resolveHasDueTime(data.dueDate, data.hasDueTime);
    if (!data.timeZone) data.timeZone = null;
    // A task created finished is finished NOW (NoteGeek's `x` journal lines
    // create completed tasks). Without the stamp it had no day in Done.
    if (data.status === 'completed' && !data.completedAt) data.completedAt = new Date();
    if (data.status === 'cancelled' && !data.cancelledAt) data.cancelledAt = new Date();

    // Contract C1: one task per (user, clientId). A retry of a create that
    // did land returns the task it made. The unique index is the real guard;
    // the lookup first just keeps the common retry off the error path.
    if (typeof data.clientId === 'string' && data.clientId.trim()) {
      data.clientId = data.clientId.trim();
      const existing = await this.taskModel.findOne({ createdBy: data.createdBy, clientId: data.clientId });
      if (existing) return existing;
      try {
        return await new this.taskModel(data).save();
      } catch (err) {
        if (err?.code === 11000) {
          const raced = await this.taskModel.findOne({ createdBy: data.createdBy, clientId: data.clientId });
          if (raced) return raced;
        }
        throw err;
      }
    }
    delete data.clientId;
    return new this.taskModel(data).save();
  }

  /**
   * Materialize a single occurrence of a series as its own task document,
   * carrying the caller's edits.
   */
  buildOverride(master, originalDueDate, updateData) {
    const base = master.toObject();
    delete base._id;
    // The master's create id is the master's alone (unique per user), and the
    // late floor and zone are series bookkeeping, not an occurrence's.
    delete base.clientId;
    return {
      ...base,
      skipMissedBefore: null,
      timeZone: null,
      // THE OCCURRENCE'S OWN DATE, NOT THE SERIES'.
      //
      // `base` is the master spread whole, so it carries the master's
      // `dueDate` — the series' FIRST date. A status change (complete,
      // cancel, block) sends no `dueDate` of its own, so the override used to
      // inherit that one: ticking off Tuesday's occurrence removed the row
      // from Tuesday (its virtual is suppressed by `overrideMap`, correctly,
      // on `originalDueDate`) and added a completed row to the series' start
      // date instead. The task vanished from the day it was done on and
      // reappeared, wearing the wrong date, weeks earlier.
      //
      // This sits BEFORE the `...updateData` spread on purpose: an edit that
      // genuinely moves the occurrence still wins, because `updateData` will
      // carry its own `dueDate`. Only the status-change path, which supplies
      // none, falls through to the occurrence's date.
      dueDate: originalDueDate,
      ...updateData,
      createdBy: master.createdBy,
      seriesId: String(master._id),
      isSeriesMaster: false,
      recurrenceRule: null,
      exdates: [],
      originalDueDate,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Write one occurrence's override, creating it or updating the one that
   * already exists. There is ONE row per (series, occurrence) — a unique index
   * says so — and a second write for the same occurrence is ordinary: a tick
   * and an un-tick sent before the first answer came back both name the
   * `virtual_` id. It used to be a plain insert, so the second one failed on
   * the index and the screen and server disagreed.
   */
  async upsertOverride(master, originalDueDate, updateData) {
    const filter = {
      createdBy: master.createdBy,
      seriesId: String(master._id),
      originalDueDate,
    };
    const patch = { ...updateData, updatedAt: new Date() };
    const existing = await this.taskModel.findOne(filter).select('_id');
    if (existing) {
      return this.taskModel.findOneAndUpdate({ _id: existing._id }, patch, { new: true, runValidators: true });
    }
    try {
      return await new this.taskModel(this.buildOverride(master, originalDueDate, updateData)).save();
    } catch (err) {
      if (err?.code !== 11000) throw err;
      return this.taskModel.findOneAndUpdate(filter, patch, { new: true, runValidators: true });
    }
  }

  /**
   * The occurrence a series MASTER's row stands for: its first one, as the
   * expansion would key it. A client holds a master only straight after
   * creating a repeating task (`allTasks` never returns masters), and the row
   * it draws is that first occurrence.
   */
  firstOccurrenceOf(master) {
    try {
      const rule = rrulestr(master.recurrenceRule);
      const dtstart = rule.options?.dtstart;
      const raw = rule.after(new Date(dtstart.getTime() - 1000), true);
      if (!raw) return null;
      const zone = effectiveHasDueTime(master) ? master.timeZone : null;
      return correctForZone(raw, dtstart, zone);
    } catch {
      return null;
    }
  }

  /** `virtual_<masterId>_<epochMs>` for one occurrence. */
  virtualIdFor(master, date) {
    return `virtual_${master._id}_${date.getTime()}`;
  }

  /**
   * D3: one late row per series. Finishing an occurrence that has already
   * come round (its time is not in the future) moves the series' late floor
   * to it, so the misses before it stop being expanded. Finishing a future
   * occurrence early does not — today's would otherwise vanish with it.
   */
  async raiseLateFloor(masterId, occurrenceDate, userId) {
    if (!masterId || !(occurrenceDate instanceof Date) || Number.isNaN(occurrenceDate.getTime())) return;
    if (occurrenceDate.getTime() > Date.now()) return;
    await this.taskModel.updateOne(
      {
        _id: masterId,
        createdBy: userId,
        $or: [{ skipMissedBefore: null }, { skipMissedBefore: { $lt: occurrenceDate } }],
      },
      { $set: { skipMissedBefore: occurrenceDate } }
    );
  }

  /**
   * "Change the time for all": move the whole series by the same amount the
   * edited occurrence moved — DTSTART, the master's own date, its exdates and
   * the keys of its materialised occurrences — so every occurrence lands at
   * the new time. It used to write the new instant into the master's
   * `dueDate` only; the RRULE's DTSTART stayed put and nothing moved.
   *
   * Returns null when there is nothing to shift (no movement, no parseable
   * single rule, or the caller is rewriting the rule itself), and the caller
   * falls back to the plain field update.
   */
  async shiftSeries(master, fromDate, updateData, userId) {
    if (!('dueDate' in updateData) || !updateData.dueDate || !fromDate) return null;
    if ('recurrenceRule' in updateData) return null;
    const to = new Date(updateData.dueDate);
    const from = new Date(fromDate);
    const delta = to.getTime() - from.getTime();
    if (!delta || Number.isNaN(delta) || !master.recurrenceRule) return null;
    let rule;
    try {
      rule = rrulestr(master.recurrenceRule);
    } catch {
      return null;
    }
    if (!(rule instanceof RRule) || !rule.origOptions?.dtstart) return null;

    const opts = rule.origOptions;
    const shiftedRule = new RRule({
      ...opts,
      dtstart: new Date(opts.dtstart.getTime() + delta),
    }).toString();
    const shiftedDue = master.dueDate ? new Date(new Date(master.dueDate).getTime() + delta) : new Date(opts.dtstart.getTime() + delta);
    const { dueDate: _occurrenceDue, ...rest } = updateData;
    const updated = await this.taskModel.findOneAndUpdate(
      { _id: master._id, createdBy: userId },
      {
        ...rest,
        recurrenceRule: shiftedRule,
        dueDate: shiftedDue,
        exdates: (master.exdates || []).map((d) => new Date(new Date(d).getTime() + delta)),
        skipMissedBefore: master.skipMissedBefore ? new Date(new Date(master.skipMissedBefore).getTime() + delta) : null,
        remindedAt: null,
        updatedAt: new Date(),
      },
      { new: true, runValidators: true }
    );

    // Re-key the series' overrides. Two passes through a far-off parking
    // range, because (series, originalDueDate) is unique and a one-pass shift
    // by exactly one interval collides with the next occurrence's row.
    const PARK = 1000 * 365 * 86400000;
    const filter = { createdBy: userId, seriesId: String(master._id), originalDueDate: { $type: 'date' } };
    await this.taskModel.updateMany(filter, [{ $set: { originalDueDate: { $add: ['$originalDueDate', delta + PARK] } } }]);
    await this.taskModel.updateMany(filter, [{ $set: { originalDueDate: { $subtract: ['$originalDueDate', PARK] } } }]);
    return updated;
  }

  /**
   * FUTURE_INSTANCES: terminate the existing series just before `splitDate`
   * and start a fresh series master at `splitDate` carrying `updateData`.
   * Overrides at or after the split point are re-parented onto the new series.
   * When `updateData` is null the series is simply truncated (delete-future).
   */
  async splitSeriesAt(master, splitDate, updateData, userId) {
    this.requireUser(userId);
    if (!master.recurrenceRule || !(splitDate instanceof Date) || Number.isNaN(splitDate.getTime())) {
      // Nothing to split — fall back to editing the master itself.
      if (!updateData) return this.deleteSeries(master, userId);
      return this.taskModel.findOneAndUpdate(
        { _id: master._id, createdBy: userId },
        { ...updateData, updatedAt: new Date() },
        { new: true }
      );
    }

    let rule;
    try {
      rule = rrulestr(master.recurrenceRule);
    } catch {
      rule = null;
    }
    if (!rule || !rule.origOptions) {
      // Unparseable / RRuleSet — cannot split cleanly; treat as whole-series.
      if (!updateData) return this.deleteSeries(master, userId);
      return this.taskModel.findOneAndUpdate(
        { _id: master._id, createdBy: userId },
        { ...updateData, updatedAt: new Date() },
        { new: true }
      );
    }

    // `splitDate` is an occurrence as the client saw it — wall-clock
    // corrected (correctForZone). The rule's own (raw) occurrence for it can
    // sit up to an hour away, so UNTIL is taken from that raw one: one second
    // before it ends the old series exactly there.
    let rawSplit = splitDate;
    const zone = effectiveHasDueTime(master) ? master.timeZone : null;
    if (zone) {
      const dtstart = rule.options?.dtstart;
      const near = rule.between(
        new Date(splitDate.getTime() - 2 * 3600000),
        new Date(splitDate.getTime() + 2 * 3600000),
        true
      );
      const match = near.find((raw) => correctForZone(raw, dtstart, zone).getTime() === splitDate.getTime());
      if (match) rawSplit = match;
    }
    const until = new Date(Math.min(splitDate.getTime(), rawSplit.getTime()) - 1000);

    const truncated = new RRule({ ...rule.origOptions, until, count: null });
    const truncatedMaster = await this.taskModel.findOneAndUpdate(
      { _id: master._id, createdBy: userId },
      { recurrenceRule: truncated.toString(), updatedAt: new Date() },
      { new: true }
    );

    // Drop overrides that belong to the detached tail of the old series.
    if (!updateData) {
      await this.taskModel.deleteMany({
        createdBy: userId,
        seriesId: String(master._id),
        originalDueDate: { $gte: splitDate },
      });
      return truncatedMaster;
    }

    const newRule = new RRule({ ...rule.origOptions, dtstart: splitDate, until: rule.origOptions.until ?? null });
    const base = master.toObject();
    delete base._id;
    delete base.clientId;
    const newMaster = await new this.taskModel({
      ...base,
      ...updateData,
      createdBy: master.createdBy,
      recurrenceRule: newRule.toString(),
      isSeriesMaster: true,
      seriesId: null,
      exdates: (master.exdates || []).filter((d) => d.getTime() >= splitDate.getTime()),
      dueDate: updateData.dueDate ?? splitDate,
      originalDueDate: null,
      skipMissedBefore: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).save();

    await this.taskModel.updateMany(
      { createdBy: userId, seriesId: String(master._id), originalDueDate: { $gte: splitDate } },
      { $set: { seriesId: String(newMaster._id) } }
    );

    return newMaster;
  }

  async deleteSeries(master, userId) {
    this.requireUser(userId);
    await this.taskModel.deleteMany({ createdBy: userId, seriesId: String(master._id) });
    return this.taskModel.findOneAndDelete({ _id: master._id, createdBy: userId });
  }

  async updateTask(taskId, rawUpdateData, editScope = 'THIS_INSTANCE', userId) {
    this.requireUser(userId);
    const scope = this.normalizeEditScope(editScope);
    const target = await this.resolveOwnedTarget(taskId, userId);
    if (!target) return null;

    // Only touch recurrence fields when the caller actually sent one, so that
    // ordinary edits never disturb an existing series.
    let updateData = rawUpdateData || {};

    // `private: null` means "not private" — never a stored null.
    if ('private' in updateData) updateData = { ...updateData, private: updateData.private === true };

    // Filing into / moving between collections — `null` clears the filing.
    if ('collectionId' in updateData) {
      await this.assertOwnedCollection(updateData.collectionId, userId);
      if (!updateData.collectionId) updateData = { ...updateData, collectionId: null };
    }

    // Moving the due date re-arms the reminder: a task already reminded for
    // 09:00 must be able to remind again once it is pushed to 14:00. Clearing
    // is unconditional when the date actually changes — including to null,
    // where it simply leaves a clean field behind. See reminderService.tick.
    if ('dueDate' in updateData) {
      const nextDue = updateData.dueDate ? new Date(updateData.dueDate).getTime() : null;
      const prevDueRaw = target.task?.dueDate ?? target.originalDueDate ?? null;
      const prevDue = prevDueRaw ? new Date(prevDueRaw).getTime() : null;
      if (nextDue !== prevDue) updateData = { ...updateData, remindedAt: null };
    }

    // Contract C2: a write that moves the date says whether it is timed, or
    // is read with the legacy midnight rule (old bundles send only dueDate).
    if ('dueDate' in updateData) {
      updateData = { ...updateData, hasDueTime: this.resolveHasDueTime(updateData.dueDate, updateData.hasDueTime) };
    } else if ('hasDueTime' in updateData && typeof updateData.hasDueTime !== 'boolean') {
      const { hasDueTime: _dropped, ...rest } = updateData;
      updateData = rest;
    }
    if ('timeZone' in updateData && !updateData.timeZone) updateData = { ...updateData, timeZone: null };
    delete updateData.clientId;
    delete updateData.skipMissedBefore;

    if ('recurrenceRule' in updateData || 'recurrencePattern' in updateData) {
      updateData = this.normalizeRecurrence(
        updateData,
        target.task?.dueDate || target.originalDueDate
      );
      if (!updateData.recurrenceRule) {
        // Recurrence explicitly cleared — demote back to a plain task.
        updateData.recurrenceRule = null;
        updateData.recurrencePattern = 'none';
        updateData.isSeriesMaster = false;
      }
    }

    if (target.virtual) {
      const { master, originalDueDate } = target;
      if (scope === 'ALL_INSTANCES') {
        const shifted = await this.shiftSeries(master, originalDueDate, updateData, userId);
        if (shifted) return shifted;
        return this.taskModel.findOneAndUpdate(
          { _id: master._id, createdBy: userId },
          { ...updateData, updatedAt: new Date() },
          { new: true, runValidators: true }
        );
      }
      if (scope === 'FUTURE_INSTANCES') {
        return this.splitSeriesAt(master, originalDueDate, updateData, userId);
      }
      return this.upsertOverride(master, originalDueDate, updateData);
    }

    const task = target.task;

    // THIS occurrence, from a master's row: the master stands for its first
    // occurrence, so that occurrence gets the edit (plan 1.6). A change to
    // the repeat itself is a series edit and still goes to the master.
    if (task.isSeriesMaster && scope === 'THIS_INSTANCE' && !('recurrenceRule' in updateData)) {
      const first = this.firstOccurrenceOf(task);
      if (first) return this.upsertOverride(task, first, updateData);
    }

    if (scope === 'FUTURE_INSTANCES' && (task.isSeriesMaster || task.seriesId)) {
      const masterId = task.seriesId || task._id;
      const master = await this.findOwnedTask(masterId, userId);
      if (master) {
        const splitDate = task.originalDueDate || task.dueDate;
        return this.splitSeriesAt(master, splitDate, updateData, userId);
      }
    }

    if (task.isSeriesMaster || scope === 'ALL_INSTANCES') {
      const targetId = task.seriesId || task._id;
      // "For all" from an occurrence's row moves the series by as much as
      // that occurrence moved; from the master's own row, by as much as the
      // master's first date did.
      const master = task.isSeriesMaster ? task : await this.findOwnedTask(targetId, userId);
      if (master?.isSeriesMaster) {
        const from = task.isSeriesMaster
          ? (this.firstOccurrenceOf(master) || master.dueDate)
          : (task.originalDueDate || task.dueDate);
        const shifted = await this.shiftSeries(master, from, updateData, userId);
        if (shifted) return shifted;
      }
      const updated = await this.taskModel.findOneAndUpdate(
        { _id: targetId, createdBy: userId },
        { ...updateData, updatedAt: new Date() },
        { new: true }
      );
      if (updated) return updated;
    }

    return this.taskModel.findOneAndUpdate(
      { _id: task._id, createdBy: userId },
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
  }

  async deleteTask(taskId, editScope = 'THIS_INSTANCE', userId) {
    this.requireUser(userId);
    const scope = this.normalizeEditScope(editScope);
    const target = await this.resolveOwnedTarget(taskId, userId);
    if (!target) return null;

    if (target.virtual) {
      const { master, originalDueDate } = target;
      if (scope === 'ALL_INSTANCES') return this.deleteSeries(master, userId);
      if (scope === 'FUTURE_INSTANCES') return this.splitSeriesAt(master, originalDueDate, null, userId);
      // A virtual occurrence may already have an override row (a tick sent a
      // moment ago); it goes too, or it would outlive its exdate.
      await this.taskModel.deleteOne({ createdBy: userId, seriesId: String(master._id), originalDueDate });
      return this.taskModel.findOneAndUpdate(
        { _id: master._id, createdBy: userId },
        { $addToSet: { exdates: originalDueDate } },
        { new: true }
      );
    }

    const task = target.task;

    if (scope === 'FUTURE_INSTANCES' && (task.isSeriesMaster || task.seriesId)) {
      const masterId = task.seriesId || task._id;
      const master = await this.findOwnedTask(masterId, userId);
      if (master) {
        const splitDate = task.originalDueDate || task.dueDate;
        const result = await this.splitSeriesAt(master, splitDate, null, userId);
        if (task.seriesId) await this.taskModel.findOneAndDelete({ _id: task._id, createdBy: userId });
        return result;
      }
    }

    if (scope === 'ALL_INSTANCES' && (task.isSeriesMaster || task.seriesId)) {
      const targetId = task.seriesId || task._id;
      const master = await this.findOwnedTask(targetId, userId);
      if (master) return this.deleteSeries(master, userId);
    }

    // THIS occurrence of a master's row: the master stands for its first
    // occurrence (see firstOccurrenceOf), so that is the one deleted. It used
    // to delete the whole series — "vitamins (daily)" deleted straight after
    // adding it was gone for good. Plan 1.6.
    if (task.isSeriesMaster) {
      const first = this.firstOccurrenceOf(task);
      if (!first) return this.deleteSeries(task, userId);
      await this.taskModel.deleteOne({
        createdBy: userId, seriesId: String(task._id), originalDueDate: first,
      });
      return this.taskModel.findOneAndUpdate(
        { _id: task._id, createdBy: userId },
        { $addToSet: { exdates: first } },
        { new: true }
      );
    }

    // A materialised occurrence (moved, edited, completed) deleted on its
    // own: its date goes into the master's exdates FIRST, or the expansion
    // finds no override for that date any more and the virtual comes back.
    // SIMPLE_PLAN promised "deletes that occurrence only". Plan 1.7.
    if (task.seriesId && task.originalDueDate && mongoose.Types.ObjectId.isValid(task.seriesId)) {
      await this.taskModel.updateOne(
        { _id: task.seriesId, createdBy: userId },
        { $addToSet: { exdates: task.originalDueDate } }
      );
    }

    if (task.parentTask) {
      await this.taskModel.findOneAndUpdate(
        { _id: task.parentTask, createdBy: userId },
        { $pull: { subtasks: task._id } }
      );
    }
    await this.taskModel.deleteMany({ parentTask: task._id, createdBy: userId });
    return this.taskModel.findOneAndDelete({ _id: task._id, createdBy: userId });
  }

  async updateStatusInternal(taskId, updateData, userId) {
    const target = await this.resolveOwnedTarget(taskId, userId);
    if (!target) return null;

    if (target.virtual) {
      const { master, originalDueDate } = target;
      return this.upsertOverride(master, originalDueDate, updateData);
    }

    return this.taskModel.findOneAndUpdate(
      { _id: target.task._id, createdBy: userId },
      updateData,
      { new: true, runValidators: true }
    );
  }

  /**
   * Park a task: it keeps its dueDate but drops out of every log view until it
   * is unblocked. Blocking a virtual occurrence materializes a blocked
   * override for that date only, leaving the series master alone.
   *
   * Returns null when the id is not the caller's (indistinguishable from
   * not-found); throws a `BAD_USER_INPUT` error for a transition the task's
   * current status does not allow, or an over-long reason.
   */
  async blockTask(taskId, reason, userId) {
    this.requireUser(userId);
    const trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (trimmed.length > MAX_BLOCKED_REASON) {
      throw badRequest(`blockTask reason must be ${ MAX_BLOCKED_REASON } characters or fewer`);
    }

    const target = await this.resolveOwnedTarget(taskId, userId);
    if (!target) return null;

    // A virtual occurrence has no stored status — it is pending by
    // construction — so only a materialized task can fail the guard.
    const current = target.virtual ? 'pending' : target.task.status;
    if (!BLOCKABLE_STATUSES.includes(current)) {
      throw badRequest(`A ${ current } task cannot be blocked`);
    }

    const now = new Date();
    const updateData = {
      status: 'blocked',
      blockedReason: trimmed || null,
      // Re-blocking rewrites the reason but keeps the original parked-since.
      blockedAt: (!target.virtual && target.task.blockedAt) || now,
      completedAt: null,
      cancelledAt: null,
      updatedAt: now,
    };

    return this.updateStatusInternal(taskId, updateData, userId);
  }

  /**
   * Un-park a task: back to pending with the blocked fields cleared. The
   * original dueDate is left exactly as it was — if that date has since passed
   * the task simply reappears in the log as overdue, which is the point.
   */
  async unblockTask(taskId, userId) {
    this.requireUser(userId);
    const target = await this.resolveOwnedTarget(taskId, userId);
    if (!target) return null;
    if (target.virtual || target.task.status !== 'blocked') {
      throw badRequest('Task is not blocked');
    }
    return this.updateStatusInternal(
      taskId,
      { status: 'pending', blockedReason: null, blockedAt: null, updatedAt: new Date() },
      userId
    );
  }

  /** The owner's parked tasks, newest-blocked first. */
  async getBlockedTasks(userId) {
    this.requireUser(userId);
    return this.taskModel.find({ createdBy: userId, status: 'blocked' })
      .populate('parentTask', 'content status')
      .sort({ blockedAt: -1, updatedAt: -1 });
  }

  async updateTaskStatus(taskId, status, userId, editScope = null) {
    this.requireUser(userId);

    // A series MASTER's row is its first occurrence (firstOccurrenceOf). A
    // status change on it without ALL_INSTANCES acts on that occurrence: it
    // used to complete the master, and "vitamins (daily)" ticked straight
    // after adding it vanished from every view and never repeated. Plan 1.6.
    if (editScope !== 'ALL_INSTANCES' && !this.parseVirtualId(taskId)) {
      const own = await this.findOwnedTask(taskId, userId);
      if (own?.isSeriesMaster && own.recurrenceRule) {
        const first = this.firstOccurrenceOf(own);
        if (!first) throw badRequest('This repeating task has no occurrence to change; use ALL_INSTANCES');
        taskId = this.virtualIdFor(own, first);
      }
    }

    // 'blocked' has its own entry point so the transition guard and the
    // blockedAt stamping live in exactly one place.
    if (status === 'blocked') return this.blockTask(taskId, null, userId);

    const now = new Date();
    const updateData = { status, updatedAt: now };
    // completedAt / cancelledAt are set on entering that status and explicitly
    // cleared when the task leaves it (re-opened, migrated, un-cancelled, etc.)
    // — mirrors of the same pattern, kept mutually exclusive.
    updateData.completedAt = status === 'completed' ? now : null;
    updateData.cancelledAt = status === 'cancelled' ? now : null;
    // Any other status means the task is no longer parked — completing a
    // blocked task straight from the blocked list is allowed and clears it.
    updateData.blockedReason = null;
    updateData.blockedAt = null;

    // NOTE: the legacy "auto-spawn the next occurrence on completion" branch
    // was removed — recurrence is now expressed exclusively as an RRULE series
    // and future occurrences are expanded virtually, never materialized on
    // completion.
    const result = await this.updateStatusInternal(taskId, updateData, userId);
    if (result && (status === 'completed' || status === 'cancelled') && result.seriesId && result.originalDueDate) {
      await this.raiseLateFloor(result.seriesId, new Date(result.originalDueDate), userId);
    }
    return result;
  }

  async getTaskById(taskId, userId) {
    this.requireUser(userId);
    if (String(taskId ?? '').startsWith('virtual_')) {
      return null;
    }
    if (!mongoose.Types.ObjectId.isValid(taskId)) return null;
    return this.taskModel.findOne({ _id: taskId, createdBy: userId })
      .populate('parentTask', 'content status')
      .populate('subtasks');
  }

  // ─── Subtasks ───────────────────────────────────────────────────────────
  //
  // A subtask is an ordinary Task carrying `parentTask`; the parent keeps an
  // ordered `subtasks` array of their ids, and THAT array is the order of
  // record — Mongo does not otherwise promise one. Two rules follow:
  //
  //   - every write that creates or removes a child must keep the array in
  //     step (`addSubtask` pushes, `deleteTask` pulls), and
  //   - reads order the children BY the array, appending any child the array
  //     has never heard of (belt and braces for rows written before the push
  //     existed) so a stray child is late, never invisible.
  //
  // Subtasks are deliberately NOT filtered out of the log views: a subtask
  // with its own due date is real work on a real day. The client nests it
  // under its parent when both are on screen and shows the parent as a
  // caption when it is not.

  /**
   * Create a child of `parentId` and append it to the parent's ordered list.
   * Returns `{ subtask, parent }` — the parent comes back so a caller can
   * hand the client a fresh count without a second round trip.
   */
  async addSubtask({ parentId, userId, ...data }) {
    this.requireUser(userId);
    const parent = await this.findOwnedTask(parentId, userId);
    if (!parent) throw badRequest('Parent task not found');
    // One level only. A subtask of a subtask is a project, and this app is a
    // task list — nesting deeper turns the daily log into an outliner.
    if (parent.parentTask) throw badRequest('Subtasks cannot themselves have subtasks');

    const subtask = await this.createTask({
      ...data,
      parentTask: parent._id,
      createdBy: userId,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    });

    const updatedParent = await this.taskModel.findOneAndUpdate(
      { _id: parent._id, createdBy: userId },
      { $addToSet: { subtasks: subtask._id }, $set: { updatedAt: new Date() } },
      { new: true }
    );

    return { subtask, parent: updatedParent ?? parent };
  }

  /**
   * The children of `task`, in the parent's stored order. One query, owner
   * scoped, and O(0) for the overwhelmingly common childless task — which is
   * what keeps this safe to hang off a field resolver in a list view.
   */
  async getSubtasks(task, userId) {
    this.requireUser(userId);
    const raw = Array.isArray(task?.subtasks) ? task.subtasks : [];
    const parentId = task?._id ?? task?.id;
    // A virtual recurring occurrence has no document of its own to be a
    // parent, so it can have no children to look up.
    if (raw.length === 0 || !mongoose.Types.ObjectId.isValid(parentId)) return [];

    const ids = raw
      .map((entry) => (entry && entry._id ? entry._id : entry))
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map(String);
    if (ids.length === 0) return [];

    const children = await this.taskModel.find({
      _id: { $in: ids },
      parentTask: parentId,
      createdBy: userId,
    });

    const byId = new Map(children.map((c) => [String(c._id), c]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    // Anything the parent's array did not name goes on the end, oldest first.
    const named = new Set(ordered.map((c) => String(c._id)));
    for (const child of children) {
      if (!named.has(String(child._id))) ordered.push(child);
    }
    return ordered;
  }

  /**
   * Rewrite the parent's ordered child list. Ids that are not this parent's
   * children are rejected outright rather than silently dropped — a reorder
   * that quietly loses a row is worse than one that fails.
   */
  async reorderSubtasks(parentId, orderedSubtaskIds, userId) {
    this.requireUser(userId);
    const parent = await this.findOwnedTask(parentId, userId);
    if (!parent) return null;

    const requested = (orderedSubtaskIds ?? []).map(String);
    if (new Set(requested).size !== requested.length) {
      throw badRequest('reorderSubtasks received a duplicate subtask id');
    }

    const children = await this.taskModel
      .find({ parentTask: parent._id, createdBy: userId })
      .select('_id');
    const owned = new Set(children.map((c) => String(c._id)));

    for (const id of requested) {
      if (!owned.has(id)) throw badRequest('reorderSubtasks received an id that is not a subtask of this task');
    }
    if (requested.length !== owned.size) {
      throw badRequest('reorderSubtasks must list every subtask exactly once');
    }

    return this.taskModel.findOneAndUpdate(
      { _id: parent._id, createdBy: userId },
      { $set: { subtasks: requested, updatedAt: new Date() } },
      { new: true }
    );
  }

  /**
   * The parent of `task`, whatever shape the caller's document is in: already
   * populated (list views ask for `content status`), a bare ObjectId (a
   * mutation payload), or absent.
   */
  async getParentTask(task, userId) {
    this.requireUser(userId);
    const parent = task?.parentTask;
    if (!parent) return null;
    // Populated documents carry the fields we ever select; a raw id does not.
    if (typeof parent === 'object' && (parent.content !== undefined || parent.status !== undefined)) {
      return parent;
    }
    const id = parent._id ?? parent;
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return this.taskModel.findOne({ _id: id, createdBy: userId }).select('content status');
  }

  /**
   * Tag counts, in the suite standard (`@geeksuite/tags`). Spellings stored
   * before the standard (`geekSuite`) are folded into their standard tag
   * (`geek-suite`) until the migration rewrites them; a task carrying two
   * legacy spellings of one tag is counted under it once per spelling.
   */
  async getTagsForUser(userId) {
    this.requireUser(userId);
    const rows = await this.taskModel.aggregate([
      { $match: { createdBy: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
    ]);
    const counts = new Map();
    for (const { _id, count } of rows) {
      const tag = normalizeTag(typeof _id === 'string' ? _id : '');
      if (tag) counts.set(tag, (counts.get(tag) || 0) + count);
    }
    return [...counts]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  }

  /** Tasks carrying ALL of `tags` (normalized; legacy spellings still match). */
  async getTasksByTags(userId, tags) {
    this.requireUser(userId);
    const scope = { createdBy: userId };
    const clauses = await Promise.all(
      tags.map(async (t) => ({ tags: { $in: await spellingsOf(this.taskModel, scope, t) } }))
    );
    const tasks = await this.taskModel.find({ ...scope, ...(clauses.length ? { $and: clauses } : {}) }).sort({ dueDate: -1, createdAt: -1 });
    return tasks.map(t => t.toObject());
  }
}

export default new TaskService();
