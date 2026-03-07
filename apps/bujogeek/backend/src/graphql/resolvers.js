import { format } from 'date-fns';
import Task from '../models/Task.js';
import JournalEntry from '../models/JournalEntry.js';
import Template from '../models/Template.js';
import taskService from '../services/taskService.js';

export const resolvers = {
    Query: {
        // Task Queries
        tasks: async (_, { status, tags }, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            const filter = { createdBy: userId };
            if (status) filter.status = status;
            if (tags && tags.length > 0) filter.tags = { $in: tags };
            return await Task.find(filter).sort({ originalDate: -1 });
        },
        task: async (_, { id }, context) => {
            return await taskService.getTaskById(id);
        },
        dailyTasks: async (_, { date }, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            const dateStr = date || format(new Date(), 'yyyy-MM-dd');
            return await taskService.getTasksForDateRange({
                userId,
                startDate: new Date(dateStr),
                endDate: new Date(dateStr),
                viewType: 'daily'
            });
        },
        weeklyTasks: async (_, { date }, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            const dateStr = date || format(new Date(), 'yyyy-MM-dd');
            return await taskService.getTasksForDateRange({
                userId,
                startDate: new Date(dateStr),
                endDate: new Date(dateStr),
                viewType: 'weekly'
            });
        },
        monthlyTasks: async (_, { startDate, endDate }, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            const sDate = startDate || format(new Date(), 'yyyy-MM-dd');
            const eDate = endDate || format(new Date(), 'yyyy-MM-dd');
            return await taskService.getTasksForDateRange({
                userId,
                startDate: new Date(sDate),
                endDate: new Date(eDate),
                viewType: 'monthly'
            });
        },
        allTasks: async (_, __, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            return await taskService.getTasksForDateRange({
                userId,
                startDate: new Date(),
                endDate: new Date(),
                viewType: 'all'
            });
        },
        taskTags: async (_, __, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            return await taskService.getTagsForUser(userId);
        },
        tasksByTag: async (_, { tag }, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            return await taskService.getTasksByTags(userId, [tag]);
        },

        // Journal Queries
        journalEntries: async (_, { type, tags }, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            const filter = { createdBy: userId };
            if (type) filter.type = type;
            if (tags && tags.length > 0) filter.tags = { $in: tags };
            return await JournalEntry.find(filter).sort({ date: -1 });
        },
        journalEntry: async (_, { id }, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            return await JournalEntry.findOne({ _id: id, createdBy: userId });
        }
    },
    Mutation: {
        // Task Mutations
        createTask: async (_, args, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            const taskData = { ...args, createdBy: userId };
            if (args.createdAt) taskData.createdAt = new Date(args.createdAt);
            if (args.dueDate) taskData.dueDate = new Date(args.dueDate);
            if (args.updatedAt) taskData.updatedAt = new Date(args.updatedAt);
            return await taskService.createTask(taskData);
        },
        updateTask: async (_, { id, input }, context) => {
            return await taskService.updateTask(id, input);
        },
        deleteTask: async (_, { id }, context) => {
            const result = await taskService.deleteTask(id);
            if (!result) throw new Error("Task not found");
            return { success: true, message: "Task deleted successfully" };
        },
        updateTaskStatus: async (_, { id, status }, context) => {
            const task = await taskService.updateTaskStatus(id, status);
            if (!task) throw new Error("Task not found");
            return task;
        },
        addSubtask: async (_, args, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            const parentTask = await taskService.getTaskById(args.parentId);
            if (!parentTask) throw new Error("Parent task not found");

            const subtaskData = { ...args, parentTask: parentTask._id, createdBy: userId };
            if (args.dueDate) subtaskData.dueDate = new Date(args.dueDate);
            return await taskService.createTask(subtaskData);
        },
        migrateTaskToFuture: async (_, { id, futureDate }, context) => {
            const task = await taskService.updateTask(id, {
                dueDate: new Date(futureDate),
                updatedAt: new Date()
            });
            if (!task) throw new Error("Task not found");
            return task;
        },
        saveDailyTaskOrder: async (_, { dateKey, orderedTaskIds }, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            const doc = await taskService.saveDailyOrder({ userId, dateKey, orderedTaskIds });
            return { success: true, updatedAt: doc.updatedAt.toISOString() };
        },

        // Journal Mutations
        createJournalEntry: async (_, args, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            let dateField = args.date ? new Date(args.date) : new Date();
            const entry = new JournalEntry({ ...args, createdBy: userId, date: dateField });
            return await entry.save();
        },
        updateJournalEntry: async (_, args, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            const { id, ...updateFields } = args;
            const entry = await JournalEntry.findOneAndUpdate(
                { _id: id, createdBy: userId },
                updateFields,
                { new: true, runValidators: true }
            );
            if (!entry) throw new Error("Entry not found");
            return entry;
        },
        deleteJournalEntry: async (_, { id }, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            const entry = await JournalEntry.findOneAndDelete({ _id: id, createdBy: userId });
            if (!entry) throw new Error("Entry not found");
            return { success: true, message: "Entry deleted successfully" };
        },
        createJournalFromTemplate: async (_, { templateId, date }, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            const template = await Template.findById(templateId);
            if (!template) throw new Error("Template not found");

            const entry = new JournalEntry({
                title: template.name,
                content: template.content,
                type: template.type,
                date: date ? new Date(date) : new Date(),
                tags: template.tags,
                templateId: template._id,
                createdBy: userId
            });

            await entry.save();
            template.lastUsed = new Date();
            await template.save();

            return entry;
        }
    },
    Task: {
        id: (task) => task._id ? task._id.toString() : task.id?.toString(),
    },
    JournalEntry: {
        id: (entry) => entry._id ? entry._id.toString() : entry.id?.toString(),
    }
};
