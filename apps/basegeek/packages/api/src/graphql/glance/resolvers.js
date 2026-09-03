import mongoose from 'mongoose';
import { format } from 'date-fns';
import logger from '../../lib/logger.js';

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

// ── Resolvers ───────────────────────────────────────────────────────────────

export const resolvers = {
  Query: {
    glanceToday: async (_, { date }, context) => {
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
    },

    glanceSearch: async (_, { query, limit = 12 }, context) => {
      const userId = getUserId(context);
      const userOid = toObjectId(userId);
      const cap = Math.max(1, limit);
      const regex = new RegExp(escapeRegex(query), 'i');
      const results = [];

      // ── Notes ──
      try {
        if (userOid) {
          const notes = await Note.find({
            userId: userOid,
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
        if (userOid) {
          const tasks = await Task.find({
            createdBy: userOid,
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
        const books = await Book.find({
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
      } catch (err) {
        logger.warn({ err }, 'glanceSearch: book search failed');
      }

      // ── Birds ──
      try {
        const birds = await Bird.find({
          ownerId: userId,
          deletedAt: null,
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
      } catch (err) {
        logger.warn({ err }, 'glanceSearch: bird search failed');
      }

      results.sort((a, b) => {
        if (!a.updatedAt && !b.updatedAt) return 0;
        if (!a.updatedAt) return 1;
        if (!b.updatedAt) return -1;
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });

      return results.slice(0, cap);
    },
  },
};
