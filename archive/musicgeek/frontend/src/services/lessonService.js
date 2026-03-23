import { api } from './api';

export async function getAllLessons(filters = {}) {
  const params = new URLSearchParams();

  if (filters.instrumentId) params.append('instrumentId', filters.instrumentId);
  if (filters.category) params.append('category', filters.category);
  if (filters.difficulty) params.append('difficulty', filters.difficulty);
  if (filters.search) params.append('search', filters.search);

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await api.get(`/api/lessons${query}`);
  return response.data;
}

export async function getLessonById(lessonId, bustCache = false) {
  // Add cache-busting timestamp if requested
  const cacheBuster = bustCache ? `?_t=${Date.now()}` : '';
  const response = await api.get(`/api/lessons/${lessonId}${cacheBuster}`);
  return response.data;
}

export async function getLessonSteps(lessonId) {
  const response = await api.get(`/api/lessons/${lessonId}/steps`);
  return response.data;
}

export async function startLesson(lessonId) {
  const response = await api.post(`/api/lessons/${lessonId}/start`);
  return response.data;
}

export async function updateLessonProgress(lessonId, currentStep) {
  const response = await api.put(`/api/lessons/${lessonId}/progress`, { currentStep });
  return response.data;
}

export async function completeLesson(lessonId) {
  const response = await api.post('/api/progress/complete', { lessonId });
  return response?.data ?? response;
}

// Legacy helper for older code paths
export async function markLessonComplete(lessonId) {
  return completeLesson(lessonId);
}
