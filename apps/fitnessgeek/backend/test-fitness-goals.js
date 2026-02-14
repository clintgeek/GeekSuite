const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

// Mock authentication token (in real app, this would be a valid JWT)
const mockToken = 'mock-jwt-token';

async function testFitnessGoals() {
  console.log('🧪 Testing Fitness Goal AI Integration...\n');

  try {
    // Test 1: Create fitness goals
    console.log('1. Testing POST /api/ai/create-goals...');
    const userInput = "I'm 47, 5'11\", 295lbs. It's too hot to get outside for now but I'd like to lose 10 to 15 pounds and then start walking. My end goal is to weigh 220lb and run a few days a week.";
    const userProfile = {
      age: 47,
      weight: 295,
      height: "5'11\"",
      currentFitnessLevel: "beginner"
    };

    const goalResponse = await axios.post(`${BASE_URL}/api/ai/create-goals`, {
      userInput,
      userProfile
    }, {
      headers: { 'Authorization': `Bearer ${mockToken}` }
    });

    console.log('✅ Fitness goals created successfully');
    console.log('Primary Goal:', goalResponse.data.data.primary_goal?.title);
    console.log('Phases:', goalResponse.data.data.phases?.length || 0);
    console.log('Sub-goals:', goalResponse.data.data.sub_goals?.length || 0);
    console.log('');

    // Test 2: Generate detailed plan for the primary goal
    console.log('2. Testing POST /api/ai/generate-plan...');
    const primaryGoal = goalResponse.data.data.primary_goal;

    const planResponse = await axios.post(`${BASE_URL}/api/ai/generate-plan`, {
      goal: primaryGoal,
      userProfile
    }, {
      headers: { 'Authorization': `Bearer ${mockToken}` }
    });

    console.log('✅ Fitness plan generated successfully');
    console.log('Weekly plans:', planResponse.data.data.weekly_plans?.length || 0);
    console.log('Equipment needed:', planResponse.data.data.equipment_needed?.length || 0);
    console.log('');

    console.log('🎉 All fitness goal tests passed!');
    console.log('\n📋 Sample Goal Structure:');
    console.log(JSON.stringify(goalResponse.data.data, null, 2));

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testFitnessGoals().catch(console.error);
