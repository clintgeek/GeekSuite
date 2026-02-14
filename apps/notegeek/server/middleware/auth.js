import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const protect = async (req, res, next) => {
  let token;

  // Check for Authorization header and Bearer token format
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header (split 'Bearer TOKEN')
      token = req.headers.authorization.split(' ')[1];

      // Verify token using the secret
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Find the user associated with the token's ID
      // Exclude the passwordHash field from the result
      req.user = await User.findById(decoded.id).select('-passwordHash');

      if (!req.user) {
        // If user associated with token not found (e.g., deleted)
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }

      // Token is valid, user found, proceed to the next middleware/route handler
      next();
    } catch (error) {
      console.error('Token verification failed:', error.message);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    // No token found in the header
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

export { protect };