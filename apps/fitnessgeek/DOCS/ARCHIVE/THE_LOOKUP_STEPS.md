# Food Lookup Improvement - Implementation Steps

This guide provides step-by-step instructions for implementing the food lookup improvements. Each step includes context, file locations, and code patterns to follow.

---

## Prerequisites

Before starting, ensure you have:
- [ ] Node.js 18+ installed
- [ ] Access to the backend directory: `/Users/ccrocker/projects/fitnessGeek/backend`
- [ ] Environment file `.env` with API keys (see Step 1)

---

## Phase 1: Configuration & Environment

### Step 1.1: Add Missing API Keys to Environment

**File:** `backend/.env` and `backend/env.example`

Add these entries:

```bash
# USDA FoodData Central API (required for raw ingredients)
# Get key at: https://fdc.nal.usda.gov/api-key-signup.html
USDA_API_KEY=your_usda_api_key_here

# CalorieNinjas API (optional, for fallback)
# Get key at: https://calorieninjas.com/api
CALORIENINJAS_API_KEY=your_calorieninjas_key_here
```

**Why:** USDA is critical for raw ingredient accuracy. CalorieNinjas provides additional branded coverage.

---

## Phase 2: Create CalorieNinjas Service

### Step 2.1: Create the Service File

**Create:** `backend/src/services/calorieNinjasService.js`

Use this template (following the pattern from `fatSecretService.js`):

```javascript
/**
 * CalorieNinjas API Service
 *
 * Provides natural language food parsing and nutrition lookup.
 * Free tier: 10,000 API calls/month
 *
 * @see https://calorieninjas.com/api
 */

const axios = require('axios');
const logger = require('../config/logger');
const cacheService = require('./cacheService');

class CalorieNinjasService {
  constructor() {
    this.apiKey = process.env.CALORIENINJAS_API_KEY;
    this.baseUrl = 'https://api.calorieninjas.com/v1';
  }

  /**
   * Check if service is configured
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Search for foods by natural language query
   * CalorieNinjas excels at parsing queries like "2 eggs and a slice of toast"
   *
   * @param {string} query - Natural language food description
   * @returns {Promise<Array>} Array of food items in standard format
   */
  async searchFoods(query) {
    if (!this.isConfigured()) {
      logger.debug('CalorieNinjas not configured, skipping');
      return [];
    }

    try {
      const cacheKey = cacheService.key('calorieninjas', 'search', query.toLowerCase());

      return cacheService.wrap(cacheKey, async () => {
        const response = await axios.get(`${this.baseUrl}/nutrition`, {
          params: { query },
          headers: {
            'X-Api-Key': this.apiKey
          },
          timeout: 10000
        });

        if (!response.data || !response.data.items) {
          return [];
        }

        return response.data.items.map(item => this.transformToStandardFormat(item));
      }, 7 * 24 * 3600); // 7 day cache

    } catch (error) {
      logger.warn('CalorieNinjas search failed', {
        query,
        error: error.message,
        status: error.response?.status
      });
      return [];
    }
  }

  /**
   * Transform CalorieNinjas response to standard format
   *
   * CalorieNinjas returns per-serving data, which is what we want.
   * Example response item:
   * {
   *   "name": "egg",
   *   "calories": 147,
   *   "serving_size_g": 100,
   *   "fat_total_g": 9.9,
   *   "protein_g": 12.6,
   *   "carbohydrates_total_g": 0.8,
   *   "fiber_g": 0,
   *   "sugar_g": 0.8,
   *   "sodium_mg": 140
   * }
   */
  transformToStandardFormat(item) {
    return {
      id: `cn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: item.name || 'Unknown',
      brand: '', // CalorieNinjas doesn't provide brand info
      barcode: '',
      nutrition: {
        calories_per_serving: Math.round(item.calories || 0),
        protein_grams: Math.round((item.protein_g || 0) * 10) / 10,
        carbs_grams: Math.round((item.carbohydrates_total_g || 0) * 10) / 10,
        fat_grams: Math.round((item.fat_total_g || 0) * 10) / 10,
        fiber_grams: Math.round((item.fiber_g || 0) * 10) / 10,
        sugar_grams: Math.round((item.sugar_g || 0) * 10) / 10,
        sodium_mg: Math.round(item.sodium_mg || 0)
      },
      serving: {
        size: item.serving_size_g || 100,
        unit: 'g'
      },
      source: 'calorieninjas',
      source_id: null,
      confidence: 'medium' // CalorieNinjas uses estimated data
    };
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      enabled: this.isConfigured(),
      name: 'CalorieNinjas',
      rateLimit: '10,000/month'
    };
  }
}

module.exports = new CalorieNinjasService();
```

### Step 2.2: Create Test File for CalorieNinjas

**Create:** `backend/test-calorieninjas.js`

```javascript
#!/usr/bin/env node
/**
 * Test CalorieNinjas API Integration
 *
 * Run: node test-calorieninjas.js
 */

require('dotenv').config();
const axios = require('axios');

const apiKey = process.env.CALORIENINJAS_API_KEY;
const baseUrl = 'https://api.calorieninjas.com/v1';

async function searchFoods(query) {
  const response = await axios.get(`${baseUrl}/nutrition`, {
    params: { query },
    headers: { 'X-Api-Key': apiKey },
    timeout: 10000
  });
  return response.data;
}

async function testCalorieNinjas() {
  console.log('\n🥗 Testing CalorieNinjas API Integration\n');
  console.log('=========================================\n');

  // Check configuration
  console.log('1. Configuration Check:');
  console.log('   - API Key: ' + (apiKey ? '✅ Set' : '❌ Missing'));

  if (!apiKey) {
    console.log('\n❌ CalorieNinjas not configured. Add to your .env file:');
    console.log('   CALORIENINJAS_API_KEY=your_api_key');
    console.log('\n   Get a free API key at: https://calorieninjas.com/api');
    process.exit(1);
  }

  // Test queries
  const testQueries = [
    '2 scrambled eggs',
    'chicken breast 6oz',
    'apple',
    'big mac',
    '1 cup of rice'
  ];

  console.log('\n2. Search Tests:\n');

  for (const query of testQueries) {
    console.log('   Query: "' + query + '"');
    try {
      const data = await searchFoods(query);

      if (data.items && data.items.length > 0) {
        console.log('   ✅ Found ' + data.items.length + ' result(s):');
        data.items.slice(0, 3).forEach((item, i) => {
          console.log(`      ${i + 1}. ${item.name} - ${item.calories} cal, ${item.protein_g}g protein`);
        });
      } else {
        console.log('   ⚠️  No results found');
      }
    } catch (error) {
      console.log('   ❌ Error: ' + error.message);
    }
    console.log('');
  }

  console.log('=========================================');
  console.log('✅ CalorieNinjas integration test complete!\n');
}

testCalorieNinjas().catch(console.error);
```

**Run test:** `cd backend && node test-calorieninjas.js`

---

## Phase 3: Enhance Confidence Scoring

### Step 3.1: Add Confidence Constants

**File:** `backend/src/services/unifiedFoodService.js`

Add after the imports (around line 27):

```javascript
/**
 * Confidence levels for food lookup results
 * Higher = more reliable match
 */
const CONFIDENCE = {
  VERIFIED: 100,    // Exact barcode match from trusted source
  HIGH: 80,         // Exact name match from USDA/FatSecret
  MEDIUM: 60,       // Good partial match
  LOW: 40,          // Fuzzy match or less trusted source
  ESTIMATED: 20     // AI estimation (fallback)
};

// Minimum confidence to consider a result "good"
const MIN_HIGH_CONFIDENCE = CONFIDENCE.MEDIUM;

// Target number of high-confidence results before stopping search
const TARGET_RESULTS = 3;
```

### Step 3.2: Add Confidence to Transform Functions

Update each transform function to include confidence scores based on source reliability.

**In `transformUSDA()` (around line 610):**

```javascript
// Add to the return object
confidence: CONFIDENCE.HIGH,
source: 'usda',
```

**In `transformOpenFoodFacts()` (around line 576):**

```javascript
// Add to the return object
confidence: product.code ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
source: 'openfoodfacts',
```

**In `transformToStandardFormat()` for local DB (around line 549):**

```javascript
// Add to the return object
confidence: source === 'local' ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
```

---

## Phase 4: Implement Source-Priority Routing

### Step 4.1: Create Priority Chain Methods

**File:** `backend/src/services/unifiedFoodService.js`

Add these new methods in the class (after `searchComposite`, around line 248):

```javascript
/**
 * Search for raw ingredients - USDA first
 * Chain: USDA → OpenFoodFacts → CalorieNinjas → AI
 */
async searchRawIngredient(searchTerm, limit) {
  const results = [];

  // 1. Try USDA first (best for raw ingredients)
  const usdaResults = await this.searchUSDA(searchTerm, limit);
  results.push(...usdaResults);

  if (this.hasEnoughHighConfidence(results)) {
    logger.debug('USDA provided sufficient results', { count: results.length });
    return this.deduplicateResults(results, limit);
  }

  // 2. Try OpenFoodFacts
  const offResults = await this.searchOpenFoodFacts(searchTerm, limit - results.length);
  results.push(...offResults);

  if (this.hasEnoughHighConfidence(results)) {
    return this.deduplicateResults(results, limit);
  }

  // 3. Try CalorieNinjas as fallback
  const calorieNinjasService = require('./calorieNinjasService');
  const cnResults = await calorieNinjasService.searchFoods(searchTerm);
  results.push(...cnResults);

  return this.deduplicateResults(results, limit);
}

/**
 * Search for branded items - FatSecret first
 * Chain: FatSecret → OpenFoodFacts → CalorieNinjas → AI
 */
async searchBrandedItem(searchTerm, brand, limit) {
  const results = [];
  const fullQuery = brand ? `${brand} ${searchTerm}` : searchTerm;

  // 1. Try FatSecret first (best for branded/restaurant)
  const fsResults = await fatSecretService.searchFoods(fullQuery, limit);
  results.push(...fsResults);

  if (this.hasEnoughHighConfidence(results)) {
    logger.debug('FatSecret provided sufficient results', { count: results.length });
    return this.deduplicateResults(results, limit);
  }

  // 2. Try OpenFoodFacts
  const offResults = await this.searchOpenFoodFacts(fullQuery, limit - results.length);
  results.push(...offResults);

  if (this.hasEnoughHighConfidence(results)) {
    return this.deduplicateResults(results, limit);
  }

  // 3. Try CalorieNinjas
  const calorieNinjasService = require('./calorieNinjasService');
  const cnResults = await calorieNinjasService.searchFoods(fullQuery);
  results.push(...cnResults);

  return this.deduplicateResults(results, limit);
}

/**
 * Check if we have enough high-confidence results
 */
hasEnoughHighConfidence(results) {
  const highConfidenceCount = results.filter(r =>
    (r.confidence >= MIN_HIGH_CONFIDENCE) ||
    (r.source === 'usda') ||
    (r.source === 'fatsecret')
  ).length;

  return highConfidenceCount >= TARGET_RESULTS;
}
```

### Step 4.2: Update searchGeneric to Use New Method

**File:** `backend/src/services/unifiedFoodService.js`

Replace the `searchGeneric` method (around line 147):

```javascript
/**
 * Search for generic foods - prioritize USDA for raw ingredients
 */
async searchGeneric(classification, limit) {
  var searchTerm = classification.items[0] ? classification.items[0].name : '';
  var searchTerms = classification.search_terms || [];

  if (!searchTerm && searchTerms.length > 0) {
    searchTerm = searchTerms.join(' ');
  }

  logger.debug('Searching generic food (USDA priority)', { searchTerm });

  // Use new USDA-first routing for raw ingredients
  return this.searchRawIngredient(searchTerm, limit);
}
```

### Step 4.3: Update searchBranded to Use New Method

**File:** `backend/src/services/unifiedFoodService.js`

Replace the `searchBranded` method (around line 127):

```javascript
/**
 * Search for branded foods - prioritize FatSecret
 */
async searchBranded(classification, limit) {
  var itemName = classification.items[0] ? classification.items[0].name : '';
  var brand = classification.brand;

  logger.debug('Searching branded food (FatSecret priority)', {
    itemName,
    brand
  });

  // Use new FatSecret-first routing for branded items
  return this.searchBrandedItem(itemName, brand, limit);
}
```

---

## Phase 5: Add CalorieNinjas to Import

### Step 5.1: Add Import

**File:** `backend/src/services/unifiedFoodService.js`

Add near the top imports (around line 25):

```javascript
var calorieNinjasService = require('./calorieNinjasService');
```

---

## Phase 6: Update env.example

### Step 6.1: Document All API Keys

**File:** `backend/env.example`

Add/update these entries:

```bash
# External Food APIs
# ------------------

# USDA FoodData Central (required for raw ingredient accuracy)
# Get key at: https://fdc.nal.usda.gov/api-key-signup.html
USDA_API_KEY=your_usda_api_key

# OpenFoodFacts (no key required - free unlimited access)
OPENFOODFACTS_API_URL=https://world.openfoodfacts.org

# FatSecret API (branded food data - 5,000 calls/day free)
# Get credentials at: https://platform.fatsecret.com
FATSECRET_CLIENT_ID=your_client_id
FATSECRET_CLIENT_SECRET=your_client_secret

# CalorieNinjas API (optional fallback - 10,000 calls/month free)
# Get key at: https://calorieninjas.com/api
CALORIENINJAS_API_KEY=your_api_key
```

---

## Phase 7: Testing

### Step 7.1: Run Existing Tests

```bash
cd /Users/ccrocker/projects/fitnessGeek/backend

# Test FatSecret integration
node test-fatsecret.js

# Test CalorieNinjas integration (after creating)
node test-calorieninjas.js
```

### Step 7.2: Manual Testing Checklist

Test these scenarios in the app or via API:

| Test Case | Input | Expected Behavior |
|-----------|-------|-------------------|
| Raw ingredient | "chicken breast" | Should return USDA results first |
| Branded item | "starbucks caramel macchiato" | Should return FatSecret results first |
| Restaurant | "chipotle burrito bowl" | Should return FatSecret results |
| Composite | "2 eggs and toast" | Should split and search each separately |
| Barcode | Scan any UPC | Should check OpenFoodFacts first |
| Natural language | "I had a big mac for lunch" | AI should classify as branded → FatSecret |

### Step 7.3: Create Integration Test

**Create:** `backend/test-lookup-routing.js`

```javascript
#!/usr/bin/env node
/**
 * Test the full lookup routing logic
 */

require('dotenv').config();
const unifiedFoodService = require('./src/services/unifiedFoodService');

async function testRouting() {
  console.log('\n🔄 Testing Food Lookup Routing\n');
  console.log('================================\n');

  const testCases = [
    { query: 'chicken breast', expectedSource: 'usda', type: 'raw' },
    { query: 'starbucks latte', expectedSource: 'fatsecret', type: 'branded' },
    { query: '2 eggs and bacon', expectedSource: 'mixed', type: 'composite' },
    { query: 'apple', expectedSource: 'usda', type: 'raw' },
    { query: 'coca cola', expectedSource: 'fatsecret', type: 'branded' }
  ];

  for (const test of testCases) {
    console.log(`Query: "${test.query}" (expect: ${test.type} → ${test.expectedSource})`);

    try {
      const results = await unifiedFoodService.search(test.query, {
        limit: 5,
        includeAI: true,
        userId: 'test'
      });

      if (results.length > 0) {
        console.log(`  ✅ Found ${results.length} results`);
        results.slice(0, 3).forEach((r, i) => {
          console.log(`     ${i + 1}. [${r.source}] ${r.name} (${r.nutrition?.calories_per_serving || '?'} cal)`);
        });
      } else {
        console.log('  ⚠️  No results');
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
    console.log('');
  }

  console.log('================================');
  console.log('✅ Routing test complete!\n');
}

testRouting().catch(console.error);
```

**Run:** `cd backend && node test-lookup-routing.js`

---

## Phase 8: AI Sanity Check Layer

This phase adds an AI validation layer that:
1. Scores each API result's relevance to the original query
2. Returns only the top 3 per item
3. Final sanity check validates results match user intent

### Step 8.1: Add Scoring Method to baseGeekAIService

**File:** `backend/src/services/baseGeekAIService.js`

Add this method to the `BaseGeekAIService` class (after `classifyFoodInput`):

```javascript
/**
 * Score API results for relevance to the original query
 * This is a CHEAP call - just scoring, returns quickly
 *
 * @param {string} originalQuery - What the user asked for
 * @param {Array} results - API results to score
 * @returns {Promise<Array>} Results with AI confidence scores
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
  {"index": 2, "score": 40, "reason": "wrong type of food"},
  ...
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

    // Apply scores to results
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
    return results; // Return unscored on failure
  }
}

/**
 * Final sanity check - validates that results match user intent
 *
 * @param {string} originalQuery - What the user asked for
 * @param {Array} topResults - Top 3 results per item to validate
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
  "confidence": "high/medium/low"
}

Flag issues like:
- Wrong type of food (user said chicken, got tuna)
- Brand mismatch (user said Starbucks, got Dunkin)
- Completely irrelevant results`;

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
```

### Step 8.2: Add Sanity Check Wrapper to unifiedFoodService

**File:** `backend/src/services/unifiedFoodService.js`

Add this method to the `UnifiedFoodService` class (near the end, before `deduplicateResults`):

```javascript
/**
 * Apply AI sanity check to results
 * 1. Score each result's relevance
 * 2. Sort by AI score
 * 3. Take top 3 per item
 * 4. Final validation
 *
 * @param {string} originalQuery - User's original input
 * @param {Array} results - Raw API results
 * @param {number} topN - Number of results to return per item (default 3)
 * @returns {Promise<Array>} Validated, scored, and filtered results
 */
async applySanityCheck(originalQuery, results, topN = 3) {
  if (!results || results.length === 0) {
    return results;
  }

  try {
    // Step 1: Score results with AI
    const scoredResults = await baseGeekAIService.scoreResultsRelevance(
      originalQuery,
      results
    );

    // Step 2: Sort by AI relevance score (highest first)
    scoredResults.sort((a, b) =>
      (b.aiRelevanceScore || 0) - (a.aiRelevanceScore || 0)
    );

    // Step 3: Take top N results
    const topResults = scoredResults.slice(0, topN);

    // Step 4: Final sanity check
    const validation = await baseGeekAIService.sanityCheckResults(
      originalQuery,
      topResults
    );

    // Mark results with validation status
    const validatedResults = topResults.map(result => ({
      ...result,
      sanityCheckPassed: validation.valid,
      sanityCheckIssues: validation.issues || [],
      sanityCheckConfidence: validation.confidence || 'unknown'
    }));

    logger.info('Sanity check complete', {
      query: originalQuery,
      inputCount: results.length,
      outputCount: validatedResults.length,
      valid: validation.valid,
      issues: validation.issues
    });

    return validatedResults;

  } catch (error) {
    logger.error('Sanity check failed, returning unvalidated results', {
      error: error.message
    });
    return results.slice(0, topN);
  }
}
```

### Step 8.3: Integrate Sanity Check into Main Search

**File:** `backend/src/services/unifiedFoodService.js`

Update the `search()` method to apply sanity check before returning. Find where results are returned (around line 109) and wrap with sanity check:

```javascript
// In the search() method, before returning results:

// Apply AI sanity check to validate and rank results
if (results.length > 0 && includeAI) {
  results = await this.applySanityCheck(trimmedQuery, results, 3);
}

return results;
```

**Full context - update the section around line 86-109:**

```javascript
logger.info('Search results', {
  query: trimmedQuery,
  type: classification ? classification.type : 'unclassified',
  count: results.length
});

// Step 3: If no results and AI enabled, fall back to AI estimation
if (results.length === 0 && includeAI) {
  logger.info('No API results, using AI estimation', { query: trimmedQuery });
  try {
    var aiResults = await this.parseWithAI(trimmedQuery);
    if (aiResults && aiResults.length > 0) {
      // Mark as estimated so UI can show confidence indicator
      return aiResults.map(function(r) {
        r.confidence = 'estimated';
        return r;
      }).slice(0, limit);
    }
  } catch (aiError) {
    logger.error('AI estimation fallback failed', { error: aiError.message });
  }
}

// Step 4: Apply AI sanity check to validate and rank results
if (results.length > 0 && includeAI) {
  results = await this.applySanityCheck(trimmedQuery, results, 3);
}

return results;
```

### Step 8.4: Update Response Format

The sanity-checked results will now include these additional fields:

```javascript
{
  id: 'usda_12345',
  name: 'Chicken breast, raw',
  brand: '',
  nutrition: { ... },
  source: 'usda',

  // NEW: AI scoring fields
  aiRelevanceScore: 92,
  aiScoreReason: 'exact match for raw chicken',

  // NEW: Sanity check fields
  sanityCheckPassed: true,
  sanityCheckIssues: [],
  sanityCheckConfidence: 'high'
}
```

### Step 8.5: Create Test for Sanity Check

**Create:** `backend/test-sanity-check.js`

```javascript
#!/usr/bin/env node
/**
 * Test AI Sanity Check functionality
 */

require('dotenv').config();
const baseGeekAIService = require('./src/services/baseGeekAIService');

async function testSanityCheck() {
  console.log('\n🧠 Testing AI Sanity Check\n');
  console.log('===========================\n');

  // Test 1: Good match
  console.log('Test 1: Good matches (should pass)');
  const goodResults = [
    { name: 'Chicken Breast, Raw', brand: '', source: 'usda', nutrition: { calories_per_serving: 165 } },
    { name: 'Chicken Breast, Grilled', brand: '', source: 'usda', nutrition: { calories_per_serving: 180 } },
    { name: 'Boneless Skinless Chicken Breast', brand: 'Tyson', source: 'fatsecret', nutrition: { calories_per_serving: 170 } }
  ];

  const scored1 = await baseGeekAIService.scoreResultsRelevance('chicken breast', goodResults);
  console.log('Scores:', scored1.map(r => ({ name: r.name, score: r.aiRelevanceScore })));

  const validation1 = await baseGeekAIService.sanityCheckResults('chicken breast', goodResults);
  console.log('Validation:', validation1);
  console.log('');

  // Test 2: Bad match
  console.log('Test 2: Bad matches (should flag issues)');
  const badResults = [
    { name: 'Chicken of the Sea Tuna', brand: 'Chicken of the Sea', source: 'fatsecret', nutrition: { calories_per_serving: 70 } },
    { name: 'Chicken Nuggets', brand: 'McDonalds', source: 'fatsecret', nutrition: { calories_per_serving: 270 } },
    { name: 'Rubber Chicken Toy', brand: '', source: 'openfoodfacts', nutrition: { calories_per_serving: 0 } }
  ];

  const scored2 = await baseGeekAIService.scoreResultsRelevance('chicken breast', badResults);
  console.log('Scores:', scored2.map(r => ({ name: r.name, score: r.aiRelevanceScore })));

  const validation2 = await baseGeekAIService.sanityCheckResults('chicken breast', badResults);
  console.log('Validation:', validation2);
  console.log('');

  console.log('===========================');
  console.log('✅ Sanity check test complete!\n');
}

testSanityCheck().catch(console.error);
```

**Run:** `cd backend && node test-sanity-check.js`

---

## Summary Checklist


- [ ] **Step 1.1:** Add USDA_API_KEY and CALORIENINJAS_API_KEY to `.env`
- [ ] **Step 2.1:** Create `calorieNinjasService.js`
- [ ] **Step 2.2:** Create and run `test-calorieninjas.js`
- [ ] **Step 3.1:** Add CONFIDENCE constants to `unifiedFoodService.js`
- [ ] **Step 3.2:** Add confidence to all transform functions
- [ ] **Step 4.1:** Add `searchRawIngredient()` and `searchBrandedItem()` methods
- [ ] **Step 4.2:** Update `searchGeneric()` to use USDA-first routing
- [ ] **Step 4.3:** Update `searchBranded()` to use priority chain
- [ ] **Step 5.1:** Add calorieNinjasService import
- [ ] **Step 6.1:** Update `env.example` with all API keys
- [ ] **Step 7.1:** Run existing tests
- [ ] **Step 7.2:** Manual testing checklist
- [ ] **Step 7.3:** Create and run `test-lookup-routing.js`
- [ ] **Step 8.1:** Add `scoreResultsRelevance()` to baseGeekAIService
- [ ] **Step 8.2:** Add `sanityCheckResults()` to baseGeekAIService
- [ ] **Step 8.3:** Add `applySanityCheck()` to unifiedFoodService
- [ ] **Step 8.4:** Integrate sanity check into main `search()` method
- [ ] **Step 8.5:** Create and run `test-sanity-check.js`

---

## API Reference

### CalorieNinjas API

- **Endpoint:** `GET https://api.calorieninjas.com/v1/nutrition`
- **Auth:** Header `X-Api-Key: your_key`
- **Query:** `?query=2 eggs and toast`
- **Limit:** 10,000 requests/month (free tier)
- **Docs:** https://calorieninjas.com/api

### FatSecret API (Already Integrated)

- **Endpoint:** `POST https://platform.fatsecret.com/rest/server.api`
- **Auth:** OAuth 2.0 Client Credentials
- **Limit:** 5,000 requests/day (free tier)
- **Docs:** https://platform.fatsecret.com/docs

### USDA FoodData Central

- **Endpoint:** `GET https://api.nal.usda.gov/fdc/v1/foods/search`
- **Auth:** Query param `api_key=your_key`
- **Limit:** Unlimited with key
- **Docs:** https://fdc.nal.usda.gov/api-guide.html

### OpenFoodFacts

- **Endpoint:** `GET https://world.openfoodfacts.org/cgi/search.pl`
- **Auth:** None required
- **Limit:** Unlimited (please be respectful)
- **Docs:** https://wiki.openfoodfacts.org/API
