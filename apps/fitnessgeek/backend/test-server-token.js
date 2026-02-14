const jwt = require('jsonwebtoken');

// Use the exact same logic as the server
const JWT_SECRET = process.env.JWT_SECRET || 'REDACTED_JWT_SECRET';

console.log('Using JWT_SECRET:', JWT_SECRET);

// Test user data
const testUser = {
  id: '507f1f77bcf86cd799439011',
  email: 'test@example.com',
  username: 'testuser'
};

// Generate token
const token = jwt.sign(testUser, JWT_SECRET, { expiresIn: '24h' });

console.log('\nGenerated token:');
console.log(token);

// Test verification with server logic
const authHeader = `Bearer ${token}`;
const tokenFromHeader = authHeader && authHeader.split(' ')[1];

console.log('\nToken from header:', tokenFromHeader);

try {
  const decoded = jwt.verify(tokenFromHeader, JWT_SECRET);
  console.log('\n✅ Token verification successful!');
  console.log('Decoded payload:', decoded);

  // Test user object creation (same as server)
  const user = {
    id: decoded.id,
    email: decoded.email,
    username: decoded.username
  };
  console.log('User object:', user);

} catch (error) {
  console.log('\n❌ Token verification failed:');
  console.log('Error:', error.message);
  console.log('Error name:', error.name);
}