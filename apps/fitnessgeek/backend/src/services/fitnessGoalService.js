import axios from 'axios';
import logger from '../config/logger.js';

/**
 * fitnessGoalService — the nutrition-goal and meal-plan side of FitnessGeek.
 *
 * aiGeek resolves the calling app from the credential, so this presents
 * FitnessGeek's service key (AI_GEEK_API_KEY, app `fitnessgeek`) when one is
 * configured and forwards the user's JWT otherwise. The old
 * `appName: 'fitnessGeek:mealPlan'` was two things wearing one field — an app
 * and a feature — and made meal planning look like a separate app in the usage
 * breakdown. It is now `feature: 'mealPlan'` on an app resolved from the key.
 */
class FitnessGoalService {
  constructor() {
    this.baseGeekUrl = process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com';
    this.jwtSecret = process.env.JWT_SECRET;
    this.serviceKey = process.env.AI_GEEK_API_KEY || '';
  }

  async callAI(prompt, config = {}, userToken = null, userId = null) {
    const authToken = this.serviceKey || userToken;
    if (!authToken) {
      throw new Error('User token is required for AI calls');
    }

    try {
      const body = {
        prompt,
        config: {
          ...config
          // Provider/model/fallback are controlled server-side by this app's
          // AIAppConfig routing row. Nothing here names a provider: both
          // callers below passed `provider: 'anthropic'` until 2026-09-07,
          // which was a hard pin on the one paid provider in the roster — and
          // once its credit ran out, every meal plan and nutrition goal failed
          // on every call. Removed with the provider; the row decides now.
        },
        feature: 'mealPlan'
      };
      if (userId) body.userId = String(userId).slice(0, 64);

      const response = await axios.post(`${this.baseGeekUrl}/api/ai/call`, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        timeout: 60000 // Increased timeout
      });

      // /api/ai/call answers in the OpenAI chat.completion shape. The legacy
      // { success, data: { response } } envelope is kept as a fallback — this
      // code only read the legacy one, which is why it threw on every call
      // after the route was made OpenAI-compatible.
      const openAIContent = response.data?.choices?.[0]?.message?.content;
      if (openAIContent != null) return openAIContent;

      if (response.data?.success && response.data?.data?.response != null) {
        return response.data.data.response;
      }

      throw new Error(response.data?.error?.message || 'AI service call failed');
    } catch (error) {
      logger.error('baseGeek AI call failed for nutrition goals', {
        error: error.message,
        prompt: prompt.substring(0, 100) + '...',
        statusCode: error.response?.status
      });
      throw new Error(`AI service unavailable: ${error.message}`);
    }
  }

  /**
   * Create nutrition-focused fitness goals
   * @param {string} userInput - User's goal description
   * @param {Object} userProfile - User profile data
   * @param {string} userToken - User's JWT token (fallback auth)
   * @param {string} userId - Who the call is for (usage attribution)
   * @returns {Promise<Object>} Nutrition goals with phases
   */
  async createNutritionGoals(userInput, userProfile = {}, userToken = null, userId = null) {
    const prompt = this.buildNutritionGoalPrompt(userInput, userProfile);
    const response = await this.callAI(prompt, {
      maxTokens: 3000,
      temperature: 0.6
    }, userToken, userId);
    return this.parseNutritionGoalResponse(response);
  }

  /**
   * Generate detailed meal plan based on goals
   * @param {Object} goal - Primary nutrition goal
   * @param {Object} userProfile - User profile data
   * @param {string} userToken - User's JWT token (fallback auth)
   * @param {string} userId - Who the call is for (usage attribution)
   * @returns {Promise<Object>} Detailed meal plan
   */
  async generateMealPlan(goal, userProfile = {}, userToken = null, userId = null) {
    const prompt = this.buildMealPlanPrompt(goal, userProfile);
    const response = await this.callAI(prompt, {
      maxTokens: 4000,
      temperature: 0.6
    }, userToken, userId);
    return this.parseMealPlanResponse(response);
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
   * Parse nutrition goal response
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
          logger.error({ err: secondParseError }, 'Failed to parse nutrition goal response');
          throw new Error('Failed to parse nutrition goal response');
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to parse nutrition goal response');
      throw new Error('Failed to parse nutrition goal response');
    }
  }

  /**
   * Parse meal plan response
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
          logger.error({ err: secondParseError }, 'Failed to parse meal plan response');
          throw new Error('Failed to parse meal plan response');
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to parse meal plan response');
      throw new Error('Failed to parse meal plan response');
    }
  }

  getStatus() {
    return {
      enabled: true,
      baseGeekUrl: this.baseGeekUrl,
      jwtSecretConfigured: !!this.jwtSecret,
      // Nothing here picks a provider any more — aiGeek's routing row for this
      // app does. These two fields read `anthropic` / `groq` until 2026-09-07,
      // and nobody in this repo consumes them (fitnessGoalService.getStatus has
      // no caller; the /ai/status route reads baseGeekAIService's).
      routing: 'server-side (aiGeek AIAppConfig row for app fitnessgeek)'
    };
  }
}

export default new FitnessGoalService();
