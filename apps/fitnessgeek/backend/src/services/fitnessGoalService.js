import logger from '../config/logger.js';
import aiGeekClient, { UNAVAILABLE_MESSAGE } from './aiGeekClient.js';

/**
 * fitnessGoalService — the nutrition-goal and meal-plan side of FitnessGeek.
 *
 * Both calls go through aiGeek's feature door (`POST /api/ai/feature`, via
 * `aiGeekClient`), as features `nutritionGoals` and `mealPlan`. What that
 * replaced, in order of how badly it behaved:
 *
 *   - Its own axios wrapper over the deprecated `POST /api/ai/call`, which
 *     read the legacy `{ success, data: { response } }` envelope and threw on
 *     every call once the route went OpenAI-compatible.
 *   - `provider: 'anthropic'` on both calls until 2026-09-07 — a hard pin on
 *     the one paid provider in the roster, which broke every meal plan and
 *     every nutrition goal the day its credit ran out. Nothing in this file
 *     names a provider or a model any more; aiGeek's routing row decides.
 *   - A `throw` on any failure, surfacing as a 500 to the user.
 *
 * The two features fail differently, and deliberately:
 *
 *   - **nutritionGoals** has a deterministic answer — Mifflin-St Jeor for BMR,
 *     an activity multiplier for TDEE, a 500 kcal/lb/week deficit and a 1200 /
 *     BMR-20% floor. That is the same arithmetic the frontend planner
 *     (`components/FitnessGoals/AIGoalPlanner.jsx`) has always done locally,
 *     and it is the honest answer when no model replies, so `ok: false` takes
 *     it instead of failing.
 *   - **mealPlan** has none: a two-week menu cannot be computed from a BMR.
 *     It answers `{ ok: false, reason, message }` and the route returns a 200.
 */

/** Goal and plan prose are long; the door clamps this to 60s anyway. */
const GOAL_TIMEOUT_MS = 60000;

/** Activity multipliers, matching AIGoalPlanner.jsx exactly. */
const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9
};

/** `5'11"` → 71. Returns null for anything it cannot read. */
function parseHeightToInches(height) {
  if (typeof height === 'number' && Number.isFinite(height)) return height;
  const match = String(height || '').match(/(\d+)\s*'\s*(\d+)/);
  if (match) return parseInt(match[1], 10) * 12 + parseInt(match[2], 10);
  const bare = parseFloat(height);
  return Number.isFinite(bare) && bare > 0 ? bare : null;
}

class FitnessGoalService {
  // ============================================
  // DETERMINISTIC FALLBACK — nutrition goals
  // ============================================

  /**
   * The calorie plan, with no model involved.
   *
   * @param {string} userInput
   * @param {Object} userProfile - age, weight (lb), height, gender,
   *        currentFitnessLevel, weightChangeRate, targetWeight
   * @returns {Object|null} the same shape `parseNutritionGoalResponse`
   *          produces, or null when the profile has too few numbers to
   *          compute anything honest.
   */
  deterministicNutritionGoals(userInput, userProfile = {}) {
    const age = parseFloat(userProfile.age);
    const weight = parseFloat(userProfile.weight);
    const heightInches = parseHeightToInches(userProfile.height);
    const gender = String(userProfile.gender || '').toLowerCase();

    if (!Number.isFinite(age) || !Number.isFinite(weight) || !heightInches) {
      // No numbers, no arithmetic. Saying so beats inventing a calorie target.
      return null;
    }

    // Mifflin-St Jeor.
    let bmr = 10 * weight + 6.25 * heightInches - 5 * age;
    bmr = gender === 'male' ? bmr + 5 : bmr - 161;
    bmr = Math.round(bmr);

    const level = ACTIVITY_MULTIPLIERS[userProfile.currentFitnessLevel] ? userProfile.currentFitnessLevel : 'sedentary';
    const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[level]);

    const rate = Math.min(2, Math.max(0.25, parseFloat(userProfile.weightChangeRate) || 1));
    const dailyDeficit = rate * 500; // 3500 kcal per lb, spread over a week
    const minSafe = Math.max(1200, Math.round(bmr * 0.8));
    const dailyCalories = Math.max(Math.round(tdee - dailyDeficit), minSafe);

    const targetWeight = Number.isFinite(parseFloat(userProfile.targetWeight))
      ? parseFloat(userProfile.targetWeight)
      : null;
    const weightToLose = targetWeight != null ? Math.abs(weight - targetWeight) : null;
    const timelineWeeks = weightToLose != null ? Math.max(1, Math.ceil(weightToLose / rate)) : 12;

    const grams = (percent, kcalPerGram) => Math.round((dailyCalories * percent) / kcalPerGram);

    return {
      source: 'deterministic',
      primary_goal: {
        title: 'Calorie and macro targets',
        description: `Computed from your profile: BMR ${bmr} kcal, TDEE ${tdee} kcal at a ${level} activity level, ` +
          `and a ${rate} lb/week rate. Daily target ${dailyCalories} kcal, floored at ${minSafe} kcal.`,
        target_weight: targetWeight,
        weight_to_lose: weightToLose,
        timeline_weeks: timelineWeeks,
        daily_calorie_target: dailyCalories,
        macro_breakdown: { protein_percent: 30, carbs_percent: 40, fat_percent: 30 }
      },
      nutrition_phases: [
        {
          name: 'Adaptation',
          duration_weeks: Math.min(2, timelineWeeks),
          focus: 'Log consistently and settle into the calorie target',
          daily_calories: dailyCalories,
          meal_strategy: 'Three meals and one snack, hitting the protein target first',
          key_foods: ['lean protein', 'vegetables', 'whole grains', 'fruit'],
          foods_to_limit: ['sugary drinks', 'alcohol', 'fried food'],
          tips: [
            `Aim for about ${grams(0.30, 4)} g protein, ${grams(0.40, 4)} g carbs and ${grams(0.30, 9)} g fat a day.`,
            'Weigh yourself on the same day each week, not daily.'
          ]
        },
        {
          name: 'Steady progress',
          duration_weeks: Math.max(1, timelineWeeks - 2),
          focus: 'Hold the target and let the weekly trend do the work',
          daily_calories: dailyCalories,
          meal_strategy: 'Repeat the meals that worked; keep one flexible meal a week',
          key_foods: ['lean protein', 'legumes', 'vegetables'],
          foods_to_limit: ['calorie-dense snacks'],
          tips: [`Never drop below ${minSafe} kcal — that is the floor for your BMR.`]
        }
      ],
      meal_planning_strategies: [
        {
          name: 'Repeatable breakfasts and lunches',
          description: 'Fix the two meals you eat on autopilot, so only dinner needs thought.',
          best_for: 'Weekdays',
          example_meals: ['eggs and fruit', 'chicken and rice bowl']
        }
      ],
      lifestyle_considerations: [
        `Activity level assumed: ${level}.`,
        'Social meals are planned for, not accidents — budget them into the week.'
      ],
      success_metrics: [
        'Days logged per week',
        'Weekly average weight trend',
        `Days at or above the protein target (${grams(0.30, 4)} g)`
      ],
      estimated_timeline: {
        total_weeks: timelineWeeks,
        breakdown: weightToLose != null
          ? `${weightToLose} lb at ${rate} lb/week is about ${timelineWeeks} weeks.`
          : `No target weight given; ${timelineWeeks} weeks is a review point, not a finish line.`
      }
    };
  }

  // ============================================
  // FEATURE: nutritionGoals
  // ============================================

  /**
   * Create nutrition-focused fitness goals.
   *
   * @param {string} userInput - User's goal description
   * @param {Object} userProfile - User profile data
   * @param {string|null} userId - the per-day cap bucket (`quotaKey`), so one
   *        person's goal experiments cannot spend the whole app's allowance
   * @returns {Promise<{ok: boolean, source: string, data: Object|null,
   *                    reason: string|null, message?: string}>} — never throws
   */
  async createNutritionGoals(userInput, userProfile = {}, userId = null) {
    const result = await aiGeekClient.feature('nutritionGoals', {
      quotaKey: userId,
      system: 'You are an expert nutritionist and certified dietitian. Return ONLY valid JSON.',
      user: this.buildNutritionGoalPrompt(userInput, userProfile),
      maxTokens: 3000,
      temperature: 0.6
    }, { timeoutMs: GOAL_TIMEOUT_MS });

    if (result.ok) {
      const parsed = this.parseNutritionGoalResponse(result.data);
      if (parsed) {
        return { ok: true, source: 'model', data: parsed, reason: null, provenance: result.provenance };
      }
      logger.warn('Nutrition goal response was unusable — falling back to the computed plan');
    }

    const computed = this.deterministicNutritionGoals(userInput, userProfile);
    if (computed) {
      return {
        ok: false,
        source: 'deterministic',
        data: computed,
        reason: result.ok ? 'unparseable' : result.reason,
        provenance: result.provenance
      };
    }

    return {
      ok: false,
      source: 'none',
      data: null,
      reason: result.ok ? 'unparseable' : result.reason,
      message: UNAVAILABLE_MESSAGE,
      provenance: result.provenance
    };
  }

  // ============================================
  // FEATURE: mealPlan
  // ============================================

  /**
   * Generate detailed meal plan based on goals. No deterministic fallback
   * exists for a two-week menu, so a refusal is the answer.
   *
   * @param {Object} goal - Primary nutrition goal
   * @param {Object} userProfile - User profile data
   * @param {string|null} userId - the per-day cap bucket (`quotaKey`)
   * @returns {Promise<{ok: boolean, data: Object|null, reason: string|null,
   *                    message?: string}>} — never throws
   */
  async generateMealPlan(goal, userProfile = {}, userId = null) {
    const result = await aiGeekClient.feature('mealPlan', {
      quotaKey: userId,
      system: 'You are an expert meal planner. Return ONLY valid JSON.',
      user: this.buildMealPlanPrompt(goal, userProfile),
      maxTokens: 4000,
      temperature: 0.6
    }, { timeoutMs: GOAL_TIMEOUT_MS });

    if (result.ok) {
      const parsed = this.parseMealPlanResponse(result.data);
      if (parsed) {
        return { ok: true, data: parsed, reason: null, provenance: result.provenance };
      }
      logger.warn('Meal plan response was unusable');
      return {
        ok: false,
        data: null,
        reason: 'unparseable',
        message: UNAVAILABLE_MESSAGE,
        provenance: result.provenance
      };
    }

    return {
      ok: false,
      data: null,
      reason: result.reason,
      message: UNAVAILABLE_MESSAGE,
      provenance: result.provenance
    };
  }

  /**
   * Build prompt for nutrition goal creation
   */
  buildNutritionGoalPrompt(userInput, userProfile) {
    const profileInfo = userProfile.age ?
      `Age: ${userProfile.age}, Current Weight: ${userProfile.weight}lbs, Height: ${userProfile.height}", Gender: ${userProfile.gender}, Activity Level: ${userProfile.currentFitnessLevel}` :
      'Profile information not provided';

    const weightChangeRate = userProfile.weightChangeRate || '1';

    return `You are an expert nutritionist and certified dietitian helping to create personalized nutrition and meal planning goals.

User Profile: ${profileInfo}
Weight Change Rate: ${weightChangeRate} lbs per week
User Input: "${userInput}"

Create a comprehensive nutrition goal plan focused on meal planning and calorie management:

Return ONLY a JSON object with this exact structure:
{
  "primary_goal": {
    "title": "Main nutrition goal title",
    "description": "Detailed description of the primary goal",
    "target_weight": number,
    "weight_to_lose": number,
    "timeline_weeks": number,
    "daily_calorie_target": number,
    "macro_breakdown": {
      "protein_percent": number,
      "carbs_percent": number,
      "fat_percent": number
    }
  },
  "nutrition_phases": [
    {
      "name": "Phase name (e.g., 'Adaptation', 'Steady Progress', 'Maintenance')",
      "duration_weeks": number,
      "focus": "What this phase focuses on",
      "daily_calories": number,
      "meal_strategy": "Description of meal planning approach",
      "key_foods": ["list of key foods to focus on"],
      "foods_to_limit": ["list of foods to reduce"],
      "tips": ["list of practical tips for this phase"]
    }
  ],
  "meal_planning_strategies": [
    {
      "name": "Strategy name",
      "description": "How this strategy works",
      "best_for": "When to use this strategy",
      "example_meals": ["sample meal ideas"]
    }
  ],
  "lifestyle_considerations": [
    "List of lifestyle factors to consider"
  ],
  "success_metrics": [
    "List of measurable metrics to track progress"
  ],
  "estimated_timeline": {
    "total_weeks": number,
    "breakdown": "Detailed timeline breakdown"
  }
}

Guidelines:
- Focus on sustainable calorie deficits for weight loss
- Consider the user's current activity level and lifestyle
- Create realistic meal planning strategies
- Include macro-nutrient balance
- Consider food preferences and restrictions
- Plan for different phases of the journey
- Include practical meal planning tips
- Consider social eating and special occasions`;
  }

  /**
   * Build prompt for detailed meal plan generation
   */
  buildMealPlanPrompt(goal, userProfile) {
    const profileInfo = userProfile.age ?
      `Age: ${userProfile.age}, Current Weight: ${userProfile.weight}lbs, Height: ${userProfile.height}", Gender: ${userProfile.gender}, Activity Level: ${userProfile.currentFitnessLevel}` :
      'Profile information not provided';

    return `Create a detailed 2-week meal plan for this nutrition goal:

User: ${profileInfo}
Goal: ${goal.title} - ${goal.description}
Daily Calorie Target: ${goal.daily_calorie_target} calories

Return ONLY a JSON object:
{
  "weekly_meal_plans": [
    {
      "week": 1,
      "focus": "Week focus description",
      "daily_calories": number,
      "days": [
        {
          "day": "Monday",
          "total_calories": number,
          "meals": [
            {
              "meal": "Breakfast",
              "calories": number,
              "description": "Meal description",
              "foods": ["list of foods"],
              "prep_time": "5 minutes",
              "notes": "Any special notes"
            }
          ],
          "snacks": [
            {
              "name": "Snack name",
              "calories": number,
              "description": "Snack description"
            }
          ]
        }
      ],
      "shopping_list": ["list of items to buy"],
      "prep_tips": ["meal prep tips for the week"]
    }
  ],
  "meal_prep_strategies": [
    {
      "name": "Strategy name",
      "description": "How to implement",
      "time_saved": "Time savings",
      "tips": ["implementation tips"]
    }
  ],
  "flexibility_options": [
    {
      "scenario": "Eating out",
      "strategy": "How to handle",
      "calorie_guidelines": "Calorie guidelines"
    }
  ],
  "success_tips": [
    "List of tips for success"
  ]
}

Keep it practical and achievable.`;
  }

  /**
   * Read the model's nutrition goal answer.
   *
   * Returns `null` for anything unusable — an answer that will not parse is a
   * reason to take the computed plan, not an exception. The truncation repair
   * below is unchanged: long JSON from a small free-tier context gets cut off
   * mid-phase often enough to be worth salvaging.
   */
  parseNutritionGoalResponse(responseText) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      let jsonString = jsonMatch[0];

      // Try to fix common JSON issues
      try {
        const result = JSON.parse(jsonString);

        // Validate required fields
        if (!result.primary_goal || !result.nutrition_phases) {
          throw new Error('Invalid goal structure');
        }

        return result;
      } catch (parseError) {
        logger.info('JSON parse failed, attempting to fix incomplete response...');

        // More comprehensive fix for incomplete JSON
        if (jsonString.includes('"nutrition_phases"')) {
          const phaseMatches = jsonString.match(/"nutrition_phases":\s*\[([\s\S]*?)\]/g);
          if (phaseMatches) {
            const lastPhaseMatch = phaseMatches[phaseMatches.length - 1];
            const lastPhase = lastPhaseMatch.match(/"name":\s*"([^"]+)"/);

            logger.info(`Detected phases, fixing incomplete JSON...`);

            // Remove any trailing incomplete content
            const lastCompletePhaseIndex = jsonString.lastIndexOf('"name": "' + lastPhase[1] + '"');
            if (lastCompletePhaseIndex > 0) {
              const beforeLastPhase = jsonString.substring(0, lastCompletePhaseIndex);
              const lastPhaseStart = beforeLastPhase.lastIndexOf('{');
              if (lastPhaseStart > 0) {
                jsonString = jsonString.substring(0, lastPhaseStart) + '}';
              }
            }
          }
        }

        // Try parsing again
        try {
          const result = JSON.parse(jsonString);

          // Validate required fields
          if (!result.primary_goal || !result.nutrition_phases) {
            throw new Error('Invalid goal structure');
          }

          return result;
        } catch (secondParseError) {
          logger.warn({ err: secondParseError }, 'Nutrition goal response could not be read');
          return null;
        }
      }
    } catch (error) {
      logger.warn({ err: error }, 'Nutrition goal response could not be read');
      return null;
    }
  }

  /**
   * Read the model's meal plan answer. `null` for anything unusable.
   */
  parseMealPlanResponse(responseText) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      let jsonString = jsonMatch[0];

      // Try to fix common JSON issues
      try {
        const result = JSON.parse(jsonString);

        // Validate required fields
        if (!result.weekly_meal_plans || !Array.isArray(result.weekly_meal_plans)) {
          throw new Error('Invalid meal plan structure');
        }

        return result;
      } catch (parseError) {
        logger.info('JSON parse failed, attempting to fix incomplete response...');

        // More comprehensive fix for incomplete JSON
        if (jsonString.includes('"weekly_meal_plans"')) {
          const weekMatches = jsonString.match(/"weekly_meal_plans":\s*\[([\s\S]*?)\]/g);
          if (weekMatches) {
            const lastWeekMatch = weekMatches[weekMatches.length - 1];
            const lastWeek = parseInt(lastWeekMatch.match(/\d+/)[0]);

            logger.info(`Detected ${lastWeek} weeks, fixing incomplete JSON...`);

            // Remove any trailing incomplete content
            const lastCompleteWeekIndex = jsonString.lastIndexOf('"week": ' + lastWeek);
            if (lastCompleteWeekIndex > 0) {
              const beforeLastWeek = jsonString.substring(0, lastCompleteWeekIndex);
              const lastWeekStart = beforeLastWeek.lastIndexOf('{');
              if (lastWeekStart > 0) {
                jsonString = jsonString.substring(0, lastWeekStart) + '}';
              }
            }
          }
        }

        // Try parsing again
        try {
          const result = JSON.parse(jsonString);

          // Validate required fields
          if (!result.weekly_meal_plans || !Array.isArray(result.weekly_meal_plans)) {
            throw new Error('Invalid meal plan structure');
          }

          return result;
        } catch (secondParseError) {
          logger.warn({ err: secondParseError }, 'Meal plan response could not be read');
          return null;
        }
      }
    } catch (error) {
      logger.warn({ err: error }, 'Meal plan response could not be read');
      return null;
    }
  }

  getStatus() {
    return {
      enabled: aiGeekClient.isConfigured(),
      baseGeekUrl: aiGeekClient.baseGeekUrl,
      // Nothing here picks a provider — aiGeek's routing row for this app
      // does. These two fields read `anthropic` / `groq` until 2026-09-07.
      routing: 'auto (aiGeek routing row for app fitnessgeek)'
    };
  }
}

export default new FitnessGoalService();
