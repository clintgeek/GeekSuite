import { api } from './api';

export async function createPracticeSession(sessionData) {
  const response = await api.post('/api/practice', sessionData);
  return response.data;
}

export async function getUserSessions(userId, filters = {}) {
  const params = new URLSearchParams();

  if (filters.limit) params.append('limit', filters.limit);
  if (filters.offset) params.append('offset', filters.offset);
  if (filters.start_date) params.append('start_date', filters.start_date);
  if (filters.end_date) params.append('end_date', filters.end_date);

  const query = params.toString() ? `?${params.toString()}` : '';
  const endpoint = userId ? `/api/practice/user/${userId}${query}` : `/api/practice/user${query}`;

  const response = await api.get(endpoint);
  return response.data;
}

export async function getSessionById(sessionId) {
  const response = await api.get(`/api/practice/${sessionId}`);
  return response.data;
}

export async function deleteSession(sessionId) {
  const response = await api.delete(`/api/practice/${sessionId}`);
  return response.data;
}
