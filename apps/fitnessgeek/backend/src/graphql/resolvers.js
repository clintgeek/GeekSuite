const FoodItem = require('../models/FoodItem');
const FoodLog = require('../models/FoodLog');

const resolvers = {
    Query: {
        foodItems: async (_, { query }, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            return await FoodItem.search(query || '', userId, 50);
        },
        foodLogs: async (_, { date }, context) => {
            const userId = context.user?.id || '000000000000000000000000';
            return await FoodLog.getLogsForDate(userId, date);
        }
    },
    Mutation: {
        logFood: async (_, args, context) => {
            const userId = context.user?.id || '000000000000000000000000';

            const foodItem = await FoodItem.findById(args.food_item_id);
            if (!foodItem) throw new Error("Food item not found");

            const log = new FoodLog({
                ...args,
                user_id: userId,
                nutrition: foodItem.nutrition
            });
            return await log.save();
        }
    },
    FoodItem: {
        id: (item) => item._id.toString()
    },
    FoodLog: {
        id: (log) => log._id.toString(),
        food_item_id: async (log) => await FoodItem.findById(log.food_item_id)
    }
};

module.exports = { resolvers };
