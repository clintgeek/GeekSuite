import { format } from 'date-fns';
import { GraphQLError } from 'graphql';
import JournalEntry from './models/JournalEntry.js';
import taskService from './services/taskService.js';
import collectionService from './services/collectionService.js';
import habitService from './services/habitService.js';
import reminderService from './services/reminderService.js';

/**
 * The service layer throws transport-agnostic errors tagged with a `code`;
 * a caller-error (a transition the task's state does not allow) becomes a
 * 400-style GraphQLError so the client's `handleApiError` can tell it apart
 * from a server fault. Anything else propagates untouched.
 */
function rethrowUserError(err) {
  if (err?.code === 'BAD_USER_INPUT') {
    throw new GraphQLError(err.message, {
      extensions: { code: 'BAD_USER_INPUT', http: { status: err.status ?? 400 } },
    });
  }
  throw err;
}

export const resolvers = {
  Query: {
    tasks: async (_, { status, tags }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      const filter = { createdBy: userId };
      if (status) filter.status = status;
      if (tags && tags.length > 0) filter.tags = { $in: tags };
      const { default: Task } = await import('./models/Task.js');
      return Task.find(filter).sort({ originalDate: -1 });
    },
    task: async (_, { id }, context) => {
      const userId = context.user?.id;
      if (!userId) return null;
      return taskService.getTaskById(id, userId);
    },
    dailyTasks: async (_, { date }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      const dateStr = date || format(new Date(), 'yyyy-MM-dd');
      return taskService.getTasksForDateRange({ userId, startDate: dateStr, endDate: dateStr, viewType: 'daily' });
    },
    weeklyTasks: async (_, { date }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      const dateStr = date || format(new Date(), 'yyyy-MM-dd');
      return taskService.getTasksForDateRange({ userId, startDate: dateStr, endDate: dateStr, viewType: 'weekly' });
    },
    monthlyTasks: async (_, { startDate, endDate }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      const sDate = startDate || format(new Date(), 'yyyy-MM-dd');
      const eDate = endDate || format(new Date(), 'yyyy-MM-dd');
      return taskService.getTasksForDateRange({ userId, startDate: sDate, endDate: eDate, viewType: 'monthly' });
    },
    allTasks: async (_, __, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      return taskService.getTasksForDateRange({ userId, startDate: new Date(), endDate: new Date(), viewType: 'all' });
    },
    blockedTasks: async (_, __, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      return taskService.getBlockedTasks(userId);
    },
    taskTags: async (_, __, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      return taskService.getTagsForUser(userId);
    },
    tasksByTag: async (_, { tag }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      return taskService.getTasksByTags(userId, [tag]);
    },
    collections: async (_, __, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      return collectionService.listCollections(userId);
    },
    collection: async (_, { id }, context) => {
      const userId = context.user?.id;
      if (!userId) return null;
      return collectionService.findOwnedCollection(id, userId);
    },
    habits: async (_, { includeArchived = false }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      return habitService.listHabits(userId, includeArchived);
    },
    habitLogs: async (_, { startDate, endDate }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      return habitService.getLogs({ userId, startDate, endDate });
    },
    journalEntries: async (_, { type, tags }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      const filter = { createdBy: userId };
      if (type) filter.type = type;
      if (tags && tags.length > 0) filter.tags = { $in: tags };
      return JournalEntry.find(filter).sort({ date: -1 });
    },
    journalEntry: async (_, { id }, context) => {
      const userId = context.user?.id;
      if (!userId) return null;
      return JournalEntry.findOne({ _id: id, createdBy: userId });
    },
    templates: async (_, { type, isDefault }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      const filter = { createdBy: userId };
      if (type) filter.type = type;
      if (isDefault !== undefined) filter.isDefault = isDefault;
      const { default: Template } = await import('./models/Template.js');
      return Template.find(filter).sort({ name: 1 });
    },
    template: async (_, { id }, context) => {
      const userId = context.user?.id;
      if (!userId) return null;
      const { default: Template } = await import('./models/Template.js');
      return Template.findOne({ _id: id, createdBy: userId });
    },

    // Auth-gated even though the key is public: an unauthenticated caller has
    // nothing to subscribe with, and the client reads null as "reminders off".
    pushVapidKey: (_, __, context) => {
      const userId = context.user?.id;
      if (!userId) return null;
      return reminderService.vapidPublicKey();
    },
    pushSubscriptions: async (_, __, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      return reminderService.listSubscriptions(userId);
    },
  },

  Mutation: {
    createTask: async (_, args, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const taskData = { ...args, createdBy: userId };
      if (args.createdAt) taskData.createdAt = new Date(args.createdAt);
      if (args.dueDate) taskData.dueDate = new Date(args.dueDate);
      if (args.updatedAt) taskData.updatedAt = new Date(args.updatedAt);
      return taskService.createTask(taskData);
    },
    updateTask: async (_, { id, input, editScope }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      // Sanitize: only pass fields that exist on the Task schema.
      // taskType is a virtual, createdAt/updatedAt/createdBy are managed server-side.
      const { taskType, createdAt, updatedAt, createdBy, __typename, ...safeInput } = input || {};
      const task = await taskService.updateTask(id, safeInput, editScope, userId);
      if (!task) throw new Error('Task not found');
      return task;
    },

    // Add preference sync mutation if needed, or stick to the central /api/users/preferences
    updateBujoPreferences: async (_, { theme }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      
      const { User } = await import('../../models/user.js');
      const user = await User.findByIdAndUpdate(userId, { $set: { 'preferences.theme': theme } }, { new: true });
      return user.preferences;
    },
    deleteTask: async (_, { id, editScope }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const result = await taskService.deleteTask(id, editScope, userId);
      if (!result) throw new Error('Task not found');
      return { success: true, message: 'Task deleted successfully' };
    },
    updateTaskStatus: async (_, { id, status }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const task = await taskService.updateTaskStatus(id, status, userId);
      if (!task) throw new Error('Task not found');
      return task;
    },
    blockTask: async (_, { id, reason }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      let task;
      try {
        task = await taskService.blockTask(id, reason, userId);
      } catch (err) {
        rethrowUserError(err);
      }
      if (!task) throw new Error('Task not found');
      return task;
    },
    unblockTask: async (_, { id }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      let task;
      try {
        task = await taskService.unblockTask(id, userId);
      } catch (err) {
        rethrowUserError(err);
      }
      if (!task) throw new Error('Task not found');
      return task;
    },
    addSubtask: async (_, args, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const parentTask = await taskService.getTaskById(args.parentId, userId);
      if (!parentTask) throw new Error('Parent task not found');
      const subtaskData = { ...args, parentTask: parentTask._id, createdBy: userId };
      if (args.dueDate) subtaskData.dueDate = new Date(args.dueDate);
      return taskService.createTask(subtaskData);
    },
    migrateTaskToFuture: async (_, { id, futureDate }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      // Migrating always moves a single occurrence, never a whole series.
      const task = await taskService.updateTask(
        id,
        { dueDate: new Date(futureDate), updatedAt: new Date() },
        'THIS_INSTANCE',
        userId
      );
      if (!task) throw new Error('Task not found');
      return task;
    },
    saveDailyTaskOrder: async (_, { dateKey, orderedTaskIds }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const doc = await taskService.saveDailyOrder({ userId, dateKey, orderedTaskIds });
      return { success: true, updatedAt: doc.updatedAt.toISOString() };
    },
    createCollection: async (_, { name, description }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      return collectionService.createCollection({ name, description, createdBy: userId });
    },
    updateCollection: async (_, { id, ...updates }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const collection = await collectionService.updateCollection(id, updates, userId);
      if (!collection) throw new Error('Collection not found');
      return collection;
    },
    deleteCollection: async (_, { id, deleteTasks = false }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const collection = await collectionService.deleteCollection(id, deleteTasks, userId);
      if (!collection) throw new Error('Collection not found');
      return {
        success: true,
        message: deleteTasks
          ? 'Collection and its entries deleted'
          : 'Collection deleted; its entries were kept',
      };
    },
    createHabit: async (_, { name, daysOfWeek, color }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      return habitService.createHabit({ name, daysOfWeek, color, createdBy: userId });
    },
    updateHabit: async (_, { id, ...updates }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const habit = await habitService.updateHabit(id, updates, userId);
      if (!habit) throw new Error('Habit not found');
      return habit;
    },
    deleteHabit: async (_, { id }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const habit = await habitService.deleteHabit(id, userId);
      if (!habit) throw new Error('Habit not found');
      return { success: true, message: 'Habit deleted with its history' };
    },
    toggleHabitLog: async (_, { habitId, date }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const result = await habitService.toggleHabitLog(habitId, date, userId);
      if (!result) throw new Error('Habit not found');
      return result;
    },
    createJournalEntry: async (_, args, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const entry = new JournalEntry({ ...args, createdBy: userId, date: args.date ? new Date(args.date) : new Date() });
      return entry.save();
    },
    updateJournalEntry: async (_, args, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { id, ...updateFields } = args;
      const entry = await JournalEntry.findOneAndUpdate({ _id: id, createdBy: userId }, updateFields, { new: true, runValidators: true });
      if (!entry) throw new Error('Entry not found');
      return entry;
    },
    deleteJournalEntry: async (_, { id }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const entry = await JournalEntry.findOneAndDelete({ _id: id, createdBy: userId });
      if (!entry) throw new Error('Entry not found');
      return { success: true, message: 'Entry deleted successfully' };
    },
    createJournalFromTemplate: async (_, { templateId, date }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { default: Template } = await import('./models/Template.js');
      const template = await Template.findOne({ _id: templateId, createdBy: userId });
      if (!template) throw new Error('Template not found');
      const entry = new JournalEntry({
        title: template.name,
        content: template.content,
        type: template.type,
        date: date ? new Date(date) : new Date(),
        tags: template.tags,
        templateId: template._id,
        createdBy: userId,
      });
      await entry.save();
      template.lastUsed = new Date();
      await template.save();
      return entry;
    },
    createTemplate: async (_, args, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { default: Template } = await import('./models/Template.js');
      const template = new Template({ ...args, createdBy: userId });
      return template.save();
    },
    updateTemplate: async (_, { id, ...updateFields }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { default: Template } = await import('./models/Template.js');
      const template = await Template.findOneAndUpdate({ _id: id, createdBy: userId }, updateFields, { new: true, runValidators: true });
      if (!template) throw new Error('Template not found');
      return template;
    },
    deleteTemplate: async (_, { id }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const { default: Template } = await import('./models/Template.js');
      const template = await Template.findOneAndDelete({ _id: id, createdBy: userId });
      if (!template) throw new Error('Template not found');
      return { success: true, message: 'Template deleted successfully' };
    },

    savePushSubscription: async (_, { input }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      return reminderService.saveSubscription(input, userId);
    },
    removePushSubscription: async (_, { endpoint }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const removed = await reminderService.removeSubscription(endpoint, userId);
      return {
        success: removed,
        message: removed ? 'Push subscription removed' : 'No such push subscription',
      };
    },
  },

  Task: {
    id: (task) => task._id ? task._id.toString() : task.id?.toString(),
    collectionId: (task) => (task.collectionId ? task.collectionId.toString() : null),
  },
  Collection: {
    id: (collection) => collection._id ? collection._id.toString() : collection.id?.toString(),
    // Counts and entries are resolved lazily so the list view never pays for
    // the tasks it doesn't render.
    tasks: async (collection, _, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      return collectionService.getTasksForCollection(collection._id ?? collection.id, userId);
    },
    taskCount: async (collection, _, context) => {
      const userId = context.user?.id;
      if (!userId) return 0;
      const { total } = await collectionService.getCounts(collection._id ?? collection.id, userId);
      return total;
    },
    completedCount: async (collection, _, context) => {
      const userId = context.user?.id;
      if (!userId) return 0;
      const { completed } = await collectionService.getCounts(collection._id ?? collection.id, userId);
      return completed;
    },
  },
  Habit: {
    id: (habit) => (habit._id ? habit._id.toString() : habit.id?.toString()),
    daysOfWeek: (habit) => habit.daysOfWeek ?? [],
    archived: (habit) => Boolean(habit.archived),
    // Resolved lazily and per-habit: the grid asks for it, a bare create does not.
    currentStreak: async (habit, _, context) => {
      const userId = context.user?.id;
      if (!userId) return 0;
      return habitService.getCurrentStreak(habit, userId);
    },
  },
  HabitLog: {
    id: (log) => (log._id ? log._id.toString() : log.id?.toString()),
    habitId: (log) => (log.habitId ? log.habitId.toString() : null),
  },
  JournalEntry: { id: (entry) => entry._id ? entry._id.toString() : entry.id?.toString() },
  Template: { id: (template) => template._id ? template._id.toString() : template.id?.toString() },
  PushSubscription: { id: (sub) => (sub._id ? sub._id.toString() : sub.id?.toString()) },
};
