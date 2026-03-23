import { api } from './api';

export async function getAllAchievements() {
  const response = await api.get('/api/achievements');
  return response.data;
}

export async function getUserAchievements(userId) {
  const endpoint = userId ? `/api/achievements/user/${userId}` : '/api/achievements/user';
  const response = await api.get(endpoint);
  return response.data;
}
