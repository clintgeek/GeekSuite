import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { User } from '../models/user.js';

const router = express.Router();

// ────────────────────────────────────────────
// Helper: format user identity for responses
// ────────────────────────────────────────────
function formatIdentity(user) {
    return {
        id: user._id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
    };
}

// ════════════════════════════════════════════
//  BOOTSTRAP — the one call every app makes
// ════════════════════════════════════════════

// @desc    Bootstrap payload — identity + profile + preferences + appPreferences
// @route   GET /api/users/bootstrap
// @access  Private
router.get('/bootstrap', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
        }
        res.json({
            identity: formatIdentity(user),
            profile: user.profile,
            preferences: user.preferences,
            appPreferences: user.appPreferences instanceof Map
                ? Object.fromEntries(user.appPreferences)
                : (user.appPreferences || {}),
        });
    } catch (err) {
        console.error('Bootstrap error:', err);
        res.status(500).json({ message: err.message, code: 'BOOTSTRAP_ERROR' });
    }
});

// ════════════════════════════════════════════
//  IDENTITY
// ════════════════════════════════════════════

// @desc    Get current user identity
// @route   GET /api/users/me
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
        }
        res.json({
            user: {
                ...formatIdentity(user),
                profile: user.profile,
                preferences: user.preferences,
            }
        });
    } catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({ message: err.message, code: 'GET_USER_ERROR' });
    }
});

// ════════════════════════════════════════════
//  PROFILE (human-facing info)
// ════════════════════════════════════════════

// @desc    Get profile
// @route   GET /api/users/profile
// @access  Private
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
        res.json({ profile: user.profile });
    } catch (err) {
        res.status(500).json({ message: err.message, code: 'GET_PROFILE_ERROR' });
    }
});

// @desc    Update profile (partial merge)
// @route   PATCH /api/users/profile
// @access  Private
router.patch('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });

        const { username, email, ...profileFields } = req.body;

        // Identity-level fields (username/email) can be patched here too
        if (username !== undefined) user.username = username;
        if (email !== undefined) user.email = email.toLowerCase();

        // Merge profile fields
        const allowedProfileFields = ['displayName', 'avatarUrl', 'bio', 'timezone', 'locale', 'country'];
        for (const key of allowedProfileFields) {
            if (profileFields[key] !== undefined) {
                user.profile[key] = profileFields[key];
            }
        }
        user.markModified('profile');

        await user.save();
        res.json({
            identity: formatIdentity(user),
            profile: user.profile,
        });
    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ message: err.message, code: 'UPDATE_PROFILE_ERROR' });
    }
});

// Backward compat: PUT /profile still works
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });

        const { username, email, profile, preferences } = req.body;
        if (username) user.username = username;
        if (email) user.email = email.toLowerCase();
        if (profile) {
            Object.assign(user.profile, profile);
            user.markModified('profile');
        }
        if (preferences) {
            Object.assign(user.preferences, preferences);
            user.markModified('preferences');
        }
        await user.save();
        res.json({
            user: {
                ...formatIdentity(user),
                profile: user.profile,
                preferences: user.preferences,
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message, code: 'UPDATE_PROFILE_ERROR' });
    }
});

// ════════════════════════════════════════════
//  PREFERENCES (cross-app global settings)
// ════════════════════════════════════════════

// @desc    Get global preferences
// @route   GET /api/users/preferences
// @access  Private
router.get('/preferences', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
        res.json({ preferences: user.preferences });
    } catch (err) {
        res.status(500).json({ message: err.message, code: 'GET_PREFERENCES_ERROR' });
    }
});

// @desc    Update global preferences (partial merge)
// @route   PATCH /api/users/preferences
// @access  Private
router.patch('/preferences', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });

        const allowedFields = ['theme', 'accentColor', 'defaultApp', 'dateFormat', 'timeFormat', 'startOfWeek'];
        for (const key of allowedFields) {
            if (req.body[key] !== undefined) {
                user.preferences[key] = req.body[key];
            }
        }
        user.markModified('preferences');
        await user.save();
        res.json({ preferences: user.preferences });
    } catch (err) {
        console.error('Update preferences error:', err);
        res.status(500).json({ message: err.message, code: 'UPDATE_PREFERENCES_ERROR' });
    }
});

// ════════════════════════════════════════════
//  APP PREFERENCES (namespaced per-app)
// ════════════════════════════════════════════

// @desc    Get all app preferences
// @route   GET /api/users/preferences/apps
// @access  Private
router.get('/preferences/apps', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
        const prefs = user.appPreferences instanceof Map
            ? Object.fromEntries(user.appPreferences)
            : (user.appPreferences || {});
        res.json({ appPreferences: prefs });
    } catch (err) {
        res.status(500).json({ message: err.message, code: 'GET_APP_PREFS_ERROR' });
    }
});

// @desc    Get app preferences for a specific app
// @route   GET /api/users/preferences/:app
// @access  Private
router.get('/preferences/:app', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
        const appName = req.params.app.toLowerCase();
        const prefs = user.appPreferences?.get?.(appName) || user.appPreferences?.[appName] || {};
        res.json({ app: appName, preferences: prefs });
    } catch (err) {
        res.status(500).json({ message: err.message, code: 'GET_APP_PREFS_ERROR' });
    }
});

// @desc    Update app preferences for a specific app (partial merge)
// @route   PATCH /api/users/preferences/:app
// @access  Private
router.patch('/preferences/:app', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });

        const appName = req.params.app.toLowerCase();
        const existing = user.appPreferences?.get?.(appName) || {};
        const merged = { ...existing, ...req.body };
        user.appPreferences.set(appName, merged);
        user.markModified('appPreferences');
        await user.save();
        res.json({ app: appName, preferences: merged });
    } catch (err) {
        console.error('Update app preferences error:', err);
        res.status(500).json({ message: err.message, code: 'UPDATE_APP_PREFS_ERROR' });
    }
});

// ════════════════════════════════════════════
//  ADMIN — list, create, delete
// ════════════════════════════════════════════

// @desc    Get all users
// @route   GET /api/users
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
        const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);

        const [users, total] = await Promise.all([
            User.find({}, '-passwordHash').skip(skip).limit(limit).lean(),
            User.countDocuments({}),
        ]);

        res.json({
            users: users.map(user => ({
                ...formatIdentity(user),
                profile: user.profile,
                preferences: user.preferences,
            })),
            limit,
            skip,
            total,
        });
    } catch (err) {
        console.error('Get all users error:', err);
        res.status(500).json({ message: err.message, code: 'GET_ALL_USERS_ERROR' });
    }
});

// @desc    Create user (admin use)
// @route   POST /api/users
// @access  Private
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { username, email, password, profile, preferences } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'username, email, and password are required', code: 'VALIDATION_ERROR' });
        }

        const existing = await User.findOne({ $or: [{ username }, { email: email.toLowerCase() }] });
        if (existing) {
            return res.status(400).json({ message: 'User already exists', code: 'USER_EXISTS' });
        }

        const user = new User({
            username,
            email: email.toLowerCase(),
            passwordHash: password,
            profile: profile || {},
            preferences: preferences || {},
        });
        await user.save();

        res.status(201).json({
            identity: formatIdentity(user),
            profile: user.profile,
            preferences: user.preferences,
        });
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ message: err.message, code: 'CREATE_USER_ERROR' });
    }
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
        }
        await user.deleteOne();
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ message: err.message, code: 'DELETE_USER_ERROR' });
    }
});

export default router;