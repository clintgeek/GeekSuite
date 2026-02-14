const axios = require('axios');
const logger = require('../config/logger');

const COMMON_BRAND_HINTS = [
  'Starbucks',
  "McDonald's",
  'Chipotle',
  'Chick-fil-A',
  'Dunkin',
  'Burger King',
  'Taco Bell',
  "Domino's",
  'Subway',
  'Panera Bread',
  'Panda Express',
  'KFC',
  'Wendy\'s',
  'Costco',
  "Trader Joe's",
  'Whole Foods Market'
];

const BRAND_SYNONYMS = {
  "McDonald's": ["mc donalds", "mc d", "mcd's", 'mcds', 'mcd', "mickey d's", 'mickey ds', 'macdonalds'],
  'Starbucks': ['sbux', 'starbux', 'star bucks', 'starbuck\'s'],
  'Chipotle': ['chipoltle', 'chipolte', 'chipotle mexican grill'],
  'Chick-fil-A': ['chickfila', 'chikfila', 'chik fil a', 'chick fil a', 'cfa'],
  'Dunkin': ['dunkin donuts', 'dunkindonuts', "dunkin'"],
  'Burger King': ['bk', 'burgerking'],
  'Taco Bell': ['t bell', 'tbell', 'taco-bell', 'tacobell'],
  "Domino's": ['dominos', 'domino pizza'],
  'Panera Bread': ['panera', 'panerabread', 'st louis bread company'],
  'Panda Express': ['pandaexpress', 'panda exp', 'panda chinese'],
  'Wendy\'s': ['wendys'],
  'KFC': ['kentucky fried chicken'],
  'Costco': ['costco food court'],
  "Trader Joe's": ['trader joes', 'tj\'s'],
  'Whole Foods Market': ['wholefoods', 'whole foods']
};

const BRAND_SYNONYM_GUIDANCE = [
  "McD's / Mickey D's → McDonald's",
  'Sbux → Starbucks',
  'Chikfila / CFA → Chick-fil-A',
  'T Bell / Tbell → Taco Bell',
  'BK → Burger King'
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class BaseGeekAIService {
  constructor() {
    this.baseGeekUrl = process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com';
    this.apiKey = process.env.AI_GEEK_API_KEY;
  }

  /**
   * Call AI using baseGeek's OpenAI-compatible API
   * Uses API key authentication (bg_... key with ai:call permission)
   */
  async callAI(prompt, config = {}) {
    logger.info('AI callAI started', {
      apiKeyConfigured: !!this.apiKey,
      apiKeyPrefix: this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'none',
      baseGeekUrl: this.baseGeekUrl
    });

    if (!this.apiKey) {
      logger.error('AI_GEEK_API_KEY is not configured');
      throw new Error('AI_GEEK_API_KEY is not configured');
    }

    const {
      maxTokens = 1000,
      temperature = 0.2,
      systemPrompt = 'You are a helpful assistant.'
    } = config;

    const requestUrl = `${this.baseGeekUrl}/openai/v1/chat/completions`;
    const requestBody = {
      model: 'basegeek-rotation',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature,
      max_tokens: maxTokens,
      stream: false
    };

    logger.info('AI request details', {
      url: requestUrl,
      model: requestBody.model,
      promptLength: prompt.length,
      maxTokens
    });

    try {
      const response = await axios.post(
        requestUrl,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: 30000
        }
      );

      // Extract the assistant's response from OpenAI format
      const assistantMessage = response.data?.choices?.[0]?.message?.content;

      if (!assistantMessage) {
        throw new Error('No response content from AI');
      }

      logger.info('AI call successful', {
        provider: response.data?.provider?.provider,
        model: response.data?.provider?.model,
        tokens: response.data?.usage?.total_tokens
      });

      return assistantMessage;

    } catch (error) {
      logger.error('baseGeek AI call failed', {
        error: error.message,
        prompt: prompt.substring(0, 100) + '...',
        statusCode: error.response?.status,
        responseData: error.response?.data
      });
      throw new Error(`AI service unavailable: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Parse a natural language food description into structured nutrition data
   * @param {string} description - Natural language food description
   * @param {Object} userContext - Optional user dietary context
   * @returns {Promise<Object>} Parsed food items with nutrition data
   */
  async parseFoodDescription(description, userContext = {}) {
    const prompt = this.buildFoodParsingPrompt(description, userContext);
    const response = await this.callAI(prompt, {
      maxTokens: 1000,
      temperature: 0.2,
      systemPrompt: 'You are a nutrition expert. Return ONLY valid JSON, no explanations.'
    });
    return this.parseFoodAIResponse(response);
  }

  buildFoodParsingPrompt(description, userContext) {
    return `You are a nutrition expert helping to parse natural language food descriptions into structured JSON data.

    User's dietary context: ${JSON.stringify(userContext)}

    Please parse this food description: "${description}"

    Return ONLY a valid JSON object following this EXACT structure (no explanations or extra text):

    {
      "food_items": [
        {
          "name": "Food name",
          "servings": number,
          "estimated_serving_size": "1 cup, 1 piece, 100 grams, etc.",
          "nutrition": {
            "calories_per_serving": number,
            "protein_grams": number,
            "carbs_grams": number,
            "fat_grams": number,
            "fiber_grams": number,
            "sugar_grams": number
          }
        }
      ],
      "meal_type": "breakfast|lunch|dinner|snack",
      "estimated_calories": number,
      "confidence": "high|medium|low"
    }

    Guidelines:
    - Nutrition values correspond to one serving.
    - Round nutrition values to whole numbers (use one decimal for values under 1g).
    - Use common food names.
    - Use standard serving units.
    - Respect user's dietary restrictions strictly.
    - If uncertain about meal_type, default to "snack".
    - Confidence should reflect parsing certainty.

    Example output:
    {
      "food_items": [
        {
          "name": "Grilled chicken breast",
          "servings": 1,
          "estimated_serving_size": "4 oz",
          "nutrition": {
            "calories_per_serving": 180,
            "protein_grams": 35,
            "carbs_grams": 0,
            "fat_grams": 4,
            "fiber_grams": 0,
            "sugar_grams": 0
          }
        }
      ],
      "meal_type": "lunch",
      "estimated_calories": 180,
      "confidence": "high"
    }`;
  }

  /**
   * Classify food input to determine the best lookup strategy
   * This is a CHEAP call - just classification, no nutrition estimation
   *
   * @param {string} input - User's food input
   * @returns {Promise<Object>} Classification result
   */
  async classifyFoodInput(input) {
    const classificationContext = this.prepareClassificationInput(input);
    const prompt = this.buildClassificationPrompt(
      classificationContext.normalizedInput,
      classificationContext
    );
    const response = await this.callAI(prompt, {
      maxTokens: 300, // Small response = cheap
      temperature: 0.1, // Very deterministic
      systemPrompt: 'You are a food classification expert. Return ONLY valid JSON.'
    });
    const parsed = this.parseClassificationResponse(response);
    const enriched = {
      ...parsed,
      detected_brands: classificationContext.detectedBrands,
      normalized_query: classificationContext.normalizedInput
    };

    logger.debug('AI classification metadata', {
      originalInput: input,
      normalizedInput: classificationContext.normalizedInput,
      detectedBrands: classificationContext.detectedBrands,
      resolvedBrand: parsed.brand,
      type: parsed.type
    });

    return enriched;
  }

  prepareClassificationInput(input) {
    const rawInput = input || '';
    let normalizedInput = rawInput;
    const detectedBrandSet = new Set();
    const lowerInput = rawInput.toLowerCase();

    Object.entries(BRAND_SYNONYMS).forEach(([canonical, variants]) => {
      const variantList = [canonical].concat(variants || []);
      variantList.forEach((variant) => {
        const regex = new RegExp(`\\b${escapeRegExp(variant)}\\b`, 'gi');
        if (regex.test(normalizedInput)) {
          detectedBrandSet.add(canonical);
          normalizedInput = normalizedInput.replace(regex, canonical);
        }
      });
    });

    COMMON_BRAND_HINTS.forEach((brand) => {
      if (lowerInput.includes(brand.toLowerCase())) {
        detectedBrandSet.add(brand);
      }
    });

    return {
      normalizedInput: normalizedInput.trim(),
      detectedBrands: Array.from(detectedBrandSet)
    };
  }

  /**
   * Score API results for relevance to the original query
   * This is a CHEAP call - just scoring, returns quickly
   *
   * @param {string} originalQuery - What the user asked for
   * @param {Array} results - API results to score
   * @returns {Promise<Array>} Results with AI confidence scores applied
   */
  async scoreResultsRelevance(originalQuery, results) {
    if (!results || results.length === 0) {
      return results;
    }

    // Build a compact list for the AI to score
    const resultList = results.slice(0, 15).map((r, i) =>
      `${i + 1}. "${r.name}"${r.brand ? ` (${r.brand})` : ''} - ${r.source}`
    ).join('\n');

    const prompt = `Score how well each food result matches what the user asked for.

User's query: "${originalQuery}"

Results to score:
${resultList}

Return ONLY a JSON array with scores (0-100):
[
  {"index": 1, "score": 85, "reason": "exact match"},
  {"index": 2, "score": 40, "reason": "wrong type of food"}
]

Scoring guide:
- 90-100: Exact or near-exact match
- 70-89: Good match, minor differences
- 50-69: Partial match, may not be what user wants
- 30-49: Poor match, likely wrong item
- 0-29: Completely irrelevant`;

    try {
      const response = await this.callAI(prompt, {
        maxTokens: 400,
        temperature: 0.1,
        systemPrompt: 'You are a food matching expert. Return ONLY valid JSON.'
      });

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.warn('AI scoring returned no JSON', { response });
        return results;
      }

      const scores = JSON.parse(jsonMatch[0]);

      return results.map((result, i) => {
        const scoreEntry = scores.find(s => s.index === i + 1);
        return {
          ...result,
          aiRelevanceScore: scoreEntry?.score || 50,
          aiScoreReason: scoreEntry?.reason || 'not scored'
        };
      });
    } catch (error) {
      logger.error('AI result scoring failed', { error: error.message });
      return results;
    }
  }

  /**
   * Final sanity check - validates that results match user intent
   *
   * @param {string} originalQuery - What the user asked for
   * @param {Array} topResults - Top results to validate
   * @returns {Promise<Object>} Validation result with issues
   */
  async sanityCheckResults(originalQuery, topResults) {
    if (!topResults || topResults.length === 0) {
      return { valid: true, issues: [] };
    }

    const resultList = topResults.map((r, i) =>
      `${i + 1}. "${r.name}"${r.brand ? ` (${r.brand})` : ''} - ${r.nutrition?.calories_per_serving || '?'} cal`
    ).join('\n');

    const prompt = `Sanity check: Do these food results match what the user asked for?

User asked for: "${originalQuery}"

We're returning:
${resultList}

Return ONLY JSON:
{
  "valid": true/false,
  "issues": ["description of any problems"],
  "confidence": "high|medium|low"
}

Flag issues like wrong food type, brand mismatches, or irrelevant items.`;

    try {
      const response = await this.callAI(prompt, {
        maxTokens: 200,
        temperature: 0.1,
        systemPrompt: 'You are a food matching expert. Return ONLY valid JSON.'
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { valid: true, issues: [], confidence: 'low' };
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      logger.error('AI sanity check failed', { error: error.message });
      return { valid: true, issues: [], confidence: 'unknown' };
    }
  }

  buildClassificationPrompt(input, context = {}) {
    const detectedBrands = context.detectedBrands || [];
    const brandDictionary = COMMON_BRAND_HINTS.join(', ');
    const synonymGuidance = BRAND_SYNONYM_GUIDANCE.join('\n- ');
    const detectedBrandSection = detectedBrands.length > 0
      ? `Detected brands in input: ${detectedBrands.join(', ')}. Normalize spellings to these exact names and set type="branded" (or composite with brand metadata) when appropriate.`
      : 'If you detect a known brand, set type="branded" unless multiple different foods are specified (then use composite but keep the brand on each item).';

    return `Parse this food input into structured data for nutrition database lookup.

Input: "${input}"

CRITICAL: Extract EVERY distinct food item mentioned. Split on "and", commas, or implicit separators.

Brand recognition rules:
- ${detectedBrandSection}
- Reference brand dictionary (treat these as branded if present): ${brandDictionary}.
- Normalize obvious nicknames/misspellings:
  - ${synonymGuidance}

Return ONLY a JSON object:
{
  "type": "branded|generic|composite|unknown",
  "brand": "Brand name if detected, otherwise null",
  "items": [
    {
      "name": "Simple food name for API search (singular form, no quantity words)",
      "quantity": 1,
      "unit": "item|cup|oz|g|serving|slice|piece|bottle|can"
    }
  ],
  "search_terms": ["keywords", "for", "search"],
  "confidence": "high|medium|low"
}

Rules:
- type="composite" if 2+ distinct foods (connected by "and", commas, etc.)
- type="branded" if restaurant/brand detected (McDonald's, Starbucks, etc.)
- type="generic" for single unbranded foods
- Convert word quantities: "two"→2, "a"→1, "three"→3, etc.
- Use singular food names: "tacos"→"taco", "eggs"→"egg"
- Default unit is "serving" unless context suggests otherwise
- For beverages: beer/soda→"bottle" or "can", coffee→"cup"

Examples:
"Two tacos, beans, and a beer" → {"type":"composite","brand":null,"items":[{"name":"taco","quantity":2,"unit":"item"},{"name":"beans","quantity":1,"unit":"serving"},{"name":"beer","quantity":1,"unit":"bottle"}],"search_terms":["taco","beans","beer"],"confidence":"high"}
"McDonald's Big Mac and large fries" → {"type":"branded","brand":"McDonald's","items":[{"name":"Big Mac","quantity":1,"unit":"item"},{"name":"large fries","quantity":1,"unit":"serving"}],"search_terms":["big mac","fries","large"],"confidence":"high"}
"2 eggs and toast" → {"type":"composite","brand":null,"items":[{"name":"egg","quantity":2,"unit":"item"},{"name":"toast","quantity":1,"unit":"slice"}],"search_terms":["egg","toast"],"confidence":"high"}
"grilled chicken breast" → {"type":"generic","brand":null,"items":[{"name":"grilled chicken breast","quantity":1,"unit":"serving"}],"search_terms":["chicken","breast","grilled"],"confidence":"high"}`;
  }

  parseClassificationResponse(responseText) {
    try {
      var jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in classification response');
      }

      var result = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!result.type || !result.items) {
        throw new Error('Invalid classification structure');
      }

      // Normalize type
      var validTypes = ['branded', 'generic', 'composite', 'unknown'];
      if (validTypes.indexOf(result.type) === -1) {
        result.type = 'unknown';
      }

      return result;
    } catch (error) {
      logger.error('Failed to parse classification response', {
        responseText: responseText,
        error: error.message
      });
      // Return a safe fallback
      return {
        type: 'unknown',
        brand: null,
        items: [{ name: responseText, quantity: 1, unit: 'serving' }],
        search_terms: responseText.toLowerCase().split(/\s+/),
        confidence: 'low'
      };
    }
  }

  parseFoodAIResponse(responseText) {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const result = JSON.parse(jsonMatch[0]);

      if (!result.food_items || !Array.isArray(result.food_items)) {
        throw new Error('Invalid food items structure');
      }

      return result;
    } catch (error) {
      logger.error('Failed to parse food AI response', {
        responseText,
        error: error.message
      });
      throw new Error('Invalid AI response format');
    }
  }

  /**
   * Simple chat method - sends a prompt and gets a response
   * @param {string} prompt - The full prompt to send
   * @param {string} userToken - Optional user token (not used currently, for future)
   * @returns {Promise<string>} AI response text
   */
  async chat(prompt, userToken = null) {
    return this.callAI(prompt, {
      maxTokens: 2000,
      temperature: 0.7,
      systemPrompt: 'You are a helpful health and nutrition assistant.'
    });
  }

  /**
   * Chat with conversation history
   * @param {Array} messages - Array of {role, content} messages
   * @param {string} userToken - Optional user token
   * @returns {Promise<string>} AI response text
   */
  async chatWithHistory(messages, userToken = null) {
    if (!this.apiKey) {
      throw new Error('AI_GEEK_API_KEY is not configured');
    }

    const requestUrl = `${this.baseGeekUrl}/openai/v1/chat/completions`;
    const requestBody = {
      model: 'basegeek-rotation',
      messages,
      temperature: 0.7,
      max_tokens: 2000,
      stream: false
    };

    try {
      const response = await axios.post(
        requestUrl,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: 60000
        }
      );

      const assistantMessage = response.data?.choices?.[0]?.message?.content;
      if (!assistantMessage) {
        throw new Error('No response content from AI');
      }

      return assistantMessage;
    } catch (error) {
      logger.error('baseGeek AI chat failed', { error: error.message });
      throw new Error(`AI service unavailable: ${error.message}`);
    }
  }

  getStatus() {
    return {
      enabled: !!this.apiKey,
      baseGeekUrl: this.baseGeekUrl,
      apiKeyConfigured: !!this.apiKey,
      model: 'basegeek-rotation' // Auto-rotating through free tier providers
    };
  }
}

module.exports = new BaseGeekAIService();
