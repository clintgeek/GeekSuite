import UserProgress from "../models/UserProgress.js";
import UserStats from "../models/UserStats.js";
import UserVocabulary from "../models/UserVocabulary.js";
import { sendSuccess, sendError } from "../utils/responses.js";

// Get user's progress for a specific language
export const getLanguageProgress = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { language } = req.params;

    const progress = await UserProgress.find({
      userId,
      languageCode: language
    }).sort({ updatedAt: -1 });

    return sendSuccess(res, { progress });
  } catch (error) {
    console.error("Error getting language progress:", error);
    return sendError(res, { message: "Failed to get progress" }, 500);
  }
};

// Get progress for a specific lesson
export const getLessonProgress = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { language, lessonSlug } = req.params;

    let progress = await UserProgress.findOne({
      userId,
      languageCode: language,
      lessonSlug
    });

    if (!progress) {
      // Return default progress
      progress = {
        lessonSlug,
        languageCode: language,
        status: "not_started",
        currentStepIndex: 0,
        xpEarned: 0
      };
    }

    return sendSuccess(res, { progress });
  } catch (error) {
    console.error("Error getting lesson progress:", error);
    return sendError(res, { message: "Failed to get progress" }, 500);
  }
};

// Update lesson progress
export const updateLessonProgress = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { language, lessonSlug } = req.params;
    const { currentStepIndex, stepsCompleted, status, xpEarned, score, timeSpentSeconds } = req.body;

    let progress = await UserProgress.findOne({
      userId,
      languageCode: language,
      lessonSlug
    });

    if (!progress) {
      progress = new UserProgress({
        userId,
        languageCode: language,
        lessonSlug,
        startedAt: new Date()
      });
    }

    // Update fields if provided
    if (currentStepIndex !== undefined) progress.currentStepIndex = currentStepIndex;
    if (stepsCompleted) progress.stepsCompleted = stepsCompleted;
    if (status) {
      progress.status = status;
      if (status === "completed" && !progress.completedAt) {
        progress.completedAt = new Date();
      }
    }
    if (xpEarned !== undefined) progress.xpEarned = xpEarned;
    if (score !== undefined) progress.score = score;
    if (timeSpentSeconds !== undefined) progress.timeSpentSeconds = timeSpentSeconds;

    await progress.save();

    // If lesson completed, update user stats
    if (status === "completed") {
      let userStats = await UserStats.findOne({ userId });
      if (!userStats) {
        userStats = new UserStats({ userId });
      }

      userStats.updateStreak();
      userStats.totalXp += xpEarned || 0;
      userStats.totalLessonsCompleted += 1;
      userStats.calculateLevel();

      // Update language-specific stats
      let langStats = userStats.languageStats.find(ls => ls.languageCode === language);
      if (!langStats) {
        userStats.languageStats.push({
          languageCode: language,
          totalXp: xpEarned || 0,
          lessonsCompleted: 1,
          startedAt: new Date(),
          lastPracticedAt: new Date()
        });
      } else {
        langStats.totalXp += xpEarned || 0;
        langStats.lessonsCompleted += 1;
        langStats.lastPracticedAt = new Date();
      }

      // Check for achievements
      await checkAndUnlockAchievements(userStats, userId, score);

      await userStats.save();
    }

    return sendSuccess(res, { progress });
  } catch (error) {
    console.error("Error updating lesson progress:", error);
    return sendError(res, { message: "Failed to update progress" }, 500);
  }
};

// Get next recommended lesson
export const getNextLesson = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { language } = req.params;

    // Get all completed lessons
    const completedLessons = await UserProgress.find({
      userId,
      languageCode: language,
      status: "completed"
    }).select("lessonSlug");

    const completedSlugs = new Set(completedLessons.map(p => p.lessonSlug));

    // Get in-progress lesson
    const inProgress = await UserProgress.findOne({
      userId,
      languageCode: language,
      status: "in_progress"
    }).sort({ updatedAt: -1 });

    if (inProgress) {
      return sendSuccess(res, {
        nextLesson: {
          slug: inProgress.lessonSlug,
          currentStepIndex: inProgress.currentStepIndex,
          status: "in_progress"
        }
      });
    }

    // Otherwise, find first uncompleted lesson from the learning path
    // This will be handled by the frontend since it has the learning path data
    return sendSuccess(res, {
      nextLesson: null,
      completedSlugs: Array.from(completedSlugs)
    });
  } catch (error) {
    console.error("Error getting next lesson:", error);
    return sendError(res, { message: "Failed to get next lesson" }, 500);
  }
};

// Helper function to check and unlock achievements
async function checkAndUnlockAchievements(userStats, userId, score) {
  const newAchievements = [];
  const existingIds = new Set(userStats.achievements.map(a => a.achievementId));

  // First lesson
  if (userStats.totalLessonsCompleted === 1 && !existingIds.has("first_lesson")) {
    newAchievements.push({ achievementId: "first_lesson", unlockedAt: new Date() });
  }

  // Streak achievements
  if (userStats.currentStreak >= 3 && !existingIds.has("streak_3")) {
    newAchievements.push({ achievementId: "streak_3", unlockedAt: new Date() });
  }
  if (userStats.currentStreak >= 7 && !existingIds.has("streak_7")) {
    newAchievements.push({ achievementId: "streak_7", unlockedAt: new Date() });
  }
  if (userStats.currentStreak >= 30 && !existingIds.has("streak_30")) {
    newAchievements.push({ achievementId: "streak_30", unlockedAt: new Date() });
  }

  // XP achievements
  if (userStats.totalXp >= 500 && !existingIds.has("xp_500")) {
    newAchievements.push({ achievementId: "xp_500", unlockedAt: new Date() });
  }
  if (userStats.totalXp >= 1000 && !existingIds.has("xp_1000")) {
    newAchievements.push({ achievementId: "xp_1000", unlockedAt: new Date() });
  }

  // Lessons achievement
  if (userStats.totalLessonsCompleted >= 10 && !existingIds.has("lessons_10")) {
    newAchievements.push({ achievementId: "lessons_10", unlockedAt: new Date() });
  }

  // Perfect score
  if (score === 100 && !existingIds.has("perfect_score")) {
    newAchievements.push({ achievementId: "perfect_score", unlockedAt: new Date() });
  }

  // Vocabulary achievements (need to check count)
  const vocabCount = await UserVocabulary.countDocuments({ userId });
  if (vocabCount >= 50 && !existingIds.has("vocab_50")) {
    newAchievements.push({ achievementId: "vocab_50", unlockedAt: new Date() });
  }
  if (vocabCount >= 100 && !existingIds.has("vocab_100")) {
    newAchievements.push({ achievementId: "vocab_100", unlockedAt: new Date() });
  }

  if (newAchievements.length > 0) {
    userStats.achievements.push(...newAchievements);
  }
}
