const mongoose = require('mongoose');
const UserProgress = require('../models/UserProgress');
const User = require('../models/User');
const Lesson = require('../models/Lesson');
const PracticeSession = require('../models/PracticeSession');
const Achievement = require('../models/Achievement');
const config = require('../config/config');
const { NotFoundError } = require('../utils/errors');
const achievementService = require('./achievementService');

class ProgressService {
  calculateLevel(totalXP = 0) {
    if (!Number.isFinite(totalXP) || totalXP < 0) {
      return 1;
    }
    return Math.floor(Math.sqrt(totalXP / 100)) + 1;
  }

  calculateLessonXP({ estimatedTimeMinutes: estimated = 15, difficulty = 1 }) {
    const safeDuration = Number(estimated) > 0 ? Number(estimated) : 15;
    const durationBonus = Math.floor(safeDuration / 15) * 10;
    const difficultyBonus = (Number(difficulty) || 1) * 5;
    return config.xp.lessonComplete + durationBonus + difficultyBonus;
  }

  async updateUserXPAndLevel(userId, xpAmount) {
    const user = await User.findOne({ userId });
    if (!user) return;

    user.gamification.totalXp = (user.gamification.totalXp || 0) + xpAmount;
    const nextLevel = this.calculateLevel(user.gamification.totalXp);

    if (user.gamification.level !== nextLevel) {
      user.gamification.level = nextLevel;
    }

    await user.save();
    return { totalXP: user.gamification.totalXp, level: user.gamification.level };
  }

  async syncUserLevel(userId) {
    const user = await User.findOne({ userId });
    if (!user) return;

    const expectedLevel = this.calculateLevel(user.gamification.totalXp);
    if (user.gamification.level !== expectedLevel) {
      user.gamification.level = expectedLevel;
      await user.save();
    }
    return { totalXP: user.gamification.totalXp, level: expectedLevel };
  }

  async logPracticeFromLesson(userId, lesson) {
    const duration = Number(lesson.estimatedTimeMinutes || 0);
    if (!duration || duration <= 0) return;

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - duration * 60000);

    await PracticeSession.create({
      userId,
      startTime,
      endTime,
      durationMinutes: duration,
      notes: `Auto-logged from completing "${lesson.title}"`,
      lessonId: lesson._id,
    });

    await this.updateDailyStreak(userId, endTime);
  }

  async updateDailyStreak(userId, practiceDate) {
    if (!practiceDate) return;

    const user = await User.findOne({ userId });
    if (!user) return;

    const practiceDay = new Date(practiceDate);
    practiceDay.setUTCHours(0, 0, 0, 0);

    const lastDate = user.gamification.lastPracticeDate
      ? new Date(user.gamification.lastPracticeDate)
      : null;
    if (lastDate) lastDate.setUTCHours(0, 0, 0, 0);

    let currentStreak = user.gamification.currentStreak || 0;
    let longestStreak = user.gamification.longestStreak || 0;
    let awardXp = false;

    if (!lastDate) {
      currentStreak = 1;
      longestStreak = Math.max(1, longestStreak);
      awardXp = true;
    } else {
      const diffMs = practiceDay.getTime() - lastDate.getTime();
      const diffDays = Math.round(diffMs / 86400000);

      if (diffDays === 1) {
        currentStreak += 1;
        longestStreak = Math.max(currentStreak, longestStreak);
        awardXp = true;
      } else if (diffDays > 1) {
        currentStreak = 1;
        awardXp = true;
      }
      // If diffDays === 0, same day, do nothing
    }

    if (awardXp) {
      user.gamification.currentStreak = currentStreak;
      user.gamification.longestStreak = longestStreak;
      user.gamification.lastPracticeDate = practiceDay;
      await user.save();

      if (config.xp && config.xp.dailyStreak) {
        await this.updateUserXPAndLevel(userId, config.xp.dailyStreak);
      }

      if (currentStreak >= 3) {
        await achievementService.checkAndAwardAchievement(userId, '3-Day Streak');
      }
    }
  }

  async awardLessonAchievements(userId, _lesson) {
    const completedCount = await UserProgress.countDocuments({
      userId,
      'status.isCompleted': true,
    });

    const milestones = [
      { count: 1, name: 'First Strum' },
      { count: 5, name: 'Chord Conqueror' },
    ];

    for (const milestone of milestones) {
      if (completedCount >= milestone.count) {
        await achievementService.checkAndAwardAchievement(userId, milestone.name);
      }
    }

    await this.syncUserLevel(userId);
  }

  async awardKidSessionAchievement(userId, lesson) {
    const tags = lesson.tags || [];
    if (tags.includes('kid') && tags.includes('session')) {
      await achievementService.checkAndAwardAchievement(userId, 'First Kid Session');
    }
  }

  async markLessonComplete(userId, lessonId) {
    // Check if already completed
    const existing = await UserProgress.findOne({
      userId,
      lessonId,
      'status.isCompleted': true,
    });

    if (existing) return existing;

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) throw new NotFoundError('Lesson not found');

    const xpAward = this.calculateLessonXP(lesson);

    const progress = await UserProgress.findOneAndUpdate(
      { userId, lessonId },
      {
        $set: {
          'status.isCompleted': true,
          'status.completedAt': new Date(),
          'stats.xpGained': xpAward,
        },
        $setOnInsert: { 'status.startedAt': new Date() },
      },
      { new: true, upsert: true }
    );

    await this.logPracticeFromLesson(userId, lesson);
    await this.updateUserXPAndLevel(userId, xpAward);
    await this.awardLessonAchievements(userId, lesson);
    await this.awardKidSessionAchievement(userId, lesson);

    // Update instrument stats
    if (lesson.instrumentId) {
      const user = await User.findOne({ userId });
      const ui = user.instruments.find(
        (i) => i.instrumentId.toString() === lesson.instrumentId.toString()
      );
      if (ui) {
        ui.lessonsCompleted += 1;
        await user.save();
      }
    }

    return progress;
  }

  async getUserProgress(userId) {
    // userId is the BaseGeek user ID (string), not MongoDB _id
    const user = await User.findOne({ userId });
    if (!user) {
      // Create user profile if it doesn't exist
      const newUser = await User.create({
        userId,
        email: '', // Will be updated when user data is available
        displayName: 'User',
      });
      return {
        userId,
        completedLessons: 0,
        totalPracticeSessions: 0,
        totalPracticeTime: 0,
        currentStreak: 0,
        totalXp: 0,
        level: 1,
      };
    }

    const completedLessons = await UserProgress.countDocuments({
      userId,
      'status.isCompleted': true,
    });
    const totalPracticeSessions = await PracticeSession.countDocuments({ userId });

    const practiceTimeResult = await PracticeSession.aggregate([
      { $match: { userId: user._id } },
      { $group: { _id: null, total: { $sum: '$durationMinutes' } } },
    ]);
    const totalPracticeTime = practiceTimeResult[0]?.total || 0;

    const achievementsEarned = user.achievements.length;

    // Recent lessons
    const recentLessonsDocs = await UserProgress.find({ userId, 'status.isCompleted': true })
      .sort({ 'status.completedAt': -1 })
      .limit(5)
      .populate('lessonId', 'title');

    const recentLessons = recentLessonsDocs
      .filter((p) => p.lessonId) // Filter out null lessons (deleted lessons)
      .map((p) => ({
        id: p.lessonId._id,
        title: p.lessonId.title,
        completed_at: p.status.completedAt,
        xp_gained: p.stats.xpGained,
      }));

    // Recent sessions
    const recentSessionsDocs = await PracticeSession.find({ userId })
      .sort({ startTime: -1 })
      .limit(5);

    const recentSessions = recentSessionsDocs.map((s) => ({
      id: s._id,
      start_time: s.startTime,
      end_time: s.endTime,
      duration_minutes: s.durationMinutes,
      notes: s.notes,
    }));

    // Achievements
    const achievements = await Promise.all(
      user.achievements.map(async (ua) => {
        const ach = await Achievement.findById(ua.achievementId);
        return {
          achievement_id: ua.achievementId,
          earned_at: ua.earnedAt,
          name: ach?.name,
          description: ach?.description,
          xp_reward: ach?.xpReward,
        };
      })
    );

    return {
      id: user._id,
      username: user.name,
      total_xp: user.gamification.totalXp,
      level: user.gamification.level,
      completed_lessons: completedLessons,
      total_practice_sessions: totalPracticeSessions,
      total_practice_time: totalPracticeTime,
      achievements_earned: achievementsEarned,
      current_streak: user.gamification.currentStreak,
      longest_streak: user.gamification.longestStreak,
      recent_lessons: recentLessons,
      recent_sessions: recentSessions,
      achievements: achievements.sort((a, b) => b.earned_at - a.earned_at),
    };
  }

  async getLessonProgress(userId, lessonId) {
    return await UserProgress.findOne({ userId, lessonId });
  }

  async resetUserProgress(userId) {
    await UserProgress.deleteMany({ userId });
    await PracticeSession.deleteMany({ userId });

    const user = await User.findOne({ userId });
    if (user) {
      user.gamification = {
        totalXp: 0,
        level: 1,
        currentStreak: 0,
        longestStreak: 0,
        lastPracticeDate: null,
      };
      user.achievements = [];
      user.instruments.forEach((i) => {
        i.lessonsCompleted = 0;
        i.totalPracticeTime = 0;
      });
      await user.save();
    }

    return null;
  }

  async saveExerciseProgress({
    user_id,
    lesson_id,
    exercise_type,
    metric_name,
    metric_value,
    notes,
  }) {
    const progress = await UserProgress.findOneAndUpdate(
      { userId: user_id, lessonId: lesson_id },
      {
        $push: {
          exercises: {
            type: exercise_type,
            metricName: metric_name,
            metricValue: metric_value,
            notes,
            recordedAt: new Date(),
          },
        },
      },
      { new: true, upsert: true }
    );
    return progress.exercises[progress.exercises.length - 1];
  }

  async getExerciseHistory({ user_id, exercise_type, lesson_id, limit = 10 }) {
    const query = { userId: user_id };
    if (lesson_id) query.lessonId = lesson_id;

    // This is tricky because exercises are embedded.
    // We need to aggregate to unwind and filter.
    const pipeline = [
      { $match: query },
      { $unwind: '$exercises' },
      { $match: { 'exercises.type': exercise_type } },
      { $sort: { 'exercises.recordedAt': -1 } },
      { $limit: limit },
      {
        $project: {
          id: '$exercises._id',
          lesson_id: '$lessonId',
          exercise_type: '$exercises.type',
          metric_name: '$exercises.metricName',
          metric_value: '$exercises.metricValue',
          recorded_at: '$exercises.recordedAt',
          notes: '$exercises.notes',
        },
      },
    ];

    const history = await UserProgress.aggregate(pipeline);

    // Stats
    const statsPipeline = [
      { $match: { userId: user_id } }, // Match user first
      { $unwind: '$exercises' },
      { $match: { 'exercises.type': exercise_type } },
    ];

    if (lesson_id) {
      statsPipeline[0].$match.lessonId = new mongoose.Types.ObjectId(lesson_id);
    }

    statsPipeline.push({
      $group: {
        _id: null,
        personal_best: { $max: '$exercises.metricValue' },
        lowest_score: { $min: '$exercises.metricValue' },
        average_score: { $avg: '$exercises.metricValue' },
        total_attempts: { $sum: 1 },
      },
    });

    const statsResult = await UserProgress.aggregate(statsPipeline);

    return {
      history,
      stats: statsResult[0] || {
        personal_best: 0,
        lowest_score: 0,
        average_score: 0,
        total_attempts: 0,
      },
    };
  }
}

module.exports = new ProgressService();
