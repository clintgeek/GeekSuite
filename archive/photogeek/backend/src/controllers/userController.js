const User = require('../models/User');
const UserProject = require('../models/UserProject');

/**
 * Get user statistics
 * @route GET /api/user/stats
 */
exports.getUserStats = async (req, res) => {
  try {
    const userId = req.localUser?._id;

    if (!userId) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    // Get user
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get all user projects
    const userProjects = await UserProject.find({ userId }).populate('projectId');

    // Calculate stats
    const completedProjects = userProjects.filter(up => up.status === 'completed');
    const inProgressProjects = userProjects.filter(up => up.status === 'in-progress');

    // Get total XP from completed projects
    const totalXP = completedProjects.reduce((sum, up) => sum + (up.xpEarned || 0), 0);

    // Get completed projects with details
    const completedProjectsDetails = completedProjects.map(up => ({
      projectId: up.projectId._id,
      projectTitle: up.projectId.title,
      projectSlug: up.projectId.slug,
      completedAt: up.completedAt,
      xpEarned: up.xpEarned,
      rating: up.rating,
    })).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)); // Most recent first

    res.json({
      user: {
        email: user.email,
        profile: user.profile,
        skillLevel: user.skillLevel,
        xp: user.xp || totalXP,
        level: user.level || 1,
        streak: user.streak || { current: 0, longest: 0 },
        createdAt: user.createdAt,
      },
      stats: {
        totalXP,
        completedProjectsCount: completedProjects.length,
        inProgressProjectsCount: inProgressProjects.length,
      },
      completedProjects: completedProjectsDetails,
    });
  } catch (error) {
    console.error('Error getting user stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Reset user progress
 * @route POST /api/user/reset
 */
exports.resetProgress = async (req, res) => {
  try {
    const userId = req.localUser?._id;

    if (!userId) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    // Delete all user projects
    await UserProject.deleteMany({ userId });

    // Reset user XP and level
    await User.findByIdAndUpdate(userId, {
      xp: 0,
      level: 1,
      'streak.current': 0,
      'streak.longest': 0,
    });

    res.json({ message: 'Progress reset successfully' });
  } catch (error) {
    console.error('Error resetting progress:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
