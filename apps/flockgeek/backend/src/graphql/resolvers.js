import Bird from '../models/Bird.js';
import EggProduction from '../models/EggProduction.js';

export const resolvers = {
    Query: {
        birds: async (_, __, context) => {
            const ownerId = context.user?.id || '000000000000000000000000';
            return await Bird.find({ ownerId }).sort({ name: 1, tagId: 1 });
        },
        bird: async (_, { id }, context) => {
            const ownerId = context.user?.id || '000000000000000000000000';
            return await Bird.findOne({ _id: id, ownerId });
        },
        eggProductions: async (_, { startDate, endDate }, context) => {
            const ownerId = context.user?.id || '000000000000000000000000';
            const filter = { ownerId };
            if (startDate || endDate) {
                filter.date = {};
                if (startDate) filter.date.$gte = new Date(startDate);
                if (endDate) filter.date.$lte = new Date(endDate);
            }
            return await EggProduction.find(filter).sort({ date: -1 });
        },
    },
    Mutation: {
        createBird: async (_, args, context) => {
            const ownerId = context.user?.id || '000000000000000000000000';
            const bird = new Bird({ ...args, ownerId });
            return await bird.save();
        },
        recordEggProduction: async (_, args, context) => {
            const ownerId = context.user?.id || '000000000000000000000000';

            let dateToUse = new Date();
            if (args.date) {
                dateToUse = new Date(args.date);
            }

            const record = new EggProduction({
                ...args,
                ownerId,
                date: dateToUse
            });
            return await record.save();
        },
    },
    Bird: {
        id: (bird) => bird._id.toString(),
    },
    EggProduction: {
        id: (egg) => egg._id.toString(),
    }
};
