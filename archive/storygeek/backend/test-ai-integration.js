// Test script to verify storyGeek's AI integration with baseGeek
const aiService = require('./src/services/aiService');

async function testStoryGeekAI() {
  try {
    console.log('🧪 Testing StoryGeek AI Integration...\n');

    // Test 1: Simple story generation
    console.log('📚 Testing story generation...');
    const storyContext = {
      title: 'Test Story',
      genre: 'Fantasy',
      worldState: {
        setting: 'A mystical forest',
        currentSituation: 'The player stands at a crossroads',
        mood: 'mysterious',
        tone: 'adventurous'
      },
      events: [],
      characters: [],
      locations: []
    };

    const userInput = "I want to explore the dark path to the left";

    const response = await aiService.generateStoryResponse(storyContext, userInput);
    console.log('✅ Story response generated:', response.substring(0, 100) + '...\n');

    // Test 2: Summary generation
    console.log('📝 Testing summary generation...');
    const summaryPrompt = "Summarize this story: A brave adventurer explores a mystical forest and discovers ancient secrets.";

    const summary = await aiService.generateSummaryResponse(summaryPrompt);
    console.log('✅ Summary generated:', summary.substring(0, 100) + '...\n');

    console.log('🎉 All StoryGeek AI tests passed!');
    console.log('Check baseGeek AI management to see the usage tracking.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure to:');
    console.log('1. Configure AI providers in baseGeek UI');
    console.log('2. Ensure baseGeek is running');
    console.log('3. Ensure user is authenticated in storyGeek');
  }
}

testStoryGeekAI();
