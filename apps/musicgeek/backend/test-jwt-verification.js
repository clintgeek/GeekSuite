#!/usr/bin/env node

/**
 * Simple test to verify MusicGeek backend can verify BaseGeek JWT tokens
 * This tests the core SSO integration without needing a real user
 */

const jwt = require('jsonwebtoken');
const axios = require('axios');

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'CHANGE_ME_SET_JWT_SECRET';
const MUSICGEEK_API = 'http://localhost:3001';

async function testJWTVerification() {
  console.log('🔐 Testing MusicGeek JWT Token Verification\n');

  try {
    // Create a test token with the shared JWT_SECRET (simulating BaseGeek)
    console.log('1️⃣  Creating test JWT token (simulating BaseGeek)...');
    const testUser = {
      id: 'test-user-id-12345',
      username: 'testuser',
      email: 'test@example.com',
      app: 'musicgeek',
    };

    const testToken = jwt.sign(testUser, JWT_SECRET, { expiresIn: '1h' });
    console.log('✅ Token created successfully');
    console.log('   Token:', testToken.substring(0, 30) + '...\n');

    // Test token verification with MusicGeek backend
    console.log('2️⃣  Testing token verification with MusicGeek...');
    const response = await axios.get(`${MUSICGEEK_API}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${testToken}`,
      },
    });

    console.log('✅ Token verified successfully!');
    console.log('   Response:', JSON.stringify(response.data, null, 2));
    console.log('\n🎉 JWT integration working correctly!');
    console.log('\n📝 This proves MusicGeek can verify tokens from BaseGeek');
    console.log('   using the shared JWT_SECRET.');
  } catch (error) {
    if (error.response) {
      console.error('❌ Verification failed:');
      console.error('   Status:', error.response.status);
      console.error('   Error:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('❌ No response from server');
      console.error('   Make sure MusicGeek backend is running:');
      console.error('   cd /Users/ccrocker/projects/MusicGeek/backend && npm start');
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

console.log('⚠️  Prerequisites:');
console.log('   - MusicGeek backend must be running (npm start)');
console.log('   - JWT_SECRET must match BaseGeek\n');

testJWTVerification();
