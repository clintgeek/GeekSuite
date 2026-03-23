import UserStats from "../models/UserStats.js";
import UserProgress from "../models/UserProgress.js";
import UserVocabulary from "../models/UserVocabulary.js";
import { sendSuccess, sendError } from "../utils/responses.js";

// Get dashboard stats for user
export const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get or create user stats
    let userStats = await UserStats.findOne({ userId });
    if (!userStats) {
      userStats = await UserStats.create({ userId });
    }

    // Count vocabulary words learned
    const vocabCount = await UserVocabulary.countDocuments({ userId });

    // Count lessons completed
    const lessonsCompleted = await UserProgress.countDocuments({
      userId,
      status: "completed"
    });

    // Get weekly activity (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weeklyProgress = await UserProgress.find({
      userId,
      completedAt: { $gte: weekAgo }
    }).sort({ completedAt: 1 });

    // Build daily XP data
    const dailyXp = {};
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Initialize all days to 0
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayName = dayNames[date.getDay()];
      dailyXp[dayName] = 0;
    }

    // Sum XP by day
    weeklyProgress.forEach(progress => {
      const date = new Date(progress.completedAt);
      const dayName = dayNames[date.getDay()];
      dailyXp[dayName] = (dailyXp[dayName] || 0) + (progress.xpEarned || 0);
    });

    const weeklyActivity = Object.entries(dailyXp).map(([day, xp]) => ({
      day,
      xp
    }));

    return sendSuccess(res, {
      streak: userStats.currentStreak,
      totalXp: userStats.totalXp,
      level: userStats.level,
      lessonsCompleted,
      vocabularyLearned: vocabCount,
      longestStreak: userStats.longestStreak,
      dailyGoalXp: userStats.dailyGoalXp,
      weeklyActivity
    });
  } catch (error) {
    console.error("Error getting dashboard stats:", error);
    return sendError(res, { message: "Failed to get stats" }, 500);
  }
};

// Get user achievements
export const getAchievements = async (req, res) => {
  try {
    const userId = req.user.userId;

    const userStats = await UserStats.findOne({ userId });

    // Define all available achievements
    const allAchievements = [
      { id: "first_lesson", name: "First Steps", description: "Complete your first lesson", icon: "🎯" },
      { id: "streak_3", name: "On Fire", description: "3-day streak", icon: "🔥" },
      { id: "streak_7", name: "Week Warrior", description: "7-day streak", icon: "⚡" },
      { id: "streak_30", name: "Dedicated Learner", description: "30-day streak", icon: "🏆" },
      { id: "vocab_50", name: "Word Collector", description: "Learn 50 words", icon: "📚" },
      { id: "vocab_100", name: "Vocabulary Master", description: "Learn 100 words", icon: "🎓" },
      { id: "xp_500", name: "XP Hunter", description: "Earn 500 XP", icon: "⭐" },
      { id: "xp_1000", name: "XP Champion", description: "Earn 1000 XP", icon: "🌟" },
      { id: "lessons_10", name: "Lesson Pro", description: "Complete 10 lessons", icon: "📖" },
      { id: "perfect_score", name: "Perfectionist", description: "Get 100% on a lesson", icon: "💯" }
    ];

    const unlockedIds = new Set((userStats?.achievements || []).map(a => a.achievementId));

    const achievements = allAchievements.map(a => ({
      ...a,
      unlocked: unlockedIds.has(a.id),
      unlockedAt: userStats?.achievements?.find(ua => ua.achievementId === a.id)?.unlockedAt
    }));

    // Calculate milestone progress
    const vocabCount = await UserVocabulary.countDocuments({ userId });
    const lessonsCompleted = await UserProgress.countDocuments({ userId, status: "completed" });

    const milestones = [
      {
        name: "Vocabulary",
        current: vocabCount,
        target: 100,
        icon: "📝"
      },
      {
        name: "Lessons",
        current: lessonsCompleted,
        target: 20,
        icon: "📚"
      },
      {
        name: "XP",
        current: userStats?.totalXp || 0,
        target: 1000,
        icon: "⭐"
      }
    ];

    return sendSuccess(res, {
      achievements,
      milestones
    });
  } catch (error) {
    console.error("Error getting achievements:", error);
    return sendError(res, { message: "Failed to get achievements" }, 500);
  }
};

// Record activity (called when user completes something)
export const recordActivity = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { xpEarned = 0 } = req.body;

    let userStats = await UserStats.findOne({ userId });
    if (!userStats) {
      userStats = await UserStats.create({ userId });
    }

    // Update streak
    userStats.updateStreak();

    // Add XP
    userStats.totalXp += xpEarned;
    userStats.calculateLevel();

    await userStats.save();

    return sendSuccess(res, {
      streak: userStats.currentStreak,
      totalXp: userStats.totalXp,
      level: userStats.level
    });
  } catch (error) {
    console.error("Error recording activity:", error);
    return sendError(res, { message: "Failed to record activity" }, 500);
  }
};
