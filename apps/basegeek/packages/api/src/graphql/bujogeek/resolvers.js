import { format } from 'date-fns';
import JournalEntry from './models/JournalEntry.js';
import taskService from './services/taskService.js';

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
    task: async (_, { id }) => taskService.getTaskById(id),
    dailyTasks: async (_, { date }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      const dateStr = date || format(new Date(), 'yyyy-MM-dd');
      return taskService.getTasksForDateRange({ userId, startDate: new Date(dateStr), endDate: new Date(dateStr), viewType: 'daily' });
    },
    weeklyTasks: async (_, { date }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      const dateStr = date || format(new Date(), 'yyyy-MM-dd');
      return taskService.getTasksForDateRange({ userId, startDate: new Date(dateStr), endDate: new Date(dateStr), viewType: 'weekly' });
    },
    monthlyTasks: async (_, { startDate, endDate }, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      const sDate = startDate || format(new Date(), 'yyyy-MM-dd');
      const eDate = endDate || format(new Date(), 'yyyy-MM-dd');
      return taskService.getTasksForDateRange({ userId, startDate: new Date(sDate), endDate: new Date(eDate), viewType: 'monthly' });
    },
    allTasks: async (_, __, context) => {
      const userId = context.user?.id;
      if (!userId) return [];
      return taskService.getTasksForDateRange({ userId, startDate: new Date(), endDate: new Date(), viewType: 'all' });
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
    updateTask: async (_, { id, input }) => {
      // Sanitize: only pass fields that exist on the Task schema.
      // taskType is a virtual, createdAt/updatedAt are managed server-side.
      const { taskType, createdAt, updatedAt, __typename, ...safeInput } = input || {};
      return taskService.updateTask(id, safeInput);
    },

    // Add preference sync mutation if needed, or stick to the central /api/users/preferences
    updateBujoPreferences: async (_, { theme }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      
      const { User } = await import('../../models/user.js');
      const user = await User.findByIdAndUpdate(userId, { $set: { 'preferences.theme': theme } }, { new: true });
      return user.preferences;
    },
    deleteTask: async (_, { id }) => {
      const result = await taskService.deleteTask(id);
      if (!result) throw new Error('Task not found');
      return { success: true, message: 'Task deleted successfully' };
    },
    updateTaskStatus: async (_, { id, status }) => {
      const task = await taskService.updateTaskStatus(id, status);
      if (!task) throw new Error('Task not found');
      return task;
    },
    addSubtask: async (_, args, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const parentTask = await taskService.getTaskById(args.parentId);
      if (!parentTask) throw new Error('Parent task not found');
      const subtaskData = { ...args, parentTask: parentTask._id, createdBy: userId };
      if (args.dueDate) subtaskData.dueDate = new Date(args.dueDate);
      return taskService.createTask(subtaskData);
    },
    migrateTaskToFuture: async (_, { id, futureDate }) => {
      const task = await taskService.updateTask(id, { dueDate: new Date(futureDate), updatedAt: new Date() });
      if (!task) throw new Error('Task not found');
      return task;
    },
    saveDailyTaskOrder: async (_, { dateKey, orderedTaskIds }, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Unauthorized');
      const doc = await taskService.saveDailyOrder({ userId, dateKey, orderedTaskIds });
      return { success: true, updatedAt: doc.updatedAt.toISOString() };
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
      const template = await Template.findById(templateId);
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
  },

  Task: { id: (task) => task._id ? task._id.toString() : task.id?.toString() },
  JournalEntry: { id: (entry) => entry._id ? entry._id.toString() : entry.id?.toString() },
  Template: { id: (template) => template._id ? template._id.toString() : template.id?.toString() },
};
