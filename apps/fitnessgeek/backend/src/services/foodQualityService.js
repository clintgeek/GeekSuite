const FOOD_CONSTANTS = {
  // Source priority (higher = better)
  SOURCE_PRIORITY: {
    local: 5,        // User's custom foods
    nutritionix: 4,  // High quality branded foods
    usda: 4,         // Government database
    openFoodFacts: 2 // Community database
  },

  // Quality scoring weights
  SCORE_WEIGHTS: {
    dataCompleteness: 3,    // How complete the nutrition data is
    sourceReliability: 2,   // API source quality
    relevance: 3,           // How well it matches the search
    servingSize: 1,         // Reasonable serving size
    brandBarcode: 1         // Has brand or barcode
  },

  // Minimum quality score to include in results
  MIN_QUALITY_SCORE: 0.3,

  // Similarity threshold for deduplication
  SIMILARITY_THRESHOLD: 0.8,

  // Reasonable serving size limits (in grams)
  REASONABLE_SERVINGS: {
    min: 10,   // 10g minimum
    max: 1000  // 1000g maximum
  }
};

class FoodQualityService {
  /**
   * Calculate quality score for a food item (0-10 scale)
   */
  calculateQualityScore(food, searchQuery = '') {
    let score = 0;

    // 1. Data completeness (0-3 points)
    score += this.calculateDataCompleteness(food) * FOOD_CONSTANTS.SCORE_WEIGHTS.dataCompleteness;

    // 2. Source reliability (0-2 points)
    score += this.getSourcePriority(food.source) * FOOD_CONSTANTS.SCORE_WEIGHTS.sourceReliability;

    // 3. Relevance to search query (0-3 points)
    if (searchQuery) {
      score += this.calculateRelevanceScore(food, searchQuery) * FOOD_CONSTANTS.SCORE_WEIGHTS.relevance;
    }

    // 4. Serving size validation (0-1 point)
    if (this.isReasonableServing(food)) {
      score += FOOD_CONSTANTS.SCORE_WEIGHTS.servingSize;
    }

    // 5. Brand and barcode bonus (0-1 point)
    if (food.brand || food.barcode) {
      score += FOOD_CONSTANTS.SCORE_WEIGHTS.brandBarcode;
    }

    // 6. Filter out non-food items
    if (this.isNonFoodItem(food)) {
      return 0.1; // Very low score to exclude
    }

    return Math.min(10, Math.max(0, score));
  }

  /**
   * Calculate data completeness score (0-1)
   */
  calculateDataCompleteness(food) {
    const requiredFields = ['name', 'calories', 'protein', 'carbs', 'fat'];
    const presentFields = requiredFields.filter(field =>
      food[field] !== undefined && food[field] !== null && food[field] !== ''
    );
    return presentFields.length / requiredFields.length;
  }

  /**
   * Get source priority score (0-1)
   */
  getSourcePriority(source) {
    const maxPriority = Math.max(...Object.values(FOOD_CONSTANTS.SOURCE_PRIORITY));
    const priority = FOOD_CONSTANTS.SOURCE_PRIORITY[source] || 0;
    return priority / maxPriority;
  }

    /**
   * Calculate relevance score based on search query (0-1)
   */
  calculateRelevanceScore(food, searchQuery) {
    const query = searchQuery.toLowerCase().trim();
    const foodName = (food.name || '').toLowerCase();
    const foodBrand = (food.brand || '').toLowerCase();

    let score = 0;

    // Exact name match (highest priority)
    if (foodName === query) {
      score = 1.0;
      // Extra bonus for exact match of basic foods
      if (this.isBasicFood(food) && !food.brand) {
        score = 1.2; // Allow slight overflow for basic foods
      }
    }
    // Name starts with query (high priority)
    else if (foodName.startsWith(query + ' ')) {
      score = 0.9;
    }
    // Name contains query
    else if (foodName.includes(query)) {
      score = 0.7;
    }
    // Brand contains query
    else if (foodBrand.includes(query)) {
      score = 0.5;
    }
    // Word matching
    else {
      const queryWords = query.split(/\s+/);
      const nameWords = foodName.split(/\s+/);
      const brandWords = foodBrand.split(/\s+/);

      const nameMatches = queryWords.filter(word =>
        nameWords.some(nameWord => nameWord.includes(word))
      ).length;

      const brandMatches = queryWords.filter(word =>
        brandWords.some(brandWord => brandWord.includes(word))
      ).length;

      score = Math.max(
        nameMatches / queryWords.length * 0.6,
        brandMatches / queryWords.length * 0.4
      );
    }

    // Significant bonus for basic foods (especially unbranded)
    if (this.isBasicFood(food)) {
      if (!food.brand) {
        score += 0.4; // Big bonus for unbranded basic foods
      } else {
        score += 0.2; // Smaller bonus for branded basic foods
      }
    }

    // Penalty for processed foods when searching for basic foods
    if (this.isBasicFood({ name: query }) && this.isProcessedFood(food)) {
      score -= 0.3;
    }

    return Math.min(1.0, Math.max(0, score));
  }

  /**
   * Check if serving size is reasonable
   */
  isReasonableServing(food) {
    const servingSize = parseFloat(food.servingSize || food.serving_size || 100);
    return servingSize >= FOOD_CONSTANTS.REASONABLE_SERVINGS.min &&
           servingSize <= FOOD_CONSTANTS.REASONABLE_SERVINGS.max;
  }

  /**
   * Check if item is a non-food item
   */
  isNonFoodItem(food) {
    const nonFoodKeywords = [
      // Gift items
      'gift', 'present', 'mug', 'cup', 'tin', 'box', 'container', 'jar', 'bottle',
      'christmas', 'mother\'s day', 'father\'s day', 'valentine', 'birthday',
      'anniversary', 'wedding', 'party', 'celebration', 'holiday',

      // Non-food items
      'watercolor', 'texture', 'design', 'pattern', 'art', 'artwork', 'painting',
      'drawing', 'illustration', 'photo', 'picture', 'image', 'graphic',
      'decorative', 'ornamental', 'collectible', 'souvenir', 'memorabilia',

      // Kitchen items
      'utensil', 'tool', 'appliance', 'cookware', 'bakeware', 'dishware',
      'plate', 'bowl', 'fork', 'spoon', 'knife', 'spatula', 'whisk',

      // Clothing and accessories
      'shirt', 't-shirt', 'tshirt', 'pants', 'dress', 'hat', 'cap', 'jacket',
      'sweater', 'hoodie', 'sweatshirt', 'shoes', 'boots', 'sneakers',

      // Electronics
      'phone', 'laptop', 'computer', 'tablet', 'camera', 'headphones',
      'speaker', 'charger', 'cable', 'wire', 'battery',

      // Books and media
      'book', 'magazine', 'newspaper', 'cd', 'dvd', 'blu-ray', 'vinyl',
      'poster', 'calendar', 'notebook', 'journal', 'diary',

      // Toys and games
      'toy', 'game', 'puzzle', 'card', 'board', 'doll', 'stuffed', 'plush',
      'action figure', 'model', 'miniature',

      // Home and garden
      'plant', 'flower', 'seed', 'fertilizer', 'soil', 'pot', 'vase',
      'candle', 'soap', 'shampoo', 'lotion', 'cream', 'oil',

      // Office supplies
      'pen', 'pencil', 'paper', 'notebook', 'folder', 'binder', 'stapler',
      'tape', 'glue', 'scissors', 'ruler', 'calculator'
    ];

    const foodName = (food.name || '').toLowerCase();
    return nonFoodKeywords.some(keyword => foodName.includes(keyword));
  }

    /**
   * Check if item is a basic whole food
   */
  isBasicFood(food) {
    const basicFoodKeywords = [
      // Fruits
      'apple', 'orange', 'banana', 'grape', 'strawberry', 'blueberry', 'raspberry',
      'peach', 'pear', 'plum', 'cherry', 'lemon', 'lime', 'grapefruit', 'pineapple',
      'mango', 'kiwi', 'avocado', 'tomato', 'cucumber',

      // Vegetables
      'carrot', 'broccoli', 'cauliflower', 'spinach', 'lettuce', 'kale', 'cabbage',
      'onion', 'garlic', 'potato', 'sweet potato', 'yam', 'corn', 'peas', 'beans',

      // Proteins
      'chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'shrimp', 'egg',

      // Dairy
      'milk', 'cheese', 'yogurt', 'butter',

      // Grains
      'bread', 'rice', 'pasta', 'oatmeal', 'quinoa', 'brown rice', 'wild rice',

      // Nuts and seeds
      'almond', 'walnut', 'peanut', 'cashew', 'sunflower', 'pumpkin', 'flax',
      'olive', 'coconut', 'sesame', 'chia'
    ];

    const foodName = (food.name || '').toLowerCase();
    return basicFoodKeywords.some(keyword => foodName.includes(keyword));
  }

  /**
   * Check if item is a processed food
   */
  isProcessedFood(food) {
    const processedKeywords = [
      // Processed food types
      'juice', 'soda', 'pop', 'drink', 'beverage', 'smoothie', 'shake',
      'candy', 'chips', 'cookies', 'cake', 'pie', 'ice cream', 'dessert',
      'bar', 'cereal', 'snack', 'treat', 'crackers', 'pretzels',
      'sauce', 'dressing', 'spread', 'dip', 'soup', 'broth', 'stock',
      'seasoning', 'spice', 'herb', 'extract', 'flavor', 'syrup',

      // Processing indicators
      'artificial', 'natural', 'organic', 'gluten-free', 'vegan', 'vegetarian',
      'low-fat', 'low-carb', 'sugar-free', 'diet', 'light', 'lite',
      'reduced', 'fat-free', 'zero', 'fortified', 'enriched',

      // Packaging/processing words
      'canned', 'frozen', 'dried', 'dehydrated', 'powdered', 'concentrated',
      'pasteurized', 'homogenized', 'refined', 'bleached', 'hydrogenated'
    ];

    const foodName = (food.name || '').toLowerCase();
    const foodBrand = (food.brand || '').toLowerCase();

    return processedKeywords.some(keyword =>
      foodName.includes(keyword) || foodBrand.includes(keyword)
    );
  }

  /**
   * Process and sort food results
   */
  processResults(foods, searchQuery = '') {
    // Calculate quality scores
    foods.forEach(food => {
      food.quality_score = this.calculateQualityScore(food, searchQuery);
    });

    // Filter out low-quality items
    const highQualityFoods = foods.filter(food =>
      food.quality_score >= FOOD_CONSTANTS.MIN_QUALITY_SCORE
    );

    // Deduplicate results
    const uniqueFoods = this.deduplicateResults(highQualityFoods);

    // Sort by quality score and source priority
    return uniqueFoods.sort((a, b) => {
      // Primary sort: quality score
      if (b.quality_score !== a.quality_score) {
        return b.quality_score - a.quality_score;
      }

      // Secondary sort: source priority
      const priorityA = this.getSourcePriority(a.source);
      const priorityB = this.getSourcePriority(b.source);
      if (priorityB !== priorityA) {
        return priorityB - priorityA;
      }

      // Tertiary sort: brand presence (basic foods first)
      if (!!b.brand !== !!a.brand) {
        return a.brand ? 1 : -1;
      }

      // Final sort: name length (shorter names first)
      return a.name.length - b.name.length;
    });
  }

  /**
   * Deduplicate food results
   */
  deduplicateResults(foods) {
    const seen = new Map();
    const results = [];

    // Helper function to normalize names
    const normalizeName = (name) => {
      return name.toLowerCase()
        .replace(/s\b/g, '') // Remove trailing 's'
        .replace(/[^\w\s]/g, '') // Remove special characters
        .trim();
    };

    // First pass: Group by barcode
    const barcodeGroups = new Map();
    for (const food of foods) {
      if (food.barcode) {
        const normalizedBarcode = food.barcode.toString().trim();
        if (!barcodeGroups.has(normalizedBarcode)) {
          barcodeGroups.set(normalizedBarcode, []);
        }
        barcodeGroups.get(normalizedBarcode).push(food);
      }
    }

    // Process barcode groups
    for (const [barcode, group] of barcodeGroups) {
      const bestFood = group.reduce((best, current) =>
        current.quality_score > best.quality_score ? current : best
      );
      results.push(bestFood);

      // Mark as seen
      group.forEach(food => {
        const normalizedName = normalizeName(food.name);
        seen.set(normalizedName, true);
      });
    }

    // Second pass: Process remaining foods
    for (const food of foods) {
      if (food.barcode) continue; // Skip already processed

      const normalizedName = normalizeName(food.name);
      if (seen.has(normalizedName)) continue;

      // Check for similar names
      let isDuplicate = false;
      for (const existingFood of results) {
        const existingNormalizedName = normalizeName(existingFood.name);
        const similarity = this.calculateStringSimilarity(normalizedName, existingNormalizedName);

        if (similarity >= FOOD_CONSTANTS.SIMILARITY_THRESHOLD) {
          isDuplicate = true;
          // Keep the higher quality one
          if (food.quality_score > existingFood.quality_score) {
            const index = results.indexOf(existingFood);
            results[index] = food;
          }
          break;
        }
      }

      if (!isDuplicate) {
        results.push(food);
        seen.set(normalizedName, true);
      }
    }

    return results;
  }

  /**
   * Calculate string similarity (0-1)
   */
  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));

    return intersection.size / Math.max(words1.size, words2.size);
  }

  /**
   * Generate statistics for processed results
   */
  generateStats(foods, apiResults) {
    const qualityScores = foods.map(f => f.quality_score);

    return {
      total: foods.length,
      sources: {
        nutritionix: apiResults[0]?.status === 'fulfilled' ? apiResults[0].value.length : 0,
        openFoodFacts: apiResults[1]?.status === 'fulfilled' ? apiResults[1].value.length : 0,
        usda: apiResults[2]?.status === 'fulfilled' ? apiResults[2].value.length : 0
      },
      quality_scores: {
        min: qualityScores.length > 0 ? Math.min(...qualityScores) : 0,
        max: qualityScores.length > 0 ? Math.max(...qualityScores) : 0,
        avg: qualityScores.length > 0 ? qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length : 0
      }
    };
  }
}

module.exports = new FoodQualityService();