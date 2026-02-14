// Test script to demonstrate app tracking
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testAppTracking() {
  try {
    console.log('🧪 Testing App Tracking...\n');

    // Test 1: Call from fitnessGeek
    console.log('📱 Testing fitnessGeek app...');
    await axios.post(`${BASE_URL}/api/ai/test`, {
      provider: 'groq',
      appName: 'fitnessGeek'
    });
    console.log('✅ fitnessGeek call tracked\n');

    // Test 2: Call from storyGeek
    console.log('📚 Testing storyGeek app...');
    await axios.post(`${BASE_URL}/api/ai/test`, {
      provider: 'together',
      appName: 'storyGeek'
    });
    console.log('✅ storyGeek call tracked\n');

    // Test 3: Call from noteGeek
    console.log('📝 Testing noteGeek app...');
    await axios.post(`${BASE_URL}/api/ai/test`, {
      provider: 'gemini',
      appName: 'noteGeek'
    });
    console.log('✅ noteGeek call tracked\n');

    // Test 4: Another call from fitnessGeek
    console.log('📱 Another fitnessGeek call...');
    await axios.post(`${BASE_URL}/api/ai/test`, {
      provider: 'groq',
      appName: 'fitnessGeek'
    });
    console.log('✅ Second fitnessGeek call tracked\n');

    console.log('🎉 All app tracking tests completed!');
    console.log('Check the Usage & Cost tab to see the app breakdown.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAppTracking();
