const achievementService = require('../services/achievementService');

class AchievementController {
  async getAllAchievements(req, res, next) {
    try {
      const achievements = await achievementService.getAllAchievements();

      res.json({
        success: true,
        data: achievements,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserAchievements(req, res, next) {
    try {
      const userId = req.params.userId || req.user.id;
      const achievements = await achievementService.getUserAchievements(userId);

      res.json({
        success: true,
        data: achievements,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AchievementController();
