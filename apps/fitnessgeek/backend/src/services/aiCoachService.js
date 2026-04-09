const logger = require('../config/logger');
const axios = require('axios');

class AICoachService {
  constructor() {
    this.baseGeekUrl = process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com';
    this.jwtSecret = process.env.JWT_SECRET;
  }

  /**
   * Call baseGeek AI with system and user prompts
   */
  async callAI(systemPrompt, userPrompt, userToken = null) {
    try {
      const response = await axios.post(
        `${this.baseGeekUrl}/api/ai/call`,
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          config: {
            appName: 'fitnessGeek',
            freeOnly: true,
            maxTokens: 1500,
            temperature: 0.7
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(userToken && { 'Authorization': `Bearer ${userToken}` })
          },
          timeout: 30000
        }
      );

      // Handle both response shapes from /api/ai/call
      return response.data?.choices?.[0]?.message?.content || response.data?.data?.response || response.data?.response;
    } catch (error) {
      logger.error('AI service error:', error.response?.data || error.message);
      throw new Error('Failed to get AI response');
    }
  }

  /**
   * Generate meal suggestions based on remaining calories and macros
   */
  async generateMealSuggestions(userId, dailyData, userToken) {
    const systemPrompt = `You are a nutrition coach helping users meet their daily nutrition goals. 
Provide practical, specific meal suggestions that fit their remaining calories and macros.
Focus on whole foods and balanced meals. Format as a JSON array of meal suggestions.`;

    const userPrompt = `Based on this data, suggest 3 meals to help reach daily goals:

Daily Goals:
- Calories: ${dailyData.calorieGoal}
- Protein: ${dailyData.proteinGoal}g
- Carbs: ${dailyData.carbsGoal}g
- Fat: ${dailyData.fatGoal}g

Current Progress:
- Calories: ${dailyData.currentCalories} (${dailyData.remainingCalories} remaining)
- Protein: ${dailyData.currentProtein}g (${dailyData.remainingProtein}g remaining)
- Carbs: ${dailyData.currentCarbs}g (${dailyData.remainingCarbs}g remaining)
- Fat: ${dailyData.currentFat}g (${dailyData.remainingFat}g remaining)

Provide 3 specific meal suggestions that would help reach the goals. Return as JSON:
[
  {
    "name": "Meal name",
    "description": "Brief description",
    "calories": 400,
    "protein": 30,
    "carbs": 40,
    "fat": 12,
    "foods": ["food 1", "food 2", "food 3"]
  }
]`;

    try {
      const response = await this.callAI(systemPrompt, userPrompt, userToken);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (error) {
      logger.error('Failed to generate meal suggestions:', error);
      throw error;
    }
  }

  /**
   * Analyze eating patterns and provide coaching
   */
  async analyzeEatingPatterns(userId, weeklyData, userToken) {
    const systemPrompt = `You are a nutrition coach analyzing eating patterns. 
Provide insights about patterns, habits, and actionable recommendations.
Be encouraging and specific.`;

    const avgCalories = weeklyData.reduce((sum, day) => sum + day.calories, 0) / weeklyData.length;
    const avgProtein = weeklyData.reduce((sum, day) => sum + day.protein, 0) / weeklyData.length;

    const userPrompt = `Analyze this week's nutrition data and provide coaching:

Weekly Summary:
- Average calories: ${Math.round(avgCalories)}
- Average protein: ${Math.round(avgProtein)}g
- Days logged: ${weeklyData.length}/7
- Goal: ${weeklyData[0]?.goal || 'maintain'}

Daily breakdown:
${weeklyData.map((day, i) => 
  `Day ${i+1}: ${day.calories} cal, ${day.protein}g protein, ${day.meals} meals`
).join('\n')}

Provide:
1. Pattern observations (timing, consistency, macros)
2. Positive habits to highlight
3. 2-3 specific, actionable recommendations
4. Encouragement

Keep it concise (under 200 words).`;

    try {
      const response = await this.callAI(systemPrompt, userPrompt, userToken);
      return response;
    } catch (error) {
      logger.error('Failed to analyze eating patterns:', error);
      throw error;
    }
  }

  /**
   * Suggest micro-adjustments to improve nutrition
   */
  async suggestMicroAdjustments(userId, recentLogs, userToken) {
    const systemPrompt = `You are a nutrition coach providing small, actionable tweaks to improve nutrition.
Focus on simple swaps, portion adjustments, or timing changes.`;

    const userPrompt = `Based on recent meals, suggest 3 small tweaks:

Recent meals:
${recentLogs.slice(0, 5).map(log => 
  `- ${log.food_name}: ${log.calories} cal, P:${log.protein}g C:${log.carbs}g F:${log.fat}g`
).join('\n')}

Suggest 3 micro-adjustments like:
- "Swap X for Y to add 5g protein"
- "Add a handful of spinach to lunch for more fiber"
- "Move your carbs to post-workout for better energy"

Return as JSON array:
[
  {
    "title": "Short title",
    "suggestion": "Specific action",
    "benefit": "Why this helps",
    "impact": "calories: +50, protein: +10g" 
  }
]`;

    try {
      const response = await this.callAI(systemPrompt, userPrompt, userToken);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (error) {
      logger.error('Failed to generate micro-adjustments:', error);
      throw error;
    }
  }

  /**
   * Answer nutrition questions based on user's data
   */
  async answerNutritionQuestion(userId, question, userContext, userToken) {
    const systemPrompt = `You are a knowledgeable nutrition coach. Answer questions based on the user's data and goals.
Be specific, practical, and reference their actual habits when relevant.`;

    const userPrompt = `User question: "${question}"

User context:
- Goal: ${userContext.goal}
- Daily calorie target: ${userContext.calorieTarget}
- Current average: ${userContext.avgCalories} cal/day
- Protein target: ${userContext.proteinTarget}g
- Activity level: ${userContext.activityLevel || 'moderate'}

Provide a helpful, personalized answer (under 150 words).`;

    try {
      const response = await this.callAI(systemPrompt, userPrompt, userToken);
      return response;
    } catch (error) {
      logger.error('Failed to answer nutrition question:', error);
      throw error;
    }
  }
}

module.exports = new AICoachService();
