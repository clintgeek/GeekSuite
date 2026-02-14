#!/usr/bin/env node
/**
 * Test AI Classification System
 *
 * Run: node test-classification.js
 */

require('dotenv').config();

const baseGeekAIService = require('./src/services/baseGeekAIService');

async function testClassification() {
  console.log('\n🧠 Testing AI Food Classification\n');
  console.log('=====================================\n');

  // Check configuration
  const status = baseGeekAIService.getStatus();
  console.log('1. Configuration Check:');
  console.log(`   - AI Key Configured: ${status.apiKeyConfigured ? '✅ Yes' : '❌ No'}`);

  if (!status.apiKeyConfigured) {
    console.log('\n❌ AI not configured. Add AI_GEEK_API_KEY to your .env file');
    process.exit(1);
  }

  // Test classifications
  const testInputs = [
    'starbucks grande caramel macchiato',
    'chipotle chicken burrito with rice and beans',
    'grilled chicken breast',
    '2 eggs, toast, and orange juice',
    'big mac from mcdonalds',
    'homemade beef stew',
    'a slice of pepperoni pizza',
    'coca cola 12oz can'
  ];

  console.log('\n2. Classification Tests:\n');

  for (const input of testInputs) {
    console.log(`   Input: "${input}"`);
    try {
      const startTime = Date.now();
      const result = await baseGeekAIService.classifyFoodInput(input);
      const duration = Date.now() - startTime;

      console.log(`   ✅ Classified in ${duration}ms:`);
      console.log(`      Type: ${result.type}`);
      console.log(`      Brand: ${result.brand || 'none'}`);
      console.log(`      Items: ${result.items.map(i => i.name).join(', ')}`);
      console.log(`      Search: [${result.search_terms?.slice(0, 4).join(', ')}...]`);
      console.log(`      Confidence: ${result.confidence}`);
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    console.log('');
  }

  console.log('=====================================');
  console.log('✅ Classification test complete!\n');
}

testClassification().catch(console.error);
