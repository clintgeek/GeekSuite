const lessonService = require('../services/lessonService');

class LessonController {
  async getAllLessons(req, res, next) {
    try {
      const userId = req.user?.id || null;
      const lessons = await lessonService.getAllLessons(req.query, userId);

      res.json({
        success: true,
        data: lessons,
      });
    } catch (error) {
      next(error);
    }
  }

  async getLesson(req, res, next) {
    try {
      const userId = req.user?.id || null;
      const lesson = await lessonService.getLessonById(req.params.id, userId);

      res.json({
        success: true,
        data: lesson,
      });
    } catch (error) {
      next(error);
    }
  }

  async getLessonSteps(req, res, next) {
    try {
      const steps = await lessonService.getLessonSteps(req.params.id);

      res.json({
        success: true,
        data: steps,
      });
    } catch (error) {
      next(error);
    }
  }

  async startLesson(req, res, next) {
    try {
      const userId = req.user.id;
      const { lessonId } = req.params;

      const progress = await lessonService.startLesson(userId, lessonId);

      res.json({
        success: true,
        data: progress,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProgress(req, res, next) {
    try {
      const userId = req.user.id;
      const { lessonId } = req.params;
      const { currentStep } = req.body;

      const progress = await lessonService.updateLessonProgress(userId, lessonId, currentStep);

      res.json({
        success: true,
        data: progress,
      });
    } catch (error) {
      next(error);
    }
  }

  async completeLesson(req, res, next) {
    try {
      const userId = req.user.id;
      const { lessonId } = req.params;

      const progress = await lessonService.completeLesson(userId, lessonId);

      res.json({
        success: true,
        data: progress,
        message: 'Lesson completed successfully!',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new LessonController();
