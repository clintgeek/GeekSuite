import api from './apiClient';

const statsService = {
  // Get dashboard stats (streak, XP, lessons completed, etc.)
  async getDashboardStats() {
    const response = await api.get('/stats/dashboard');
    return response.data.data;
  },

  // Get achievements and milestones
  async getAchievements() {
    const response = await api.get('/stats/achievements');
    return response.data.data;
  },

  // Record activity (called after completing something)
  async recordActivity(xpEarned = 0) {
    const response = await api.post('/stats/activity', { xpEarned });
    return response.data.data;
  }
};

export default statsService;
