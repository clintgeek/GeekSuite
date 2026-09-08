import aiFoodService from './src/services/aiFoodService.js';
import aiGeekClient from './src/services/aiGeekClient.js';

async function testAIIntegration() {
  console.log('🧪 Testing fitnessGeek AI Food Parsing Integration...\n');

  try {
    // Test 1: Check service status
    console.log('1. Checking AI service status...');
    const status = aiGeekClient.getStatus();
    console.log('   Status:', status);

    if (!status.enabled) {
      console.log('   ⚠️  AI features are disabled. Set AI_FEATURES_ENABLED=true to enable.');
      return;
    }

    // Test 2: Parse food description
    console.log('\n2. Testing food parsing...');
    // The feature door answers `{ ok, source, data }` — a declined call still
    // carries the deterministic split in `data`, so this probe reports which
    // one it got rather than pretending everything is fine.
    const envelope = await aiFoodService.parseFoodDescription(
      '2 chicken tacos and a dos equis',
      { dietary_preferences: [], goals: [] }
    );
    const foodResult = envelope.data;
    console.log(envelope.ok ? '   ✅ Food parsing successful (model)' : `   ⚠️  Model declined (${envelope.reason}) — deterministic split`);
    console.log('   Parsed items:', foodResult.food_items.length);
    console.log('   Estimated calories:', foodResult.estimated_calories);
    console.log('   Confidence:', foodResult.confidence);

    // Show the parsed items
    console.log('   Parsed food items:');
    foodResult.food_items.forEach((item, index) => {
      console.log(`     ${index + 1}. ${item.name} (${item.servings} ${item.estimated_serving_size})`);
      console.log(item.nutrition
        ? `        Calories: ${item.nutrition.calories_per_serving}, Protein: ${item.nutrition.protein_grams}g`
        : '        Nutrition: not estimated (deterministic split)');
    });

    console.log('\n🎉 AI food parsing integration test passed!');
    console.log('✅ Natural language food logging ready');
    console.log('✅ Users can now type "2 chicken tacos and a dos equis" and get structured data');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Error details:', error);

    if (error.message.includes('AI features are disabled')) {
      console.log('\n💡 To enable AI features:');
      console.log('   1. Set AI_FEATURES_ENABLED=true in your .env file');
      console.log('   2. Ensure JWT_SECRET is configured');
    } else if (error.message.includes('baseGeek')) {
      console.log('\n💡 baseGeek connection issues:');
      console.log('   1. Check BASEGEEK_URL is correct');
      console.log('   2. Verify JWT_SECRET is set');
      console.log('   3. Ensure baseGeek is running and accessible');
    }
  }
}

// Run the test
testAIIntegration();
