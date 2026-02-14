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
