const axios = require('axios');

const BASEGEEK_URL = process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com';
const MUSICGEEK_API = 'http://localhost:3001';

async function testSSO() {
  console.log('🎸 Testing MusicGeek SSO Integration with BaseGeek\n');

  try {
    // Test 1: Login via MusicGeek backend (which proxies to baseGeek)
    console.log('1️⃣  Testing login via MusicGeek backend...');
    console.log('   ⚠️  IMPORTANT: Update credentials below with a valid BaseGeek user');
    console.log('   See DOCS/TESTING_SSO.md for instructions on creating a test user\n');
    console.log('   BaseGeek URL:', BASEGEEK_URL);

    // TODO: Replace these with your actual test credentials
    const TEST_EMAIL = 'test@example.com';
    const TEST_PASSWORD = 'password123';

    const loginResponse = await axios.post(`${MUSICGEEK_API}/api/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    const { token, refreshToken, user } = loginResponse.data.data;
    console.log('✅ Login successful!');
    console.log('   User:', user.email);
    console.log('   App:', user.app);
    console.log('   Token:', token.substring(0, 20) + '...');
    console.log('   Refresh Token:', refreshToken ? refreshToken.substring(0, 20) + '...' : 'N/A');
    console.log();

    // Test 2: Verify token with MusicGeek
    console.log('2️⃣  Testing token verification (GET /me)...');
    const meResponse = await axios.get(`${MUSICGEEK_API}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log('✅ Token verified!');
    console.log('   Profile:', JSON.stringify(meResponse.data.data, null, 2));
    console.log();

    // Test 3: Test refresh token (if available)
    if (refreshToken) {
      console.log('3️⃣  Testing token refresh...');
      const refreshResponse = await axios.post(`${MUSICGEEK_API}/api/auth/refresh`, {
        refreshToken,
      });

      const { token: newToken, refreshToken: newRefreshToken } = refreshResponse.data.data;
      console.log('✅ Token refresh successful!');
      console.log('   New Token:', newToken.substring(0, 20) + '...');
      console.log(
        '   New Refresh Token:',
        newRefreshToken ? newRefreshToken.substring(0, 20) + '...' : 'N/A'
      );
      console.log();
    }

    // Test 4: Access protected endpoint
    console.log('4️⃣  Testing protected endpoint access...');
    const userResponse = await axios.get(`${MUSICGEEK_API}/api/users/${user.id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log('✅ Protected endpoint accessible!');
    console.log('   User data:', JSON.stringify(userResponse.data.data, null, 2));
    console.log();

    // Test 5: Logout
    console.log('5️⃣  Testing logout...');
    const logoutResponse = await axios.post(
      `${MUSICGEEK_API}/api/auth/logout`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log('✅ Logout successful!');
    console.log('   Message:', logoutResponse.data.message);
    console.log();

    console.log('🎉 All SSO integration tests passed!');
  } catch (error) {
    console.error('❌ Test failed:');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Error:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('   No response received from server');
      console.error('   Request URL:', error.config?.url);
      console.error('   Error:', error.message);
      console.error('   Code:', error.code);
    } else {
      console.error('   Error:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run tests
testSSO();
