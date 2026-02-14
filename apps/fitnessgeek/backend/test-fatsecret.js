#!/usr/bin/env node
/**
 * Test FatSecret API Integration (standalone, no Redis dependency)
 *
 * Run: node test-fatsecret.js
 */

require('dotenv').config();
const axios = require('axios');

const clientId = process.env.FATSECRET_CLIENT_ID;
const clientSecret = process.env.FATSECRET_CLIENT_SECRET;
const tokenUrl = 'https://oauth.fatsecret.com/connect/token';
const apiUrl = 'https://platform.fatsecret.com/rest/server.api';

async function getAccessToken() {
  const response = await axios.post(
    tokenUrl,
    'grant_type=client_credentials&scope=basic',
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: { username: clientId, password: clientSecret },
      timeout: 10000,
    }
  );
  return response.data.access_token;
}

async function searchFoods(token, query) {
  const params = new URLSearchParams({
    method: 'foods.search',
    format: 'json',
    search_expression: query,
    max_results: 5,
  });

  const response = await axios.post(apiUrl, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Bearer ' + token,
    },
    timeout: 10000,
  });

  return response.data;
}

function parseNutrition(description) {
  if (!description) return {};
  const result = {};

  const caloriesMatch = description.match(/Calories:\s*([\d.]+)/i);
  if (caloriesMatch) result.calories = parseFloat(caloriesMatch[1]);

  const fatMatch = description.match(/Fat:\s*([\d.]+)/i);
  if (fatMatch) result.fat = parseFloat(fatMatch[1]);

  const carbsMatch = description.match(/Carbs:\s*([\d.]+)/i);
  if (carbsMatch) result.carbs = parseFloat(carbsMatch[1]);

  const proteinMatch = description.match(/Protein:\s*([\d.]+)/i);
  if (proteinMatch) result.protein = parseFloat(proteinMatch[1]);

  return result;
}

async function testFatSecret() {
  console.log('\n🔍 Testing FatSecret API Integration\n');
  console.log('=====================================\n');

  // Check configuration
  console.log('1. Configuration Check:');
  console.log('   - Client ID: ' + (clientId ? '✅ Set' : '❌ Missing'));
  console.log('   - Client Secret: ' + (clientSecret ? '✅ Set' : '❌ Missing'));

  if (!clientId || !clientSecret) {
    console.log('\n❌ FatSecret not configured. Add these to your .env file:');
    console.log('   FATSECRET_CLIENT_ID=your_client_id');
    console.log('   FATSECRET_CLIENT_SECRET=your_client_secret');
    process.exit(1);
  }

  // Test authentication
  console.log('\n2. Authentication Test:');
  var token;
  try {
    token = await getAccessToken();
    console.log('   - Token obtained: ✅ ' + token.substring(0, 20) + '...');
  } catch (error) {
    console.log('   - Token failed: ❌ ' + error.message);
    process.exit(1);
  }

  // Test searches
  var testQueries = [
    'starbucks caramel macchiato',
    'chipotle chicken burrito',
    'mcdonalds big mac',
    'coca cola',
    'chicken breast'
  ];

  console.log('\n3. Search Tests:\n');

  for (var i = 0; i < testQueries.length; i++) {
    var query = testQueries[i];
    console.log('   Query: "' + query + '"');
    try {
      var data = await searchFoods(token, query);

      if (data.foods && data.foods.food) {
        var foods = Array.isArray(data.foods.food) ? data.foods.food : [data.foods.food];
        console.log('   ✅ Found ' + foods.length + ' results:');

        for (var j = 0; j < Math.min(foods.length, 3); j++) {
          var food = foods[j];
          var nutrition = parseNutrition(food.food_description);
          var brand = food.brand_name ? ' (' + food.brand_name + ')' : '';
          var type = food.food_type === 'Brand' ? ' 🏷️' : '';
          console.log('      ' + (j + 1) + '. ' + food.food_name + brand + type + ' - ' + (nutrition.calories || '?') + ' cal');
        }
      } else {
        console.log('   ⚠️  No results found');
      }
    } catch (error) {
      console.log('   ❌ Error: ' + error.message);
    }
    console.log('');
  }

  console.log('=====================================');
  console.log('✅ FatSecret integration test complete!\n');
}

testFatSecret().catch(console.error);
