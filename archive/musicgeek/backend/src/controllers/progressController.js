const progressService = require('../services/progressService');

class ProgressController {
  async markLessonComplete(req, res, next) {
    try {
      const { lessonId } = req.body;
      const userId = req.user.id;

      const progress = await progressService.markLessonComplete(userId, lessonId);

      res.json({
        success: true,
        data: progress,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserProgress(req, res, next) {
    try {
      const userId = req.params.userId || req.user.id;
      const progress = await progressService.getUserProgress(userId);

      res.json({
        success: true,
        data: progress,
      });
    } catch (error) {
      next(error);
    }
  }

  async getLessonProgress(req, res, next) {
    try {
      const userId = req.user.id;
      const { lessonId } = req.params;

      const progress = await progressService.getLessonProgress(userId, lessonId);

      res.json({
        success: true,
        data: progress,
      });
    } catch (error) {
      next(error);
    }
  }

  async resetUserProgress(req, res, next) {
    try {
      const userId = req.user.id;
      const progress = await progressService.resetUserProgress(userId);

      res.json({
        success: true,
        message: 'Progress reset successfully',
        data: progress,
      });
    } catch (error) {
      next(error);
    }
  }

  async saveExerciseProgress(req, res, next) {
    try {
      const userId = req.user.id;
      const { lesson_id, exercise_type, metric_name, metric_value, notes } = req.body;

      const progress = await progressService.saveExerciseProgress({
        user_id: userId,
        lesson_id,
        exercise_type,
        metric_name,
        metric_value,
        notes,
      });

      res.json({
        success: true,
        data: progress,
        message: 'Exercise progress saved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async getExerciseHistory(req, res, next) {
    try {
      const userId = req.user.id;
      const { exercise_type } = req.params;
      const { lesson_id, limit = 10 } = req.query;

      const history = await progressService.getExerciseHistory({
        user_id: userId,
        exercise_type,
        lesson_id,
        limit: parseInt(limit),
      });

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProgressController();
