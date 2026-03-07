const { GraphQLScalarType, Kind } = require('graphql');
const UserSettings = require('../models/UserSettings');
const Weight = require('../models/Weight');
const NutritionGoals = require('../models/NutritionGoals');
const FoodItem = require('../models/FoodItem');
const FoodLog = require('../models/FoodLog');
const Meal = require('../models/Meal');
const Medication = require('../models/Medication');
const BloodPressure = require('../models/BloodPressure');
const logger = require('../config/logger');

const resolvers = {
    Date: new GraphQLScalarType({
        name: 'Date',
        description: 'Date custom scalar type',
        parseValue(value) {
            return new Date(value); // Convert incoming integer/string to Date
        },
        serialize(value) {
            if (value instanceof Date) {
                return value.toISOString();
            }
            return new Date(value).toISOString(); // Convert outgoing Date to string
        },
        parseLiteral(ast) {
            if (ast.kind === Kind.INT) {
                return new Date(parseInt(ast.value, 10)); // Convert hard-coded AST string to integer and then to Date
            } else if (ast.kind === Kind.STRING) {
                return new Date(ast.value);
            }
            return null;
        },
    }),
    JSON: new GraphQLScalarType({
        name: 'JSON',
        description: 'JSON custom scalar type',
        parseValue(value) {
            return value;
        },
        serialize(value) {
            return value;
        },
        parseLiteral(ast) {
            return ast.value;
        }
    }),
    Query: {
        userSettings: async (_, args, { user }) => {
            if (!user) throw new Error('Unauthorized');
            return await UserSettings.getOrCreate(user.id);
        },
        weights: async (_, args, { user }) => {
            if (!user) throw new Error('Unauthorized');
            return await Weight.find({ userId: user.id }).sort({ log_date: -1 });
        },
        weight: async (_, { id }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            return await Weight.findOne({ _id: id, userId: user.id });
        },
        activeNutritionGoals: async (_, args, { user }) => {
            if (!user) throw new Error('Unauthorized');
            return await NutritionGoals.getActiveGoals(user.id);
        },
        nutritionGoalsHistory: async (_, args, { user }) => {
            if (!user) throw new Error('Unauthorized');
            return await NutritionGoals.find({ user_id: user.id }).sort({ start_date: -1 });
        },
        foodItems: async (_, { search }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            let query = {
                $or: [
                    { user_id: user.id },
                    { user_id: null }, // Global foods
                    { user_id: { $exists: false } }
                ],
                is_deleted: false
            };

            if (search) {
                query.name = new RegExp(search, 'i');
            }

            return await FoodItem.find(query).sort({ name: 1 }).limit(100);
        },
        foodItem: async (_, { id }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            return await FoodItem.findOne({ _id: id, is_deleted: false }); // Anyone can view active global items
        },
        foodLogs: async (_, { date, startDate, endDate, mealType }, { user }) => {
            if (!user) throw new Error('Unauthorized');

            if (date) {
                if (mealType) {
                    return await FoodLog.getLogsByMealType(user.id, mealType, date);
                }
                return await FoodLog.getLogsForDate(user.id, date);
            } else if (startDate && endDate) {
                return await FoodLog.getLogsForDateRange(user.id, startDate, endDate);
            } else {
                return await FoodLog.getRecentLogs(user.id, 50);
            }
        },
        foodLog: async (_, { id }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            return await FoodLog.findOne({ _id: id, user_id: user.id }).populate('food_item_id');
        },
        meals: async (_, { mealType }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            if (mealType) {
                return await Meal.getMealsByType(mealType);
            }
            return await Meal.getActiveMeals();
        },
        meal: async (_, { id }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            return await Meal.findOne({ _id: id, is_deleted: false }).populate('food_items.food_item_id');
        },
        medications: async (_, args, { user }) => {
            if (!user) throw new Error('Unauthorized');
            return await Medication.find({ user_id: user.id }).sort({ display_name: 1 });
        },
        medication: async (_, { id }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            return await Medication.findOne({ _id: id, user_id: user.id });
        },
        bloodPressures: async (_, args, { user }) => {
            if (!user) throw new Error('Unauthorized');
            return await BloodPressure.find({ userId: user.id }).sort({ log_date: -1 });
        },
        bloodPressure: async (_, { id }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            return await BloodPressure.findOne({ _id: id, userId: user.id });
        }
    },
    Mutation: {
        updateUserSettings: async (_, { input }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            return await UserSettings.updateSettings(user.id, input);
        },
        addWeight: async (_, { input }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            const weight = new Weight({ ...input, userId: user.id });
            return await weight.save();
        },
        updateWeight: async (_, { id, input }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            const weight = await Weight.findOneAndUpdate(
                { _id: id, userId: user.id },
                { ...input, updated_at: new Date() },
                { new: true }
            );
            if (!weight) throw new Error('Weight record not found');
            return weight;
        },
        deleteWeight: async (_, { id }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            const result = await Weight.deleteOne({ _id: id, userId: user.id });
            return result.deletedCount === 1;
        },
        setNutritionGoals: async (_, { input }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            // Create new active goal and deactivate old ones
            return await NutritionGoals.createGoals(user.id, input);
        },
        addFoodItem: async (_, { input }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            const food = new FoodItem({ ...input, user_id: user.id });
            return await food.save();
        },
        updateFoodItem: async (_, { id, input }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            const food = await FoodItem.findOneAndUpdate(
                { _id: id, user_id: user.id }, // Can only update own foods
                { ...input, updated_at: new Date() },
                { new: true }
            );
            if (!food) throw new Error('Food item not found or unauthorized');
            return food;
        },
        deleteFoodItem: async (_, { id }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            // Soft delete
            const result = await FoodItem.findOneAndUpdate(
                { _id: id, user_id: user.id },
                { is_deleted: true, updated_at: new Date() }
            );
            return !!result;
        },
        addFoodLog: async (_, { input }, { user }) => {
            if (!user) throw new Error('Unauthorized');

            // Get food item to copy its nutrition at time of logging
            const food = await FoodItem.findById(input.food_item_id);
            if (!food) throw new Error('Food item not found');

            const log = new FoodLog({
                ...input,
                user_id: user.id,
                nutrition: input.nutrition || food.nutrition
            });
            await log.save();
            return await log.populate('food_item_id');
        },
        updateFoodLog: async (_, { id, input }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            const log = await FoodLog.findOneAndUpdate(
                { _id: id, user_id: user.id },
                { ...input, updated_at: new Date() },
                { new: true }
            ).populate('food_item_id');
            if (!log) throw new Error('Food log not found');
            return log;
        },
        deleteFoodLog: async (_, { id }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            const result = await FoodLog.deleteOne({ _id: id, user_id: user.id });
            return result.deletedCount === 1;
        },
        addMeal: async (_, { input }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            const meal = new Meal({ ...input, user_id: user.id });
            await meal.save();
            return await meal.populate('food_items.food_item_id');
        },
        updateMeal: async (_, { id, input }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            const meal = await Meal.findOneAndUpdate(
                { _id: id, $or: [{ user_id: user.id }, { user_id: null }] }, // Allow updating global meals for now or just own
                { ...input, updated_at: new Date() },
                { new: true }
            ).populate('food_items.food_item_id');
            if (!meal) throw new Error('Meal not found or unauthorized');
            return meal;
        },
        deleteMeal: async (_, { id }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            // Soft delete
            const result = await Meal.findOneAndUpdate(
                { _id: id, user_id: user.id },
                { is_deleted: true, updated_at: new Date() }
            );
            return !!result;
        },
        addMedication: async (_, { input }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            const med = new Medication({ ...input, user_id: user.id });
            return await med.save();
        },
        updateMedication: async (_, { id, input }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            const med = await Medication.findOneAndUpdate(
                { _id: id, user_id: user.id },
                { ...input, updated_at: new Date() },
                { new: true }
            );
            if (!med) throw new Error('Medication not found');
            return med;
        },
        deleteMedication: async (_, { id }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            const result = await Medication.deleteOne({ _id: id, user_id: user.id });
            return result.deletedCount === 1;
        },
        addBloodPressure: async (_, { input }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            const bp = new BloodPressure({ ...input, userId: user.id });
            return await bp.save();
        },
        updateBloodPressure: async (_, { id, input }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            const bp = await BloodPressure.findOneAndUpdate(
                { _id: id, userId: user.id },
                { ...input, updated_at: new Date() },
                { new: true }
            );
            if (!bp) throw new Error('Blood pressure record not found');
            return bp;
        },
        deleteBloodPressure: async (_, { id }, { user }) => {
            if (!user) throw new Error('Unauthorized');
            const result = await BloodPressure.deleteOne({ _id: id, userId: user.id });
            return result.deletedCount === 1;
        }
    }
};

module.exports = resolvers;
