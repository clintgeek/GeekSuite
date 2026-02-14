const axios = require('axios');
const logger = require('../config/logger');

class FitnessGoalService {
  constructor() {
    this.baseGeekUrl = process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com';
    this.jwtSecret = process.env.JWT_SECRET;
  }

  async callAI(prompt, config = {}, userToken = null) {
    if (!userToken) {
      throw new Error('User token is required for AI calls');
    }

    try {
      const response = await axios.post(`${this.baseGeekUrl}/api/ai/call`, {
        prompt,
        config: {
          ...config,
          appName: 'fitnessGeek',
          // Use Claude for nutrition planning - better reasoning and health awareness
          provider: 'anthropic',
          fallbackOrder: ['anthropic', 'groq', 'gemini', 'together']
        }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        timeout: 60000 // Increased timeout
      });

      if (!response.data.success) {
        throw new Error(response.data.error?.message || 'AI service call failed');
      }

      return response.data.data.response;
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
   * @param {string} userToken - User's JWT token
   * @returns {Promise<Object>} Nutrition goals with phases
   */
  async createNutritionGoals(userInput, userProfile = {}, userToken = null) {
    const prompt = this.buildNutritionGoalPrompt(userInput, userProfile);
    const response = await this.callAI(prompt, {
      maxTokens: 3000,
      temperature: 0.6,
      provider: 'anthropic'
    }, userToken);
    return this.parseNutritionGoalResponse(response);
  }

  /**
   * Generate detailed meal plan based on goals
   * @param {Object} goal - Primary nutrition goal
   * @param {Object} userProfile - User profile data
   * @param {string} userToken - User's JWT token
   * @returns {Promise<Object>} Detailed meal plan
   */
  async generateMealPlan(goal, userProfile = {}, userToken = null) {
    const prompt = this.buildMealPlanPrompt(goal, userProfile);
    const response = await this.callAI(prompt, {
      maxTokens: 4000,
      temperature: 0.6,
      provider: 'anthropic'
    }, userToken);
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
        console.log('JSON parse failed, attempting to fix incomplete response...');

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
          console.error('Failed to parse nutrition goal response:', secondParseError);
          throw new Error('Failed to parse nutrition goal response');
        }
      }
    } catch (error) {
      console.error('Failed to parse nutrition goal response:', error);
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
          console.error('Failed to parse meal plan response:', secondParseError);
          throw new Error('Failed to parse meal plan response');
        }
      }
    } catch (error) {
      console.error('Failed to parse meal plan response:', error);
      throw new Error('Failed to parse meal plan response');
    }
  }

  getStatus() {
    return {
      enabled: true,
      baseGeekUrl: this.baseGeekUrl,
      jwtSecretConfigured: !!this.jwtSecret,
      preferredProvider: 'anthropic', // Claude 3.5 Sonnet
      fallbackProvider: 'groq' // Groq Llama 3.1
    };
  }
}

module.exports = new FitnessGoalService();
