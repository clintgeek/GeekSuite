import { getAppConnection } from '../shared/appConnections.js';
import mongoose from 'mongoose';

// ── Model Accessors ──
// Each uses strict:false to read from app DBs without defining full schemas.
// Collection names match what mongoose auto-pluralizes from the model names
// used by each app's own resolvers.

function getBujoModels() {
  const conn = getAppConnection('bujogeek');
  if (!conn.models.DashTask) {
    const s = conn.base;
    conn.model('DashTask', new s.Schema({}, { strict: false, collection: 'tasks' }));
    conn.model('DashJournalEntry', new s.Schema({}, { strict: false, collection: 'journalentries' }));
  }
  return { Task: conn.models.DashTask, JournalEntry: conn.models.DashJournalEntry };
}

function getNoteModels() {
  const conn = getAppConnection('notegeek');
  if (!conn.models.DashNote) {
    const s = conn.base;
    conn.model('DashNote', new s.Schema({}, { strict: false, collection: 'notes' }));
  }
  return { Note: conn.models.DashNote };
}

function getBookModels() {
  const conn = getAppConnection('bookgeek');
  if (!conn.models.DashBook) {
    const s = conn.base;
    conn.model('DashBook', new s.Schema({}, { strict: false, collection: 'books' }));
  }
  return { Book: conn.models.DashBook };
}

function getFitnessModels() {
  const conn = getAppConnection('fitnessgeek');
  if (!conn.models.DashFoodLog) {
    const s = conn.base;
    conn.model('DashFoodLog', new s.Schema({}, { strict: false, collection: 'food_logs' }));
    conn.model('DashWeight', new s.Schema({}, { strict: false, collection: 'weights' }));
    conn.model('DashUserSettings', new s.Schema({}, { strict: false, collection: 'usersettings' }));
  }
  return {
    FoodLog: conn.models.DashFoodLog,
    Weight: conn.models.DashWeight,
    UserSettings: conn.models.DashUserSettings,
  };
}

function getFlockModels() {
  const conn = getAppConnection('flockgeek');
  if (!conn.models.DashBird) {
    const s = conn.base;
    conn.model('DashBird', new s.Schema({}, { strict: false, collection: 'birds' }));
    conn.model('DashEggProduction', new s.Schema({}, { strict: false, collection: 'eggproductions' }));
    conn.model('DashPairing', new s.Schema({}, { strict: false, collection: 'pairings' }));
    conn.model('DashHatchEvent', new s.Schema({}, { strict: false, collection: 'hatchevents' }));
  }
  return {
    Bird: conn.models.DashBird,
    EggProduction: conn.models.DashEggProduction,
    Pairing: conn.models.DashPairing,
    HatchEvent: conn.models.DashHatchEvent,
  };
}

// ── Helpers ──

function startOfDay(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function getUserId(context) {
  if (!context.user) throw new Error('Unauthorized');
  return context.user.id || context.user._id;
}

// ── Resolvers ──

export const resolvers = {
  Query: {

    // ── Bujo Widget ──
    dashBujoSummary: async (_, { date }, context) => {
      const userId = getUserId(context);
      const { Task, JournalEntry } = getBujoModels();
      const targetDate = date || new Date().toISOString().split('T')[0];
      const dayStart = startOfDay(targetDate);
      const dayEnd = endOfDay(targetDate);

      // BujoGeek uses createdBy (ObjectId) for user filtering
      const userOid = new mongoose.Types.ObjectId(userId);

      const [tasks, entries] = await Promise.all([
        Task.find({
          createdBy: userOid,
          $or: [
            { dueDate: { $gte: dayStart, $lte: dayEnd } },
            { createdAt: { $gte: dayStart, $lte: dayEnd } },
          ]
        }).lean(),
        JournalEntry.find({
          createdBy: userOid,
          date: { $gte: dayStart, $lte: dayEnd }
        }).lean(),
      ]);

      const completed = tasks.filter(t =>
        t.status === 'done' || t.status === 'completed' || t.completed === true
      );

      return {
        date: targetDate,
        openTasks: tasks.length - completed.length,
        completedToday: completed.length,
        totalTasks: tasks.length,
        upcomingEvents: entries
          .filter(e => e.type === 'event')
          .slice(0, 5)
          .map(e => ({
            id: e._id.toString(),
            content: e.content || e.title || '',
            type: e.type,
            status: e.status,
            date: e.date?.toISOString?.() || null,
          })),
      };
    },

    // ── Notes Widget ──
    dashRecentNotes: async (_, { limit = 5 }, context) => {
      const userId = getUserId(context);
      const { Note } = getNoteModels();

      // NoteGeek uses userId (string)
      const notes = await Note.find({ userId })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean();

      return notes.map(n => ({
        id: n._id.toString(),
        title: n.title || 'Untitled',
        updatedAt: n.updatedAt,
        tags: n.tags || [],
        snippet: n.content ? n.content.substring(0, 120) : null,
      }));
    },

    // ── Books Widget ──
    dashBookProgress: async (_, __, context) => {
      getUserId(context); // auth check only — BookGeek has no user filtering
      const { Book } = getBookModels();

      // BookGeek uses shelf field: "reading" means currently reading
      const books = await Book.find({ shelf: 'reading' }).lean();

      return books.map(b => ({
        id: b._id.toString(),
        title: b.title || 'Untitled',
        authors: b.authors || [],
        status: b.shelf || 'reading',
        currentPage: b.currentPage || 0,
        totalPages: b.totalPages || 0,
        percentComplete: b.totalPages
          ? Math.round((( b.currentPage || 0) / b.totalPages) * 100)
          : 0,
        coverUrl: b.coverUrl || b.coverImage || b.thumbnail || null,
      }));
    },

    // ── Fitness Nutrition Widget ──
    dashNutritionSummary: async (_, { date }, context) => {
      const userId = getUserId(context);
      const { FoodLog, UserSettings } = getFitnessModels();
      const targetDate = date || new Date().toISOString().split('T')[0];
      const dayStart = startOfDay(targetDate);
      const dayEnd = endOfDay(targetDate);

      // FoodLog uses user_id (string)
      const logs = await FoodLog.find({
        user_id: userId,
        log_date: { $gte: dayStart, $lte: dayEnd },
      }).lean();

      let calories = 0, protein = 0, carbs = 0, fat = 0;
      for (const log of logs) {
        const n = log.calculatedNutrition || log.nutrition || {};
        const servings = log.servings || 1;
        calories += (n.calories_per_serving || n.calories || 0) * servings;
        protein += (n.protein_grams || n.protein || 0) * servings;
        carbs += (n.carbs_grams || n.carbs || 0) * servings;
        fat += (n.fat_grams || n.fat || 0) * servings;
      }

      let calorieGoal = null;
      try {
        const settings = await UserSettings.findOne({ user_id: userId }).lean();
        calorieGoal = settings?.nutrition_goal?.daily_calories || null;
      } catch { /* no settings */ }

      return {
        date: targetDate,
        calories: Math.round(calories),
        protein: Math.round(protein),
        carbs: Math.round(carbs),
        fat: Math.round(fat),
        calorieGoal,
        mealsLogged: logs.length,
      };
    },

    // ── Fitness Weight Widget ──
    dashWeightTrend: async (_, { days = 7 }, context) => {
      const userId = getUserId(context);
      const { Weight } = getFitnessModels();
      const since = new Date();
      since.setDate(since.getDate() - days);

      // Weight uses userId (string)
      const weights = await Weight.find({
        userId,
        log_date: { $gte: since },
      }).sort({ log_date: 1 }).lean();

      const entries = weights.map(w => ({
        date: w.log_date?.toISOString?.()?.split('T')[0] || '',
        weight: w.weight_value,
      }));

      let direction = 'stable';
      let changeFromFirst = 0;
      if (entries.length >= 2) {
        const first = entries[0].weight;
        const last = entries[entries.length - 1].weight;
        changeFromFirst = Math.round((last - first) * 10) / 10;
        if (changeFromFirst > 0.5) direction = 'up';
        else if (changeFromFirst < -0.5) direction = 'down';
      }

      return { entries, direction, changeFromFirst };
    },

    // ── Flock Widget ──
    dashFlockStatus: async (_, __, context) => {
      const userId = getUserId(context);
      const { Bird, EggProduction, Pairing, HatchEvent } = getFlockModels();

      // FlockGeek uses ownerId (string)
      const todayStart = startOfDay();
      const todayEnd = endOfDay();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [activeBirds, totalBirds, todayEggs, weekEggs, activePairings, activeHatches] =
        await Promise.all([
          Bird.countDocuments({ ownerId: userId, status: { $nin: ['deceased', 'culled', 'sold', 'rehomed'] } }),
          Bird.countDocuments({ ownerId: userId }),
          EggProduction.aggregate([
            { $match: { ownerId: userId, date: { $gte: todayStart, $lte: todayEnd } } },
            { $group: { _id: null, total: { $sum: '$eggsCount' } } },
          ]).then(r => r[0]?.total || 0),
          EggProduction.aggregate([
            { $match: { ownerId: userId, date: { $gte: weekAgo } } },
            { $group: { _id: null, total: { $sum: '$eggsCount' } } },
          ]).then(r => r[0]?.total || 0),
          Pairing.countDocuments({ ownerId: userId, active: true }),
          HatchEvent.countDocuments({ ownerId: userId, hatchDate: { $gte: new Date() } }),
        ]);

      return { activeBirds, totalBirds, todayEggs, weekEggs, activePairings, activeHatches };
    },

    // ── Universal Search (Phase 3) ──
    dashSearch: async (_, { query, apps, limit = 20 }, context) => {
      const userId = getUserId(context);
      const results = [];
      const searchApps = apps || ['notegeek', 'bujogeek', 'bookgeek', 'fitnessgeek', 'flockgeek'];
      const regex = new RegExp(query, 'i');

      if (searchApps.includes('notegeek')) {
        try {
          const { Note } = getNoteModels();
          const notes = await Note.find({
            userId,
            $or: [{ title: regex }, { content: regex }],
          }).limit(limit).lean();
          for (const n of notes) {
            const titleMatch = regex.test(n.title);
            results.push({
              id: n._id.toString(),
              app: 'notegeek',
              type: 'note',
              title: n.title || 'Untitled',
              snippet: n.content?.substring(0, 120) || null,
              url: `https://notegeek.clintgeek.com/notes/${n._id}`,
              updatedAt: n.updatedAt,
              score: titleMatch ? 90 : 50,
            });
          }
        } catch { /* app unavailable */ }
      }

      if (searchApps.includes('bujogeek')) {
        try {
          const { Task } = getBujoModels();
          const userOid = new mongoose.Types.ObjectId(userId);
          const tasks = await Task.find({
            createdBy: userOid,
            $or: [{ title: regex }, { description: regex }],
          }).limit(limit).lean();
          for (const t of tasks) {
            results.push({
              id: t._id.toString(),
              app: 'bujogeek',
              type: 'task',
              title: t.title || t.description || 'Untitled task',
              snippet: t.description?.substring(0, 120) || null,
              url: `https://bujogeek.clintgeek.com/`,
              updatedAt: t.updatedAt,
              score: regex.test(t.title) ? 85 : 45,
            });
          }
        } catch { /* app unavailable */ }
      }

      if (searchApps.includes('bookgeek')) {
        try {
          const { Book } = getBookModels();
          const books = await Book.find({
            $or: [{ title: regex }, { authors: regex }],
          }).limit(limit).lean();
          for (const b of books) {
            results.push({
              id: b._id.toString(),
              app: 'bookgeek',
              type: 'book',
              title: b.title || 'Untitled',
              snippet: b.authors?.join(', ') || null,
              url: `https://bookgeek.clintgeek.com/books/${b._id}`,
              updatedAt: b.updatedAt,
              score: regex.test(b.title) ? 90 : 50,
            });
          }
        } catch { /* app unavailable */ }
      }

      if (searchApps.includes('flockgeek')) {
        try {
          const { Bird } = getFlockModels();
          const birds = await Bird.find({
            ownerId: userId,
            $or: [{ name: regex }, { tagId: regex }],
          }).limit(limit).lean();
          for (const b of birds) {
            results.push({
              id: b._id.toString(),
              app: 'flockgeek',
              type: 'bird',
              title: b.name || b.tagId || 'Unknown bird',
              snippet: [b.species, b.breed, b.status].filter(Boolean).join(' - '),
              url: `https://flockgeek.clintgeek.com/birds/${b._id}`,
              updatedAt: b.updatedAt,
              score: regex.test(b.name) ? 85 : 50,
            });
          }
        } catch { /* app unavailable */ }
      }

      results.sort((a, b) => (b.score || 0) - (a.score || 0));
      return results.slice(0, limit);
    },

    // ── Weekly Digest (Phase 5 — stub) ──
    dashWeeklyDigest: async (_, { weekStart }, context) => {
      getUserId(context);
      return {
        weekStart: weekStart || '',
        weekEnd: '',
        bujo: null,
        books: null,
        fitness: null,
        flock: null,
        notes: null,
        aiSummary: null,
      };
    },
  },
};
