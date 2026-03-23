const UserProfile = require('../models/User'); // Now references UserProfile model
const { NotFoundError } = require('../utils/errors');

class UserService {
  /**
   * Get or create user profile by baseGeek user ID
   * @param {string} userId - baseGeek user ID from JWT token
   * @param {object} userData - user data from JWT (email, username)
   */
  async getOrCreateProfile(userId, userData = {}) {
    let profile = await UserProfile.findOne({ userId });

    if (!profile) {
      profile = await UserProfile.create({
        userId,
        email: userData.email,
        displayName: userData.username || userData.email?.split('@')[0],
      });
    }

    return this._mapProfile(profile);
  }

  /**
   * Get user profile by baseGeek user ID
   */
  async getUserById(userId) {
    const profile = await UserProfile.findOne({ userId });
    if (!profile) {
      throw new NotFoundError('User profile not found');
    }
    return this._mapProfile(profile);
  }

  /**
   * Get user profile by email (cached in profile)
   */
  async getUserByEmail(email) {
    const profile = await UserProfile.findOne({ email });
    if (!profile) {
      throw new NotFoundError('User profile not found');
    }
    return this._mapProfile(profile);
  }

  /**
   * Update user profile
   */
  async updateUser(userId, updates) {
    // First ensure the profile exists
    let profile = await UserProfile.findOne({ userId });

    if (!profile) {
      // Create profile if it doesn't exist
      profile = await UserProfile.create({
        userId,
        email: updates.email || '',
        displayName: updates.display_name || 'User',
      });
    }

    // Build update data
    const updateData = {};
    if (updates.display_name) updateData.displayName = updates.display_name;
    if (updates.bio) updateData.bio = updates.bio;
    if (updates.avatar_url) updateData.avatarUrl = updates.avatar_url;
    if (updates.preferences) updateData.preferences = updates.preferences;

    // Only update if there's data to update
    if (Object.keys(updateData).length > 0) {
      profile = await UserProfile.findOneAndUpdate({ userId }, { $set: updateData }, { new: true });
    }

    return this._mapProfile(profile);
  }

  /**
   * Delete user profile (note: does not delete baseGeek user)
   */
  async deleteUser(userId) {
    const profile = await UserProfile.findOneAndDelete({ userId });
    if (!profile) {
      throw new NotFoundError('User profile not found');
    }
    return { message: 'User profile deleted successfully' };
  }

  /**
   * Update user's active instrument
   */
  async setActiveInstrument(userId, instrumentId) {
    const profile = await UserProfile.findOneAndUpdate(
      { userId },
      { activeInstrumentId: instrumentId },
      { new: true }
    );

    if (!profile) {
      throw new NotFoundError('User profile not found');
    }

    return this._mapProfile(profile);
  }

  /**
   * Add or update instrument progress
   */
  async updateInstrumentProgress(userId, instrumentId, progressData) {
    const profile = await UserProfile.findOne({ userId });
    if (!profile) {
      throw new NotFoundError('User profile not found');
    }

    // Find existing instrument or add new one
    const instrumentIndex = profile.instruments.findIndex(
      (i) => i.instrumentId.toString() === instrumentId.toString()
    );

    if (instrumentIndex >= 0) {
      // Update existing
      Object.assign(profile.instruments[instrumentIndex], progressData);
    } else {
      // Add new
      profile.instruments.push({
        instrumentId,
        ...progressData,
      });
    }

    await profile.save();
    return this._mapProfile(profile);
  }

  /**
   * Add achievement to user
   */
  async addAchievement(userId, achievementId) {
    const profile = await UserProfile.findOne({ userId });
    if (!profile) {
      throw new NotFoundError('User profile not found');
    }

    // Check if already earned
    const hasAchievement = profile.achievements.some(
      (a) => a.achievementId.toString() === achievementId.toString()
    );

    if (!hasAchievement) {
      profile.achievements.push({
        achievementId,
        earnedAt: new Date(),
      });
      await profile.save();
    }

    return this._mapProfile(profile);
  }

  /**
   * Update gamification stats
   */
  async updateGamification(userId, gamificationData) {
    const profile = await UserProfile.findOneAndUpdate(
      { userId },
      { $set: { gamification: gamificationData } },
      { new: true }
    );

    if (!profile) {
      throw new NotFoundError('User profile not found');
    }

    return this._mapProfile(profile);
  }

  // Helper to map Mongo doc to expected API response format
  _mapProfile(profile) {
    return {
      id: profile._id,
      userId: profile.userId,
      email: profile.email,
      display_name: profile.displayName,
      name: profile.name,
      bio: profile.bio,
      avatar_url: profile.avatarUrl,
      total_xp: profile.gamification?.totalXp || 0,
      level: profile.gamification?.level || 1,
      current_streak: profile.gamification?.currentStreak || 0,
      longest_streak: profile.gamification?.longestStreak || 0,
      last_practice_date: profile.gamification?.lastPracticeDate,
      instruments: profile.instruments,
      active_instrument_id: profile.activeInstrumentId,
      achievements: profile.achievements,
      preferences: profile.preferences,
      created_at: profile.createdAt,
      updated_at: profile.updatedAt,
    };
  }
}

module.exports = new UserService();
