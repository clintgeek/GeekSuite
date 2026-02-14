const Achievement = require('../models/Achievement');
const User = require('../models/User');

class AchievementService {
  async getAllAchievements() {
    return await Achievement.find().sort({ xpReward: 1, name: 1 });
  }

  async getUserAchievements(userId) {
    const user = await User.findOne({ userId }).populate('achievements.achievementId');
    if (!user) return [];

    return user.achievements
      .map((ua) => ({
        id: ua.achievementId._id,
        name: ua.achievementId.name,
        description: ua.achievementId.description,
        criteria: ua.achievementId.criteria,
        xp_reward: ua.achievementId.xpReward,
        earned_at: ua.earnedAt,
      }))
      .sort((a, b) => b.earned_at - a.earned_at);
  }

  async checkAndAwardAchievement(userId, achievementName) {
    const achievement = await Achievement.findOne({ name: achievementName });
    if (!achievement) return null;

    const user = await User.findOne({ userId });
    if (!user) return null;

    // Check if already earned
    const alreadyEarned = user.achievements.some(
      (ua) => ua.achievementId.toString() === achievement._id.toString()
    );

    if (alreadyEarned) return null;

    // Award achievement
    user.achievements.push({
      achievementId: achievement._id,
      earnedAt: new Date(),
    });

    // Add XP
    user.gamification.totalXp = (user.gamification.totalXp || 0) + achievement.xpReward;

    // Recalculate level (simple logic here, or rely on progressService to sync later)
    // Ideally we should use progressService.calculateLevel but avoiding circular dependency if possible.
    // I'll just save here. progressService calls this method, so circular dependency is real if I import progressService here.
    // I will duplicate level calc logic or just let it be updated next time.
    // Actually, progressService calls this, so I should NOT call progressService back.
    // I'll just update XP.

    await user.save();

    return {
      achievement_id: achievement._id,
      user_id: userId,
      earned_at: new Date(),
    };
  }
}

module.exports = new AchievementService();
