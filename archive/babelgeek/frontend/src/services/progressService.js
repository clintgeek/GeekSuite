import api from './apiClient';

const progressService = {
  // Get all progress for a language
  async getLanguageProgress(language) {
    const response = await api.get(`/progress/${language}`);
    return response.data.data;
  },

  // Get progress for a specific lesson
  async getLessonProgress(language, lessonSlug) {
    const response = await api.get(`/progress/${language}/${lessonSlug}`);
    return response.data.data;
  },

  // Update lesson progress
  async updateLessonProgress(language, lessonSlug, progressData) {
    const response = await api.put(`/progress/${language}/${lessonSlug}`, progressData);
    return response.data.data;
  },

  // Get next recommended lesson
  async getNextLesson(language) {
    const response = await api.get(`/progress/${language}/next`);
    return response.data.data;
  },

  // Start a lesson
  async startLesson(language, lessonSlug) {
    return this.updateLessonProgress(language, lessonSlug, {
      status: 'in_progress',
      currentStepIndex: 0
    });
  },

  // Complete a lesson
  async completeLesson(language, lessonSlug, score, xpEarned, timeSpentSeconds) {
    return this.updateLessonProgress(language, lessonSlug, {
      status: 'completed',
      score,
      xpEarned,
      timeSpentSeconds
    });
  }
};

export default progressService;
