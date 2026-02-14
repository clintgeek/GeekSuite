const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Meal = require('../models/Meal');
const FoodLog = require('../models/FoodLog');
const logger = require('../config/logger');

// Apply authentication to all routes
router.use(authenticateToken);

// Parse YYYY-MM-DD as local date (avoid UTC shift)
function parseLocalDate(input) {
  if (typeof input === 'string') {
    const [y, m, d] = input.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  return new Date(input);
}

// GET /api/meals - Get all user's meals
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { meal_type, search } = req.query;

    let meals;

    if (search) {
      meals = await Meal.searchMeals(search);
    } else if (meal_type) {
      meals = await Meal.getMealsByType(meal_type);
    } else {
      meals = await Meal.getActiveMeals();
    }

    logger.info('Meals retrieved', {
      userId,
      count: meals.length,
      mealType: meal_type || 'all',
      search: search || 'none'
    });

    res.json({
      success: true,
      data: meals
    });

  } catch (error) {
    logger.error('Error getting meals:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve meals',
        code: 'MEALS_RETRIEVAL_ERROR'
      }
    });
  }
});

// GET /api/meals/:id - Get single meal
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const meal = await Meal.findOne({
      _id: id,
      is_deleted: false
    }).populate('food_items.food_item_id');

    if (!meal) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Meal not found',
          code: 'MEAL_NOT_FOUND'
        }
      });
    }

    logger.info('Meal retrieved', { userId, mealId: id });

    res.json({
      success: true,
      data: meal
    });

  } catch (error) {
    logger.error('Error getting meal:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve meal',
        code: 'MEAL_RETRIEVAL_ERROR'
      }
    });
  }
});

// POST /api/meals - Create new meal
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, meal_type, food_items } = req.body;

    // Validate required fields
    if (!name || !meal_type || !food_items || !Array.isArray(food_items) || food_items.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Name, meal type, and at least one food item are required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    // Validate meal type
    const validMealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
    if (!validMealTypes.includes(meal_type)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid meal type',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    // Validate food items
    for (const item of food_items) {
      if (!item.food_item_id || !item.servings || item.servings <= 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Each food item must have a valid food_item_id and servings > 0',
            code: 'VALIDATION_ERROR'
          }
        });
      }
    }

    // Create meal
    const meal = new Meal({
      user_id: userId,
      name: name.trim(),
      meal_type,
      food_items
    });

    const savedMeal = await meal.save();

    // Get populated meal for response
    const populatedMeal = await Meal.findById(savedMeal._id)
      .populate('food_items.food_item_id');

    logger.info('Meal created', {
      userId,
      mealId: savedMeal._id,
      name: name,
      mealType: meal_type,
      itemCount: food_items.length
    });

    res.status(201).json({
      success: true,
      data: populatedMeal,
      message: 'Meal created successfully'
    });

  } catch (error) {
    logger.error('Error creating meal:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create meal',
        code: 'MEAL_CREATION_ERROR'
      }
    });
  }
});

// PUT /api/meals/:id - Update meal
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { name, meal_type, food_items } = req.body;

    const meal = await Meal.findOne({
      _id: id,
      user_id: userId,
      is_deleted: false
    });

    if (!meal) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Meal not found',
          code: 'MEAL_NOT_FOUND'
        }
      });
    }

    // Update fields if provided
    if (name !== undefined) {
      meal.name = name.trim();
    }

    if (meal_type !== undefined) {
      const validMealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
      if (!validMealTypes.includes(meal_type)) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Invalid meal type',
            code: 'VALIDATION_ERROR'
          }
        });
      }
      meal.meal_type = meal_type;
    }

    if (food_items !== undefined) {
      if (!Array.isArray(food_items) || food_items.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Food items must be a non-empty array',
            code: 'VALIDATION_ERROR'
          }
        });
      }

      // Validate food items
      for (const item of food_items) {
        if (!item.food_item_id || !item.servings || item.servings <= 0) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Each food item must have a valid food_item_id and servings > 0',
              code: 'VALIDATION_ERROR'
            }
          });
        }
      }

      meal.food_items = food_items;
    }

    const updatedMeal = await meal.save();

    // Get populated meal for response
    const populatedMeal = await Meal.findById(updatedMeal._id)
      .populate('food_items.food_item_id');

    logger.info('Meal updated', {
      userId,
      mealId: id,
      updatedFields: Object.keys(req.body)
    });

    res.json({
      success: true,
      data: populatedMeal,
      message: 'Meal updated successfully'
    });

  } catch (error) {
    logger.error('Error updating meal:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update meal',
        code: 'MEAL_UPDATE_ERROR'
      }
    });
  }
});

// DELETE /api/meals/:id - Delete meal (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const meal = await Meal.findOne({
      _id: id,
      user_id: userId,
      is_deleted: false
    });

    if (!meal) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Meal not found',
          code: 'MEAL_NOT_FOUND'
        }
      });
    }

    // Soft delete
    meal.is_deleted = true;
    await meal.save();

    logger.info('Meal deleted', {
      userId,
      mealId: id,
      mealName: meal.name
    });

    res.json({
      success: true,
      message: 'Meal deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting meal:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to delete meal',
        code: 'MEAL_DELETION_ERROR'
      }
    });
  }
});

// POST /api/meals/:id/add-to-log - Add meal to food log
router.post('/:id/add-to-log', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { log_date, meal_type } = req.body;

    // Validate required fields
    if (!log_date || !meal_type) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Log date and meal type are required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    // Get the meal
    const meal = await Meal.findOne({
      _id: id,
      is_deleted: false
    }).populate('food_items.food_item_id');

    if (!meal) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Meal not found',
          code: 'MEAL_NOT_FOUND'
        }
      });
    }

    // Create food logs for each item in the meal
    const createdLogs = [];
    for (const item of meal.food_items) {
      const log = new FoodLog({
        user_id: userId,
        food_item_id: item.food_item_id._id,
        log_date: parseLocalDate(log_date),
        meal_type: meal_type,
        servings: item.servings,
        notes: `Added from meal: ${meal.name}`,
        nutrition: item.food_item_id.nutrition || {}
      });

      const savedLog = await log.save();
      createdLogs.push(savedLog);
    }

    logger.info('Meal added to log', {
      userId,
      mealId: id,
      mealName: meal.name,
      logDate: log_date,
      mealType: meal_type,
      itemCount: createdLogs.length
    });

    res.status(201).json({
      success: true,
      message: `Added ${meal.name} to your ${meal_type}`,
      data: {
        meal: meal,
        logsCreated: createdLogs.length
      }
    });

  } catch (error) {
    logger.error('Error adding meal to log:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to add meal to log',
        code: 'MEAL_ADD_TO_LOG_ERROR'
      }
    });
  }
});

module.exports = router;