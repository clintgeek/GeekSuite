import Task from '../models/Task.js';
import TaskOrder from '../models/TaskOrder.js';
import Collection from '../models/Collection.js';
import mongoose from 'mongoose';
import rrulePkg from 'rrule';

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

class TaskService {
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

  async getTasksForDateRange({ userId, startDate, endDate, viewType }) {
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
      case 'daily':
        query.$or = [
          { dueDate: { $gte: startOfDayDate, $lte: endOfDayDate } },
          { status: { $in: ['completed', 'cancelled'] }, updatedAt: { $gte: startOfDayDate, $lte: endOfDayDate }, $or: [{ dueDate: { $gte: startOfDayDate, $lte: endOfDayDate } }, { dueDate: null }] },
          { dueDate: null, status: 'pending', createdAt: { $lte: endOfDayDate } },
          { dueDate: { $lt: startOfDayDate }, status: { $in: ['pending', 'migrated_future'] } },
        ];
        break;
      case 'weekly': {
        const startOfWeekDate = new Date(startOfDayDate);
        startOfWeekDate.setUTCDate(startOfWeekDate.getUTCDate() - startOfWeekDate.getUTCDay());
        startOfWeekDate.setUTCHours(0, 0, 0, 0);
        const endOfWeekDate = new Date(startOfWeekDate);
        endOfWeekDate.setUTCDate(endOfWeekDate.getUTCDate() + 6);
        endOfWeekDate.setUTCHours(23, 59, 59, 999);
        query.$or = [
          { dueDate: { $gte: startOfWeekDate, $lte: endOfWeekDate } },
          { status: { $in: ['completed', 'cancelled'] }, updatedAt: { $gte: startOfWeekDate, $lte: endOfWeekDate } },
          { dueDate: null, status: 'pending', createdAt: { $lte: endOfWeekDate } },
          { dueDate: { $lt: startOfWeekDate }, status: { $in: ['pending', 'migrated_future'] } },
        ];
        break;
      }
      case 'monthly': {
        const startOfMonthDate = new Date(Date.UTC(startOfDayDate.getUTCFullYear(), startOfDayDate.getUTCMonth(), 1, 0, 0, 0, 0));
        const endOfMonthDate = new Date(Date.UTC(startOfDayDate.getUTCFullYear(), startOfDayDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
        query.$or = [
          { dueDate: { $gte: startOfMonthDate, $lte: endOfMonthDate } },
          { status: { $in: ['completed', 'cancelled'] }, updatedAt: { $gte: startOfMonthDate, $lte: endOfMonthDate } },
          { dueDate: null, status: 'pending', createdAt: { $lte: endOfMonthDate } },
          { dueDate: { $lt: startOfMonthDate }, status: { $in: ['pending', 'migrated_future'] } },
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
    let viewStart, viewEnd;
    if (viewType === 'daily') {
      viewStart = startOfDayDate; viewEnd = endOfDayDate;
    } else if (viewType === 'weekly') {
      const startOfWeekDate = new Date(startOfDayDate);
      startOfWeekDate.setUTCDate(startOfWeekDate.getUTCDate() - startOfWeekDate.getUTCDay());
      startOfWeekDate.setUTCHours(0, 0, 0, 0);
      const endOfWeekDate = new Date(startOfWeekDate);
      endOfWeekDate.setUTCDate(endOfWeekDate.getUTCDate() + 6);
      endOfWeekDate.setUTCHours(23, 59, 59, 999);
      viewStart = startOfWeekDate; viewEnd = endOfWeekDate;
    } else if (viewType === 'monthly') {
      viewStart = new Date(Date.UTC(startOfDayDate.getUTCFullYear(), startOfDayDate.getUTCMonth(), 1, 0, 0, 0, 0));
      viewEnd = new Date(Date.UTC(startOfDayDate.getUTCFullYear(), startOfDayDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    } else {
      viewStart = new Date(0); viewEnd = new Date(8640000000000000);
    }

    // A blocked master parks the whole series — like completed/cancelled, it
    // stops producing occurrences. Blocking a single occurrence instead
    // materializes a blocked override, which lands in `overrideMap` below and
    // suppresses that date's virtual, so neither path can spawn a duplicate.
    const masterTasks = await this.taskModel.find({
      createdBy: userId,
      isSeriesMaster: true,
      status: { $nin: ['completed', 'cancelled', 'blocked'] }
    });

    const overrides = await this.taskModel.find({
      createdBy: userId,
      seriesId: { $in: masterTasks.map(m => m._id) }
    });
    const overrideMap = new Map();
    for (const ov of overrides) {
      if (ov.originalDueDate) {
        overrideMap.set(`${ov.seriesId}_${ov.originalDueDate.getTime()}`, ov);
      }
    }

    for (const master of masterTasks) {
      if (!master.recurrenceRule) continue;
      try {
        const rule = rrulestr(master.recurrenceRule);
        const occurrences = rule.between(viewStart, viewEnd, true);

        for (const date of occurrences) {
          if (master.exdates && master.exdates.some(ex => ex.getTime() === date.getTime())) continue;

          const key = `${master._id}_${date.getTime()}`;
          if (!overrideMap.has(key)) {
            tasksWithDates.push({
              _id: `virtual_${master._id}_${date.getTime()}`,
              content: master.content,
              signifier: master.signifier,
              status: 'pending',
              priority: master.priority,
              note: master.note,
              tags: master.tags,
              dueDate: date,
              originalDueDate: date,
              seriesId: master._id,
              recurrenceRule: master.recurrenceRule,
              isVirtual: true,
              createdBy: master.createdBy
            });
          }
        }

        // Carry-forward logic for daily/all view
        if (viewType === 'daily' || viewType === 'all') {
          const pastDate = rule.before(viewStart, false);
          if (pastDate) {
            let skipPast = false;
            if (master.exdates && master.exdates.some(ex => ex.getTime() === pastDate.getTime())) skipPast = true;
            
            if (!skipPast) {
              const pastKey = `${master._id}_${pastDate.getTime()}`;
              const pastOverride = overrideMap.get(pastKey);
              if (!pastOverride) {
                tasksWithDates.push({
                  _id: `virtual_${master._id}_${pastDate.getTime()}`,
                  content: master.content,
                  signifier: master.signifier,
                  status: 'pending',
                  priority: master.priority,
                  note: master.note,
                  tags: master.tags,
                  dueDate: pastDate,
                  originalDueDate: pastDate,
                  seriesId: master._id,
                  recurrenceRule: master.recurrenceRule,
                  isVirtual: true,
                  createdBy: master.createdBy
                });
              }
            }
          }
        }
      } catch (e) {
        console.error("Invalid RRULE on task", master._id, e);
      }
    }
    // --- RRULE EXPANSION END ---

    const sorted = this.sortTasks(tasksWithDates);

    if (viewType === 'daily') {
      const dateKey = this.formatDateKey(startDate);
      const orderDoc = await TaskOrder.findOne({ userId, dateKey }).lean();
      if (orderDoc && Array.isArray(orderDoc.orderedTaskIds) && orderDoc.orderedTaskIds.length > 0) {
        const idToTask = new Map(sorted.map(t => [String(t._id), t]));
        const inOrder = orderDoc.orderedTaskIds.map(id => String(id)).filter(id => idToTask.has(id)).map(id => idToTask.get(id));
        const remaining = sorted.filter(t => !orderDoc.orderedTaskIds.map(x => String(x)).includes(String(t._id)));
        return [...inOrder, ...remaining];
      }
    }
    return sorted;
  }

  sortTasks(tasks) {
    return tasks.sort((a, b) => {
      if (a.status !== b.status) {
        const aSunk = a.status !== 'pending';
        const bSunk = b.status !== 'pending';
        if (aSunk !== bSunk) return aSunk ? 1 : -1;
        // Within the sunk group, cancelled sits below completed — per
        // SORTING_RULES.md spirit (completed/cancelled below active); the doc
        // doesn't specify a relative order for these two, so cancelled last.
        if (a.status === 'cancelled' && b.status === 'completed') return 1;
        if (a.status === 'completed' && b.status === 'cancelled') return -1;
        return a.status === 'pending' ? -1 : 1;
      }
      if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return (b.priority || 0) - (a.priority || 0);
    });
  }

  async saveDailyOrder({ userId, dateKey, orderedTaskIds }) {
    this.requireUser(userId);
    return TaskOrder.findOneAndUpdate(
      { userId, dateKey },
      { orderedTaskIds, updatedAt: new Date() },
      { new: true, upsert: true }
    );
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

  async createTask(taskData) {
    this.requireUser(taskData?.createdBy);
    const data = this.normalizeRecurrence(taskData);
    if ('collectionId' in data) {
      await this.assertOwnedCollection(data.collectionId, data.createdBy);
      if (!data.collectionId) data.collectionId = null;
    }
    return new this.taskModel(data).save();
  }

  /**
   * Materialize a single occurrence of a series as its own task document,
   * carrying the caller's edits.
   */
  buildOverride(master, originalDueDate, updateData) {
    const base = master.toObject();
    delete base._id;
    return {
      ...base,
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

    const until = new Date(splitDate.getTime() - 1000);

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
        return this.taskModel.findOneAndUpdate(
          { _id: master._id, createdBy: userId },
          { ...updateData, updatedAt: new Date() },
          { new: true, runValidators: true }
        );
      }
      if (scope === 'FUTURE_INSTANCES') {
        return this.splitSeriesAt(master, originalDueDate, updateData, userId);
      }
      return new this.taskModel(this.buildOverride(master, originalDueDate, updateData)).save();
    }

    const task = target.task;

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
      return this.taskModel.findOneAndUpdate(
        { _id: master._id, createdBy: userId },
        { $push: { exdates: originalDueDate } },
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

    if (task.isSeriesMaster || scope === 'ALL_INSTANCES') {
      const targetId = task.seriesId || task._id;
      const master = await this.findOwnedTask(targetId, userId);
      if (master) return this.deleteSeries(master, userId);
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
      return new this.taskModel(this.buildOverride(master, originalDueDate, updateData)).save();
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

  async updateTaskStatus(taskId, status, userId) {
    this.requireUser(userId);
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
    return this.updateStatusInternal(taskId, updateData, userId);
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

  async getTagsForUser(userId) {
    this.requireUser(userId);
    return this.taskModel.aggregate([
      { $match: { createdBy: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $project: { _id: 0, tag: '$_id', count: 1 } },
    ]);
  }

  async getTasksByTags(userId, tags) {
    this.requireUser(userId);
    const tasks = await this.taskModel.find({ createdBy: userId, tags: { $all: tags } }).sort({ dueDate: -1, createdAt: -1 });
    return tasks.map(t => t.toObject());
  }
}

export default new TaskService();
