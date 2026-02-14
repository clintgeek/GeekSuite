const axios = require('axios');

class OpenFoodFactsService {
  constructor() {
    this.baseURL = process.env.OPENFOODFACTS_API_URL || 'https://world.openfoodfacts.org';
  }

  /**
   * Search for food items by query
   * @param {string} query - Search query
   * @param {number} limit - Maximum number of results
   * @returns {Promise<Array>} Array of food items
   */
  async searchFoods(query, limit = 25) {
    try {

      const response = await axios.get(`${this.baseURL}/cgi/search.pl`, {
        params: {
          search_terms: query,
          page_size: limit,
          json: 1
        },
        timeout: 10000
      });

      if (!response.data || !response.data.products) {
        return [];
      }

      const filteredProducts = response.data.products
        .filter(product => product.product_name && product.nutriments);

      const transformedProducts = filteredProducts
        .map(product => this.transformProduct(product))
        .slice(0, limit);
      return transformedProducts;

    } catch (error) {
      console.error('OpenFoodFacts search error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      return [];
    }
  }

  /**
   * Get food item by barcode
   * @param {string} barcode - Product barcode
   * @returns {Promise<Object|null>} Food item or null
   */
  async getFoodByBarcode(barcode) {
    try {
      const response = await axios.get(`${this.baseURL}/api/v0/product/${barcode}`, {
        params: { json: 1 },
        timeout: 10000
      });

      if (!response.data || response.data.status === 0) {
        return null;
      }

      return this.transformProduct(response.data.product);

    } catch (error) {
      console.error('OpenFoodFacts barcode lookup error:', error.message);
      return null;
    }
  }

  /**
   * Transform OpenFoodFacts product to our format
   * @param {Object} product - OpenFoodFacts product object
   * @returns {Object} Transformed food item
   */
  transformProduct(product) {
    const nutriments = product.nutriments || {};

    return {
      id: product.code || product._id,
      name: product.product_name || product.generic_name || 'Unknown Product',
      brand: product.brands || product.brand_owner || '',
      barcode: product.code,
      calories: Math.round(nutriments['energy-kcal_100g'] || nutriments['energy_100g'] / 4.184 || 0),
      protein: Math.round((nutriments.proteins_100g || 0) * 10) / 10,
      carbs: Math.round((nutriments.carbohydrates_100g || 0) * 10) / 10,
      fat: Math.round((nutriments.fat_100g || 0) * 10) / 10,
      fiber: Math.round((nutriments.fiber_100g || 0) * 10) / 10,
      sugar: Math.round((nutriments.sugars_100g || 0) * 10) / 10,
      sodium: Math.round((nutriments.sodium_100g || 0) * 10) / 10,
      servingSize: 100,
      servingSizeUnit: 'g',
      source: 'openfoodfacts',
      source_id: product.code,
      image_url: product.image_front_url || product.image_url,
      ingredients: product.ingredients_text,
      allergens: product.allergens_tags,
      nutrition_grade: product.nutrition_grade_fr || product.nutrition_grade,
      nova_group: product.nova_group,
      ecoscore_grade: product.ecoscore_grade
    };
  }

  /**
   * Get recent foods (placeholder for now)
   * @returns {Promise<Array>} Array of recent food items
   */
  async getRecentFoods() {
    // This would typically come from the user's database
    // For now, return empty array
    return [];
  }
}

module.exports = new OpenFoodFactsService();