const jwt = require('jsonwebtoken');

// JWT secret - should match baseGeek's secret
const JWT_SECRET = 'REDACTED_JWT_SECRET';

// Get token from command line argument
const token = process.argv[2];

if (!token) {
  console.log('Usage: node decode-token.js <token>');
  process.exit(1);
}

try {
  const decoded = jwt.verify(token, JWT_SECRET);
  console.log('Decoded token:');
  console.log(JSON.stringify(decoded, null, 2));
} catch (error) {
  console.error('Error decoding token:', error.message);
}