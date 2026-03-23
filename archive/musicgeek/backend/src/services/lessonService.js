const Lesson = require('../models/Lesson');
const UserProgress = require('../models/UserProgress');
const { NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');
const progressService = require('./progressService');

function mapDifficultyToLabel(difficulty) {
  if (typeof difficulty === 'string') {
    const lower = difficulty.toLowerCase();
    if (['beginner', 'intermediate', 'advanced'].includes(lower)) {
      return lower;
    }
  }

  const numeric = Number(difficulty) || 1;
  if (numeric <= 2) return 'beginner';
  if (numeric === 3) return 'intermediate';
  return 'advanced';
}

function buildLessonProgress(progressDoc) {
  if (!progressDoc) {
    return {
      completed: false,
      currentStep: null,
      startedAt: null,
      completedAt: null,
      xpGained: 0,
    };
  }

  return {
    completed: !!progressDoc.status?.isCompleted,
    currentStep: progressDoc.status?.currentStep ?? null,
    startedAt: progressDoc.status?.startedAt ?? null,
    completedAt: progressDoc.status?.completedAt ?? null,
    xpGained: progressDoc.stats?.xpGained ?? 0,
  };
}

function buildLessonMastery(progress) {
  const completed = progress.completed;
  const picks = completed ? 1 : 0;
  const status = completed ? 'learning' : 'unstarted';
  return { picks, status };
}

function computeLessonXp(lesson) {
  if (typeof lesson.xpReward === 'number' && lesson.xpReward > 0) {
    return lesson.xpReward;
  }

  return progressService.calculateLessonXP({
    estimatedTimeMinutes: lesson.estimatedTimeMinutes,
    difficulty: lesson.difficulty,
  });
}

function buildLessonSummary(lesson, progressDoc) {
  const difficulty = mapDifficultyToLabel(lesson.difficulty);
  const xpReward = computeLessonXp(lesson);
  const progress = buildLessonProgress(progressDoc);
  const mastery = buildLessonMastery(progress);

  const instrument = lesson.instrumentId
    ? {
        id: lesson.instrumentId._id,
        name: lesson.instrumentId.name,
        displayName: lesson.instrumentId.displayName,
      }
    : null;

  return {
    id: lesson._id,
    slug: lesson.slug || null,
    title: lesson.title,
    subtitle: lesson.subtitle,
    description: lesson.description,
    category: lesson.category,
    difficulty,
    unit: lesson.unit,
    orderIndex: lesson.orderIndex,
    estimatedTimeMinutes: lesson.estimatedTimeMinutes,
    xpReward,
    audience: lesson.audience || 'both',
    tags: lesson.tags || [],
    learningOutcomes: lesson.learningOutcomes || [],
    instrument,
    progress,
    mastery,
    template: lesson.template || null,
    content: lesson.content || null,
    // Legacy fields to keep existing frontend working during migration
    estimated_time_minutes: lesson.estimatedTimeMinutes,
    estimated_duration: lesson.estimatedTimeMinutes,
    order_index: lesson.orderIndex,
    video_url: lesson.videoUrl,
    content_path: lesson.contentPath,
    instrument_id: instrument?.id,
    instrument_name: instrument?.name,
    instrument_display_name: instrument?.displayName,
    completed: progress.completed,
    is_completed: progress.completed,
    completed_at: progress.completedAt,
    current_step: progress.currentStep,
    started_at: progress.startedAt,
    xp_gained: progress.xpGained,
    xp_reward: xpReward,
  };
}

function buildLessonDetail(lesson, progressDoc) {
  const base = buildLessonSummary(lesson, progressDoc);
  const content = lesson.content || null;

  const video = lesson.videoUrl
    ? {
        provider: 'youtube',
        url: lesson.videoUrl,
      }
    : null;

  const steps = (lesson.steps || []).map((s) => ({
    id: s._id,
    index: s.stepNumber,
    step_number: s.stepNumber,
    stepType: s.type,
    step_type: s.type,
    instruction: s.instruction,
    visual_asset_url: s.visualAssetUrl,
    code_example: s.codeExample,
    media: s.media
      ? {
          kind: s.media.type,
          url: s.media.url,
        }
      : null,
    media_type: s.media?.type,
    media_url: s.media?.url,
    interactive_content: s.interactiveContent,
    step_config: s.config,
  }));

  return {
    ...base,
    video,
    content,
    steps,
  };
}

class LessonService {
  /**
   * Get all lessons (optionally filtered by instrument)
   */
  async getAllLessons(filters = {}, userId = null) {
    const query = {};

    if (filters.instrumentId) {
      query.instrumentId = filters.instrumentId;
    }
    if (filters.category) {
      query.category = filters.category;
    }
    if (filters.difficulty) {
      const diff = String(filters.difficulty).toLowerCase();
      if (diff === 'beginner') {
        query.difficulty = { $lte: 2 };
      } else if (diff === 'intermediate') {
        query.difficulty = 3;
      } else if (diff === 'advanced') {
        query.difficulty = { $gte: 4 };
      }
    }
    if (filters.search) {
      query.$or = [
        { title: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const limit = filters.limit ? parseInt(filters.limit) : 0;
    const offset = filters.offset ? parseInt(filters.offset) : 0;

    const lessons = await Lesson.find(query)
      .sort({ orderIndex: 1, title: 1 })
      .skip(offset)
      .limit(limit)
      .populate('instrumentId');

    // If userId provided, fetch progress
    const userProgressMap = new Map();
    if (userId) {
      const progressDocs = await UserProgress.find({
        userId,
        lessonId: { $in: lessons.map((l) => l._id) },
      });
      progressDocs.forEach((p) => userProgressMap.set(p.lessonId.toString(), p));
    }

    return lessons.map((lesson) => {
      const progressDoc = userProgressMap.get(lesson._id.toString());
      return buildLessonSummary(lesson, progressDoc);
    });
  }

  /**
   * Get a single lesson by ID or slug with all steps
   */
  async getLessonById(id, userId = null) {
    // Try to find by _id first, if that fails, try by slug
    let lesson = null;

    // Check if it's a valid MongoDB ObjectId
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      lesson = await Lesson.findById(id).populate('instrumentId');
    }

    // If not found by ID or not a valid ObjectId, try slug
    if (!lesson) {
      lesson = await Lesson.findOne({ slug: id }).populate('instrumentId');
    }

    if (!lesson) {
      throw new NotFoundError('Lesson not found');
    }

    let progressDoc = null;
    if (userId) {
      progressDoc = await UserProgress.findOne({ userId, lessonId: id });
    }

    return buildLessonDetail(lesson, progressDoc);
  }

  /**
   * Get lesson steps
   */
  async getLessonSteps(lessonId) {
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      throw new NotFoundError('Lesson not found');
    }

    return lesson.steps.map((s) => ({
      step_number: s.stepNumber,
      instruction: s.instruction,
      visual_asset_url: s.visualAssetUrl,
      code_example: s.codeExample,
      step_type: s.type,
      media_type: s.media?.type,
      media_url: s.media?.url,
      interactive_content: s.interactiveContent,
      step_config: s.config,
    }));
  }

  /**
   * Start a lesson (create user progress entry)
   */
  async startLesson(userId, lessonId) {
    try {
      const now = new Date();

      // Use an atomic upsert to avoid duplicate key errors when multiple
      // clients try to start the same lesson concurrently.
      let progress = await UserProgress.findOneAndUpdate(
        { userId, lessonId },
        {
          $setOnInsert: {
            'status.currentStep': 1,
            'status.startedAt': now,
          },
        },
        { new: true, upsert: true }
      );

      // For legacy records that may be missing startedAt, initialize it once.
      if (!progress.status.startedAt) {
        progress.status.startedAt = now;
        if (!progress.status.currentStep) {
          progress.status.currentStep = 1;
        }
        await progress.save();
      }

      return progress;
    } catch (error) {
      logger.error('Error starting lesson:', error);
      throw error;
    }
  }

  /**
   * Update lesson progress (step completion)
   */
  async updateLessonProgress(userId, lessonId, currentStep) {
    try {
      const progress = await UserProgress.findOneAndUpdate(
        { userId, lessonId },
        {
          $set: { 'status.currentStep': currentStep },
          $setOnInsert: { 'status.startedAt': new Date() },
        },
        { new: true, upsert: true }
      );
      return progress;
    } catch (error) {
      logger.error('Error updating lesson progress:', error);
      throw error;
    }
  }

  /**
   * Mark lesson as completed
   * Note: This is partially redundant with progressService.markLessonComplete,
   * but kept for compatibility if called directly.
   */
  async completeLesson(userId, lessonId) {
    // Delegate to progressService to handle XP, achievements, etc.
    // But to avoid circular dependency, we might implement basic logic here or move logic.
    // The original code had logic here.
    // I will implement basic completion here, but full logic is in progressService.

    const progress = await UserProgress.findOneAndUpdate(
      { userId, lessonId },
      {
        $set: {
          'status.isCompleted': true,
          'status.completedAt': new Date(),
        },
      },
      { new: true, upsert: true }
    );

    // Update instrument stats
    const lesson = await Lesson.findById(lessonId);
    if (lesson && lesson.instrumentId) {
      const User = require('../models/User');
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
}

module.exports = new LessonService();
