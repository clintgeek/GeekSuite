import Task from '../models/Task.js';
import JournalEntry from '../models/JournalEntry.js';

export const resolvers = {
    Query: {
        tasks: async (_, { status, tags }, context) => {
            const createdBy = context.user?.id || '000000000000000000000000';
            const filter = { createdBy };
            if (status) filter.status = status;
            if (tags && tags.length > 0) filter.tags = { $in: tags };
            return await Task.find(filter).sort({ originalDate: -1 });
        },
        journalEntries: async (_, { type, tags }, context) => {
            const createdBy = context.user?.id || '000000000000000000000000';
            const filter = { createdBy };
            if (type) filter.type = type;
            if (tags && tags.length > 0) filter.tags = { $in: tags };
            return await JournalEntry.find(filter).sort({ date: -1 });
        }
    },
    Mutation: {
        createTask: async (_, args, context) => {
            const createdBy = context.user?.id || '000000000000000000000000';
            const task = new Task({ ...args, createdBy });
            return await task.save();
        },
        createJournalEntry: async (_, args, context) => {
            const createdBy = context.user?.id || '000000000000000000000000';
            let dateField = new Date();
            if (args.date) {
                dateField = new Date(args.date);
            }
            const entry = new JournalEntry({ ...args, createdBy, date: dateField });
            return await entry.save();
        }
    },
    Task: {
        id: (task) => task._id.toString()
    },
    JournalEntry: {
        id: (entry) => entry._id.toString()
    }
};
