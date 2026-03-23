#!/usr/bin/env node

/**
 * Quick script to register a test user for MusicGeek SSO testing
 */

const axios = require('axios');

const MUSICGEEK_API = 'http://localhost:3001';

async function registerTestUser() {
  console.log('🎸 Registering test user for MusicGeek...\n');

  const testUser = {
    username: 'musicgeektest',
    email: 'musicgeektest@example.com',
    password: 'Test123!',
    app: 'musicgeek',
  };

  try {
    console.log('Attempting to register:', testUser.email);

    const response = await axios.post(`${MUSICGEEK_API}/api/auth/register`, {
      username: testUser.username,
      email: testUser.email,
      password: testUser.password,
    });

    console.log('✅ User registered successfully!\n');
    console.log('Test Credentials:');
    console.log('  Email:', testUser.email);
    console.log('  Password:', testUser.password);
    console.log('\nUser Info:');
    console.log(JSON.stringify(response.data.data.user, null, 2));
    console.log('\n📝 Update test-sso-integration.js with these credentials');
  } catch (error) {
    if (error.response) {
      console.error('❌ Registration failed:');
      console.error('   Status:', error.response.status);
      console.error('   Error:', JSON.stringify(error.response.data, null, 2));

      if (error.response.status === 400 && error.response.data.error?.message?.includes('exists')) {
        console.log('\n💡 User already exists. You can use these credentials for testing:');
        console.log('   Email:', testUser.email);
        console.log('   Password:', testUser.password);
      }
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

registerTestUser();
