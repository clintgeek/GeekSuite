const jwt = require('jsonwebtoken');
const config = require('./src/config/config');

// Test SSO token validation
async function testSSOValidation() {
  console.log('Testing SSO Token Validation\n');
  console.log('Configuration:');
  console.log('- JWT_SECRET:', config.jwt.secret.substring(0, 20) + '...');
  console.log('- BaseGeek URL:', config.baseGeekUrl);
  console.log();

  // Create a test SSO token (simulating what baseGeek would send)
  const testUser = {
    id: '507f1f77bcf86cd799439011', // MongoDB ObjectId format
    username: 'testuser',
    email: 'testuser@example.com',
  };

  const token = jwt.sign(testUser, config.jwt.secret, { expiresIn: '7d' });

  console.log('Generated Test SSO Token:');
  console.log('Token:', token.substring(0, 50) + '...');
  console.log();

  // Verify the token (what our endpoint will do)
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    console.log('✅ Token Verification Successful!');
    console.log('Decoded payload:', decoded);
    console.log();

    console.log('Test Payload for API:');
    console.log(JSON.stringify({ token }, null, 2));
    console.log();

    console.log('Expected Response Format:');
    console.log(
      JSON.stringify(
        {
          success: true,
          data: {
            user: {
              id: decoded.id,
              username: decoded.username,
              email: decoded.email,
            },
            token: token,
          },
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error('❌ Token Verification Failed:', error.message);
  }
}

testSSOValidation();
