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
