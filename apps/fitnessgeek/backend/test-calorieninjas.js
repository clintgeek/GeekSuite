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
