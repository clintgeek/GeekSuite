function generateToken(user, app = 'basegeek') {
  return jwt.sign(
    {
      id: user._id, // Changed from 'sub' to 'id' for consistency
      username: user.username,
      email: user.email,
      app: app // Add app claim to identify the source application
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

router.post('/login', authLimiter, async (req, res) => {
  try {
    // Handle both formats: { identifier, password } or { email/username, password }
    const { identifier, email, username, password, app, redirectUrl } = req.body;
    const loginIdentifier = identifier || email || username;

    // Validation
    if (!loginIdentifier || !password) {
      return res.status(400).json({
        message: 'Identifier (username or email) and password are required',
        code: 'LOGIN_MISSING_FIELDS'
      });
    }

    // Find user by username or email
    const user = await User.findOne({
      $or: [
        { username: loginIdentifier },
        { email: loginIdentifier.toLowerCase() }
      ]
    });

    if (!user) {
      return res.status(401).json({
        message: 'Invalid credentials',
        code: 'LOGIN_INVALID_CREDENTIALS'
      });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({
        message: 'Invalid credentials',
        code: 'LOGIN_INVALID_CREDENTIALS'
      });
    }

    const token = generateToken(user, app || 'basegeek');

    // If redirectUrl is provided, redirect with token
    if (redirectUrl) {
      const redirectWithToken = new URL(redirectUrl);
      redirectWithToken.searchParams.set('token', token);
      return res.redirect(redirectWithToken.toString());
    }

    // Otherwise return JSON response
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profile: user.profile
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({
      message: err.message,
      code: 'LOGIN_ERROR'
    });
  }
});