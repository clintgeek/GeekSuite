const practiceService = require('../services/practiceService');

class PracticeController {
  async createSession(req, res, next) {
    try {
      const userId = req.user.id;
      const session = await practiceService.createSession(userId, req.body);

      res.status(201).json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserSessions(req, res, next) {
    try {
      const userId = req.params.userId || req.user.id;
      const sessions = await practiceService.getUserSessions(userId, req.query);

      res.json({
        success: true,
        data: sessions,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSession(req, res, next) {
    try {
      const userId = req.user.id;
      const session = await practiceService.getSessionById(req.params.id, userId);

      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteSession(req, res, next) {
    try {
      const userId = req.user.id;
      const result = await practiceService.deleteSession(req.params.id, userId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PracticeController();
