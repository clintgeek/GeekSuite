const PracticeSession = require('../models/PracticeSession');
const { NotFoundError } = require('../utils/errors');
const progressService = require('./progressService');

class PracticeService {
  async createSession(userId, { duration_minutes, notes = '', focused_on: _focused_on = '' }) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - duration_minutes * 60 * 1000);

    const session = await PracticeSession.create({
      userId,
      startTime,
      endTime,
      durationMinutes: duration_minutes,
      notes,
    });

    await progressService.updateDailyStreak(userId, endTime);

    return session;
  }

  async getUserSessions(userId, filters = {}) {
    const query = { userId };

    if (filters.start_date) {
      query.startTime = { $gte: new Date(filters.start_date) };
    }

    if (filters.end_date) {
      query.endTime = { $lte: new Date(filters.end_date) };
    }

    const limit = filters.limit ? parseInt(filters.limit) : 0;
    const offset = filters.offset ? parseInt(filters.offset) : 0;

    const sessions = await PracticeSession.find(query)
      .sort({ startTime: -1 })
      .skip(offset)
      .limit(limit);

    return sessions;
  }

  async getSessionById(id, userId) {
    const session = await PracticeSession.findOne({ _id: id, userId });
    if (!session) {
      throw new NotFoundError('Practice session not found');
    }
    return session;
  }

  async deleteSession(id, userId) {
    const session = await PracticeSession.findOneAndDelete({ _id: id, userId });
    if (!session) {
      throw new NotFoundError('Practice session not found');
    }
    return { message: 'Practice session deleted successfully' };
  }
}

module.exports = new PracticeService();
