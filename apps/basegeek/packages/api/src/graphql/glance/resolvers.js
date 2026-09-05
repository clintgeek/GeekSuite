import mongoose from 'mongoose';
import { format } from 'date-fns';
import logger from '../../lib/logger.js';
import ical from 'node-ical';

import Task from '../bujogeek/models/Task.js';
import Habit from '../bujogeek/models/Habit.js';
import HabitLog from '../bujogeek/models/HabitLog.js';
import taskService from '../bujogeek/services/taskService.js';
import habitService from '../bujogeek/services/habitService.js';

import Note from '../notegeek/models/Note.js';
import { Book } from '../bookgeek/models/book.js';
import Bird from '../flockgeek/models/Bird.js';
import EggProduction from '../flockgeek/models/EggProduction.js';

import { resolvers as fitnessResolvers } from '../fitnessgeek/resolvers.js';
import { planQuery, answerFrom, draftFrom } from './askService.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function defaultDateString() {
  return format(new Date(), 'yyyy-MM-dd');
}

function startOfDay(dateStr) {
  const [y, m, d] = (dateStr || defaultDateString()).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function endOfDay(dateStr) {
  const [y, m, d] = (dateStr || defaultDateString()).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

function getUserId(context) {
  const userId = context?.user?.id || context?.user?._id;
  if (!userId) {
    const err = new Error('Unauthorized');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  return String(userId);
}

function toObjectId(userId) {
  if (!mongoose.isValidObjectId(userId)) return null;
  return new mongoose.Types.ObjectId(userId);
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mapTask(t) {
  return {
    id: t._id ? t._id.toString() : t.id,
    content: t.content || '',
    signifier: t.signifier || null,
    status: t.status || 'pending',
    priority: t.priority || null,
    dueDate: t.dueDate || null,
    tags: t.tags || [],
  };
}

function noteSnippet(note) {
  if (note.isLocked || note.isEncrypted) return null;
  if (!note.content) return null;
  return note.content.substring(0, 120);
}

function icalText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value.val ?? '';
}

// Fetch and parse a single ICS feed, returning VEVENT components only.
async function fetchIcsEvents(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const data = await ical.fromURL(url, { signal: controller.signal });
    return Object.values(data).filter((c) => c && c.type === 'VEVENT');
  } finally {
    clearTimeout(timer);
  }
}

// ── Resolvers ───────────────────────────────────────────────────────────────

// ── glanceToday ─────────────────────────────────────────────────────────────

/**
 * The glanceToday resolver's body, hoisted so other resolvers can reuse the
 * same snapshot. glanceAsk grounds its answers on it. Behaviour is unchanged.
 */
export async function fetchGlanceToday(context, date) {
  const userId = getUserId(context);
  const userOid = toObjectId(userId);
  const targetDate = date || defaultDateString();
  const dayStart = startOfDay(targetDate);
  const dayEnd = endOfDay(targetDate);
  const dayOfWeek = dayStart.getUTCDay();

  const result = {
    date: targetDate,
    tasks: { due: [], overdue: [], events: [], upcoming: [], completedCount: 0, blockedCount: 0 },
    habits: [],
    recentNotes: [],
    reading: [],
    fitness: null,
    flock: null,
  };

  // ── Tasks ──
  try {
    if (userOid) {
      const [allDaily, upcoming, completedCount, blockedCount] = await Promise.all([
        taskService.getTasksForDateRange({
          userId,
          startDate: targetDate,
          endDate: targetDate,
          viewType: 'daily',
        }),
        Task.find({
          createdBy: userOid,
          status: 'pending',
          dueDate: { $gt: dayEnd },
        })
          .sort({ dueDate: 1 })
          .limit(20)
          .lean(),
        Task.countDocuments({
          createdBy: userOid,
          completedAt: { $gte: dayStart, $lte: dayEnd },
        }),
        Task.countDocuments({
          createdBy: userOid,
          status: 'blocked',
        }),
      ]);

      result.tasks = {
        due: allDaily
          .filter(
            (t) =>
              t.status === 'pending' &&
              t.dueDate &&
              new Date(t.dueDate) >= dayStart &&
              new Date(t.dueDate) <= dayEnd
          )
          .map(mapTask),
        overdue: allDaily
          .filter(
            (t) =>
              t.status === 'pending' &&
              t.dueDate &&
              new Date(t.dueDate) < dayStart
          )
          .slice(0, 10)
          .map(mapTask),
        events: allDaily
          .filter(
            (t) =>
              t.signifier === '@' &&
              t.dueDate &&
              new Date(t.dueDate) >= dayStart &&
              new Date(t.dueDate) <= dayEnd &&
              t.status !== 'cancelled' &&
              t.status !== 'blocked'
          )
          .map(mapTask),
        upcoming: upcoming.map(mapTask),
        completedCount,
        blockedCount,
      };
    }
  } catch (err) {
    logger.warn({ err }, 'glanceToday: bujo task fetch failed');
  }

  // ── Habits ──
  try {
    if (userOid) {
      const [habits, logs] = await Promise.all([
        Habit.find({ createdBy: userOid }).sort({ name: 1 }),
        HabitLog.find({ createdBy: userOid, date: dayStart }),
      ]);

      const todayHabits = habits.filter(
        (h) =>
          !h.archived &&
          (!h.daysOfWeek ||
            h.daysOfWeek.length === 0 ||
            h.daysOfWeek.includes(dayOfWeek))
      );
      const doneToday = new Set(logs.map((l) => String(l.habitId)));

      result.habits = await Promise.all(
        todayHabits.map(async (h) => ({
          id: h._id.toString(),
          name: h.name,
          color: h.color || null,
          doneToday: doneToday.has(String(h._id)),
          currentStreak: await habitService.getCurrentStreak(h, userId, dayStart),
        }))
      );
    }
  } catch (err) {
    logger.warn({ err }, 'glanceToday: bujo habit fetch failed');
  }

  // ── Recent notes ──
  try {
    if (userOid) {
      const notes = await Note.find({ userId: userOid })
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean();

      result.recentNotes = notes.map((n) => ({
        id: n._id.toString(),
        title: n.title || 'Untitled',
        type: n.type || 'text',
        tags: n.tags || [],
        updatedAt: n.updatedAt,
        snippet: noteSnippet(n),
      }));
    }
  } catch (err) {
    logger.warn({ err }, 'glanceToday: note fetch failed');
  }

  // ── Reading ──
  try {
    const books = await Book.find({ shelf: 'reading' })
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean();

    result.reading = books.map((b) => ({
      id: b._id.toString(),
      title: b.title || 'Untitled',
      authors: b.authors || [],
      readingProgress: b.readingProgress ?? null,
      pageCount: b.pageCount ?? null,
      coverPath: b.coverPath || null,
    }));
  } catch (err) {
    logger.warn({ err }, 'glanceToday: book fetch failed');
  }

  // ── Fitness ──
  try {
    const [summary, streak, logs, activities] = await Promise.all([
      fitnessResolvers.Query.dailySummary(null, { date: targetDate }, context),
      fitnessResolvers.Query.loginStreak(null, {}, context),
      fitnessResolvers.Query.foodLogs(null, { date: targetDate }, context),
      fitnessResolvers.Query.garminActivities(null, { limit: 1 }, context).catch(() => []),
    ]);

    const mealsLogged = Array.isArray(logs) ? logs.length : 0;
    const calories = summary?.totals?.calories ?? 0;
    const calorieGoal = summary?.calorieGoal ?? null;
    const loginStreak = streak?.currentStreak ?? null;
    const lastActivity = Array.isArray(activities) && activities[0] ? activities[0] : null;

    if (mealsLogged > 0 || calorieGoal || calories > 0 || loginStreak || lastActivity) {
      result.fitness = { calories, calorieGoal, mealsLogged, loginStreak, lastActivity };
    }
  } catch (err) {
    logger.warn({ err }, 'glanceToday: fitness fetch failed');
    result.fitness = null;
  }

  // ── Flock ──
  try {
    const activeBirds = await Bird.countDocuments({
      ownerId: userId,
      deletedAt: null,
      status: { $nin: ['deceased', 'culled', 'sold', 'rehomed'] },
    });

    if (activeBirds > 0) {
      const weekStart = new Date(dayStart);
      weekStart.setUTCDate(weekStart.getUTCDate() - 6);

      const [todayAgg, weekAgg] = await Promise.all([
        EggProduction.aggregate([
          {
            $match: {
              ownerId: userId,
              deletedAt: null,
              date: { $gte: dayStart, $lte: dayEnd },
            },
          },
          { $group: { _id: null, total: { $sum: '$eggsCount' } } },
        ]),
        EggProduction.aggregate([
          {
            $match: {
              ownerId: userId,
              deletedAt: null,
              date: { $gte: weekStart, $lte: dayEnd },
            },
          },
          { $group: { _id: null, total: { $sum: '$eggsCount' } } },
        ]),
      ]);

      result.flock = {
        activeBirds,
        todayEggs: todayAgg[0]?.total || 0,
        weekEggs: weekAgg[0]?.total || 0,
      };
    }
  } catch (err) {
    logger.warn({ err }, 'glanceToday: flock fetch failed');
    result.flock = null;
  }

  return result;
}

// ── Search ──────────────────────────────────────────────────────────────────

const APP_FOR_TYPE = { note: 'notegeek', task: 'bujogeek', book: 'bookgeek', bird: 'flockgeek' };

// Newest first; results with no updatedAt sink to the bottom.
function byUpdatedAtDesc(a, b) {
  if (!a.updatedAt && !b.updatedAt) return 0;
  if (!a.updatedAt) return 1;
  if (!b.updatedAt) return -1;
  return new Date(b.updatedAt) - new Date(a.updatedAt);
}

/**
 * One pass of the suite-wide search for a single term.
 *
 * This is glanceSearch's original body with optional narrowing bolted on:
 * called with no filters it returns exactly what glanceSearch has always
 * returned. glanceAsk calls it once per keyword in the model's plan.
 *
 * Locked and encrypted note bodies are never matched or returned — the
 * `content` clause carries `isLocked: false, isEncrypted: false`, and
 * `noteSnippet` blanks the snippet for such notes matched by title.
 */
export async function searchThings(userId, term, options = {}) {
  const {
    apps = [],
    types = [],
    since = null,
    shelf = null,
    tags = [],
    limit = 12,
  } = options;

  const userOid = toObjectId(userId);
  const cap = Math.max(1, limit);
  const regex = new RegExp(escapeRegex(term), 'i');
  const results = [];

  const appList = Array.isArray(apps) ? apps : [];
  const typeList = Array.isArray(types) ? types : [];
  const tagList = (Array.isArray(tags) ? tags : []).filter(Boolean);

  const sinceDate = since ? new Date(since) : null;
  const validSince = sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : null;

  // A collection is searched unless the plan narrows to some other app or type.
  const wants = (type) => {
    if (typeList.length && !typeList.includes(type)) return false;
    if (appList.length && !appList.includes(APP_FOR_TYPE[type])) return false;
    return true;
  };

  const sinceClause = validSince ? { updatedAt: { $gte: validSince } } : {};
  const tagClause = tagList.length ? { tags: { $in: tagList } } : {};

  // ── Notes ──
  try {
    if (userOid && wants('note')) {
      const notes = await Note.find({
        userId: userOid,
        ...sinceClause,
        ...tagClause,
        $or: [
          { title: regex },
          { content: regex, isLocked: false, isEncrypted: false },
        ],
      })
        .sort({ updatedAt: -1 })
        .limit(cap)
        .lean();

      for (const n of notes) {
        results.push({
          id: n._id.toString(),
          app: 'notegeek',
          type: 'note',
          title: n.title || 'Untitled',
          snippet: noteSnippet(n),
          url: `https://notegeek.clintgeek.com/notes/${n._id}`,
          updatedAt: n.updatedAt,
        });
      }
    }
  } catch (err) {
    logger.warn({ err }, 'glanceSearch: note search failed');
  }

  // ── Tasks ──
  try {
    if (userOid && wants('task')) {
      const tasks = await Task.find({
        createdBy: userOid,
        ...sinceClause,
        ...tagClause,
        $or: [{ content: regex }, { note: regex }],
      })
        .sort({ updatedAt: -1 })
        .limit(cap)
        .lean();

      for (const t of tasks) {
        results.push({
          id: t._id.toString(),
          app: 'bujogeek',
          type: 'task',
          title: t.content || 'Untitled task',
          snippet: t.content ? t.content.substring(0, 120) : null,
          url: 'https://bujogeek.clintgeek.com/',
          updatedAt: t.updatedAt,
        });
      }
    }
  } catch (err) {
    logger.warn({ err }, 'glanceSearch: task search failed');
  }

  // ── Books ──
  try {
    if (wants('book')) {
      const books = await Book.find({
        ...sinceClause,
        ...(shelf ? { shelf } : {}),
        $or: [{ title: regex }, { authors: regex }],
      })
        .sort({ updatedAt: -1 })
        .limit(cap)
        .lean();

      for (const b of books) {
        results.push({
          id: b._id.toString(),
          app: 'bookgeek',
          type: 'book',
          title: b.title || 'Untitled',
          snippet: b.authors?.join(', ') || null,
          url: `https://bookgeek.clintgeek.com/books/${b._id}`,
          updatedAt: b.updatedAt,
        });
      }
    }
  } catch (err) {
    logger.warn({ err }, 'glanceSearch: book search failed');
  }

  // ── Birds ──
  try {
    if (wants('bird')) {
      const birds = await Bird.find({
        ownerId: userId,
        deletedAt: null,
        ...sinceClause,
        $or: [{ name: regex }, { tagId: regex }],
      })
        .sort({ updatedAt: -1 })
        .limit(cap)
        .lean();

      for (const b of birds) {
        results.push({
          id: b._id.toString(),
          app: 'flockgeek',
          type: 'bird',
          title: b.name || b.tagId || 'Unknown bird',
          snippet: [b.species, b.breed, b.status].filter(Boolean).join(' - '),
          url: `https://flockgeek.clintgeek.com/birds/${b._id}`,
          updatedAt: b.updatedAt,
        });
      }
    }
  } catch (err) {
    logger.warn({ err }, 'glanceSearch: bird search failed');
  }

  results.sort(byUpdatedAtDesc);

  return results.slice(0, cap);
}

// ── Resolvers ───────────────────────────────────────────────────────────────

export const resolvers = {
  Query: {
    glanceToday: (_, { date }, context) => fetchGlanceToday(context, date),

    glanceSearch: async (_, { query, limit = 12 }, context) => {
      const userId = getUserId(context);
      return searchThings(userId, query, { limit });
    },

    /**
     * StartGeek Ask. Plans the query with aiGeek, runs the plan through the
     * same search everyone else uses, and — for question-shaped queries —
     * asks for a one-line answer grounded in the day's snapshot.
     *
     * Every AI step is optional: a failed plan degrades to the literal query,
     * a failed answer leaves `answer: null`. The result list is always real.
     */
    glanceAsk: async (_, { query, limit = 12 }, context) => {
      const userId = getUserId(context);
      const cap = Math.max(1, limit);
      const term = String(query ?? '').trim();

      const plan = await planQuery(term, context);
      const { intent } = plan;

      const searchOptions = {
        apps: intent.apps,
        types: intent.types,
        since: intent.since,
        shelf: intent.shelf,
        tags: intent.tags,
        limit: cap,
      };

      const keywords = intent.keywords.length ? intent.keywords : [term];
      const seen = new Set();
      const merged = [];

      for (const keyword of keywords) {
        let hits = [];
        try {
          hits = await searchThings(userId, keyword, searchOptions);
        } catch (err) {
          logger.warn({ err, keyword }, 'glanceAsk: keyword search failed');
        }
        for (const hit of hits) {
          if (seen.has(hit.id)) continue;
          seen.add(hit.id);
          merged.push(hit);
        }
      }

      merged.sort(byUpdatedAtDesc);
      const results = merged.slice(0, cap);

      let answer = null;
      let citations = [];
      let provider = plan.provider || null;
      let model = plan.model || null;

      if (intent.kind === 'answer') {
        let glanceToday = null;
        try {
          glanceToday = await fetchGlanceToday(context);
        } catch (err) {
          logger.warn({ err }, 'glanceAsk: glanceToday snapshot failed');
        }

        const grounded = await answerFrom(term, context, { glanceToday, results });
        answer = grounded.answer;
        citations = grounded.citations;
        provider = grounded.provider || provider;
        model = grounded.model || model;
      }

      return { intent, answer, citations, results, provider, model };
    },

    /**
     * Draft a capture the deterministic parser could not read.
     *
     * Read-only by construction: it shapes the variables `createTask` /
     * `createNote` take and hands them back. Nothing is written here — the
     * client previews the draft and the person runs the mutation themselves.
     */
    glanceDraft: async (_, { input, kind }, context) => {
      getUserId(context);
      return draftFrom(input, kind, context);
    },

    calendarEvents: async (_, { sources, from, to }, context) => {
      getUserId(context);

      const now = new Date();
      const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const toDate = to ? new Date(to) : new Date(fromDate.getTime() + 14 * 24 * 60 * 60 * 1000);

      const allEvents = [];

      for (const source of sources) {
        if (!source?.url) continue;
        try {
          const events = await fetchIcsEvents(source.url);
          for (const event of events) {
            const instances = ical.expandRecurringEvent(event, {
              from: fromDate,
              to: toDate,
              expandOngoing: true,
            });
            for (const inst of instances) {
              allEvents.push({
                id: `${source.url}-${icalText(event.uid)}-${inst.start.toISOString()}`,
                summary: icalText(inst.summary) || icalText(event.summary) || 'Untitled',
                start: inst.start,
                end: inst.end,
                isFullDay: !!inst.isFullDay,
                color: source.color || null,
                calendarUrl: source.url,
              });
            }
          }
        } catch (err) {
          logger.warn({ err, url: source.url }, 'calendarEvents: failed to fetch or parse ICS');
        }
      }

      allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
      return allEvents.slice(0, 100);
    },
  },
};
