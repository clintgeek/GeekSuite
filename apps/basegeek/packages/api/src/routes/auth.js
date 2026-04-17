import express from 'express';
import rateLimit from 'express-rate-limit';
import authService from '../services/authService.js';
import { authenticateToken } from '../middleware/auth.js';
import { User } from '../models/user.js';
import jwt from 'jsonwebtoken';

// SSO Cookie Configuration
// In local/dev we omit domain so cookies apply to localhost redirects.
const SSO_COOKIE_DOMAIN =
    process.env.SSO_COOKIE_DOMAIN ||
    (process.env.NODE_ENV === 'production' ? '.clintgeek.com' : undefined);
const SSO_COOKIE_SECURE = process.env.NODE_ENV === 'production';
const SSO_COOKIE_SAMESITE = 'lax'; // 'lax' allows cookies on top-level navigations

/**
 * Set SSO cookies for cross-subdomain authentication
 * This enables gradual SSO rollout - apps can read from cookie OR localStorage
 * @param {Response} res - Express response object
 * @param {string} token - JWT access token
 * @param {string} refreshToken - JWT refresh token
 */
function setSSOCookies(res, token, refreshToken) {
    const baseCookieOptions = {
        path: '/',
        httpOnly: true,
        secure: SSO_COOKIE_SECURE,
        sameSite: SSO_COOKIE_SAMESITE,
    };
    if (SSO_COOKIE_DOMAIN) baseCookieOptions.domain = SSO_COOKIE_DOMAIN;

    res.cookie('geek_token', token, {
        ...baseCookieOptions,
        maxAge: 60 * 60 * 1000 // 1 hour — matches JWT_EXPIRES_IN
    });
    res.cookie('geek_refresh_token', refreshToken, {
        ...baseCookieOptions,
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days — matches REFRESH_TOKEN_EXPIRES_IN
    });
}

/**
 * Clear SSO cookies on logout
 * @param {Response} res - Express response object
 */
function clearSSOCookies(res) {
    const cookieOptions = {
        path: '/',
        httpOnly: true,
        secure: SSO_COOKIE_SECURE,
        sameSite: SSO_COOKIE_SAMESITE
    };
    if (SSO_COOKIE_DOMAIN) cookieOptions.domain = SSO_COOKIE_DOMAIN;
    res.clearCookie('geek_token', cookieOptions);
    res.clearCookie('geek_refresh_token', cookieOptions);
}

const router = express.Router();

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: {
        message: 'Too many login attempts, please try again later',
        code: 'AUTH_RATE_LIMIT'
    }
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post('/login', authLimiter, async (req, res) => {
    try {
        console.log('Login request received:', {
            body: req.body,
            headers: req.headers,
            ip: req.ip
        });

        const { identifier, password, app } = req.body;

        // Validate required fields
        if (!identifier || !password) {
            console.error('Missing credentials:', {
                identifier: !!identifier,
                password: !!password,
                body: req.body
            });
            return res.status(400).json({
                message: 'Missing credentials',
                code: 'LOGIN_ERROR'
            });
        }

        // Validate app
        if (!app || !['basegeek', 'notegeek', 'bujogeek', 'fitnessgeek', 'storygeek', 'startgeek', 'flockgeek', 'musicgeek', 'babelgeek', 'bookgeek', 'gamegeek', 'photogeek', 'dashgeek'].includes(app.toLowerCase())) {
            console.error('Invalid app:', {
                app,
                validApps: ['basegeek', 'notegeek', 'bujogeek', 'fitnessgeek', 'storygeek', 'startgeek', 'flockgeek', 'musicgeek', 'babelgeek', 'bookgeek', 'gamegeek', 'photogeek', 'dashgeek']
            });
            return res.status(400).json({
                message: 'Invalid app',
                code: 'LOGIN_ERROR'
            });
        }

        console.log('Attempting login for:', {
            identifier,
            app: app.toLowerCase(),
            timestamp: new Date().toISOString()
        });

        const result = await authService.login(identifier, password, app.toLowerCase());

        console.log('Auth service result:', result);
        console.log('Result user object:', result.user);
        console.log('Result user keys:', Object.keys(result.user));

        console.log('Login successful for:', {
            identifier,
            app: app.toLowerCase(),
            userId: result.user.id,
            timestamp: new Date().toISOString()
        });

        // Track last login
        try {
            await User.findByIdAndUpdate(result.user.id, { lastLogin: new Date() });
        } catch (loginTrackErr) {
            console.error('Failed to update lastLogin:', loginTrackErr.message);
        }

        // Set SSO cookies for cross-subdomain auth (backward compatible)
        setSSOCookies(res, result.token, result.refreshToken);

        res.json(result);
    } catch (error) {
        console.error('Login error:', {
            message: error.message,
            stack: error.stack,
            identifier: req.body.identifier,
            app: req.body.app,
            timestamp: new Date().toISOString()
        });

        // Determine appropriate status code
        const statusCode = error.message.includes('Invalid credentials') ? 401 : 500;

        res.status(statusCode).json({
            message: error.message,
            code: 'LOGIN_ERROR'
        });
    }
});

// @desc    Validate token
// @route   POST /api/auth/validate
// @access  Public
router.post('/validate', async (req, res) => {
    try {
        const { token, app } = req.body;
        const result = await authService.validateToken(token);
        res.json({
            valid: true,
            user: {
                id: result.id,
                username: result.username,
                email: result.email,
                app: result.app
            }
        });
    } catch (error) {
        res.status(401).json({
            message: error.message,
            code: 'TOKEN_VALIDATION_ERROR',
            valid: false
        });
    }
});

// @desc    Refresh token
// @route   POST /api/auth/refresh
// @access  Public
router.post('/refresh', async (req, res) => {
    try {
        const bodyRefreshToken = req.body?.refreshToken;
        const cookieRefreshToken = req.cookies?.geek_refresh_token;
        const refreshToken = bodyRefreshToken || cookieRefreshToken;
        const app = req.body?.app;

        if (!refreshToken) {
            return res.status(400).json({
                message: 'Refresh token is required',
                code: 'TOKEN_REFRESH_ERROR'
            });
        }

        // Validate the refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user) {
            throw new Error('User not found');
        }

        // Generate new access token
        const accessToken = authService.generateToken(user, app);

        // Generate new refresh token
        const newRefreshToken = jwt.sign(
            { userId: user._id },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: '7d' }
        );

        const responseData = {
            token: accessToken,
            refreshToken: newRefreshToken,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                app
            }
        };

        // Set SSO cookies for cross-subdomain auth (backward compatible)
        setSSOCookies(res, accessToken, newRefreshToken);

        res.json(responseData);
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(401).json({
            message: error.message,
            code: 'TOKEN_REFRESH_ERROR'
        });
    }
});

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const profile = await authService.getUserProfile(userId);
        res.json(profile);
    } catch (error) {
        res.status(404).json({
            message: error.message,
            code: 'PROFILE_ERROR'
        });
    }
});

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, app } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [{ username }, { email }]
        });

        if (existingUser) {
            return res.status(400).json({
                message: 'User already exists',
                code: 'USER_EXISTS'
            });
        }

        // Create new user
        const user = new User({
            username,
            email,
            passwordHash: password, // Model expects passwordHash, not password
            profile: {},
            lastLogin: new Date()
        });

        await user.save();

        // Generate tokens
        const token = authService.generateToken(user, app);
        const refreshToken = authService.generateRefreshToken(user);

        const responseData = {
            token,
            refreshToken,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                profile: user.profile,
                app
            }
        };

        // Set SSO cookies for cross-subdomain auth (backward compatible)
        setSSOCookies(res, token, refreshToken);

        res.status(201).json(responseData);
    } catch (error) {
        console.error('Registration error:', error);
        res.status(400).json({
            message: error.message,
            code: 'REGISTER_ERROR'
        });
    }
});


// @desc    Reset authenticated user's own password
// @route   POST /api/auth/reset-password
// @access  Private
router.post('/reset-password', authenticateToken, async (req, res) => {
    try {
        const { newPassword } = req.body;

        if (!newPassword) {
            return res.status(400).json({
                message: 'New password is required',
                code: 'MISSING_DATA'
            });
        }

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                message: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        // Update password
        user.passwordHash = newPassword;
        await user.save();

        res.json({
            message: 'Password updated successfully',
            code: 'PASSWORD_UPDATED'
        });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({
            message: error.message,
            code: 'RESET_ERROR'
        });
    }
});

// @desc    Logout user (clears SSO cookies)
// @route   POST /api/auth/logout
// @access  Public
router.post('/logout', (req, res) => {
    // Clear SSO cookies
    clearSSOCookies(res);

    res.json({
        message: 'Logged out successfully',
        code: 'LOGOUT_SUCCESS'
    });
});

export default router;