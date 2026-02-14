const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

// Mock authentication token (in real app, this would be a valid JWT)
const mockToken = 'mock-jwt-token';

async function testAI() {
  console.log('🧪 Testing AI Integration...\n');

  try {
    // Test 1: Get AI status
    console.log('1. Testing GET /api/ai/status...');
    const statusResponse = await axios.get(`${BASE_URL}/api/ai/status`, {
      headers: { 'Authorization': `Bearer ${mockToken}` }
    });

    console.log('✅ AI status retrieved successfully');
    console.log('Status:', JSON.stringify(statusResponse.data.data, null, 2));
    console.log('');

    // Test 2: Test food parsing
    console.log('2. Testing POST /api/ai/parse-food...');
    const parseResponse = await axios.post(`${BASE_URL}/api/ai/parse-food`, {
      description: '2 chicken tacos and a dos equis',
      userContext: { dietary_preferences: 'none' }
    }, {
      headers: { 'Authorization': `Bearer ${mockToken}` }
    });

    console.log('✅ Food parsing successful');
    console.log('Parsed result:', JSON.stringify(parseResponse.data.data, null, 2));
    console.log('');

    console.log('🎉 AI integration test passed!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testAI().catch(console.error);
