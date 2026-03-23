import { api } from './api';

export async function register(userData) {
  const response = await api.post('/api/auth/register', userData);
  return response?.data ?? response;
}

export async function login(credentials) {
  const response = await api.post('/api/auth/login', credentials);
  return response?.data ?? response;
}

export async function validateSSO(token) {
  const response = await api.post('/api/auth/validate-sso', { token });
  return response?.data ?? response;
}

export async function getCurrentUser() {
  const response = await api.get('/api/me');
  return response?.data?.user ?? response?.user ?? null;
}

export async function getUserById(userId) {
  const response = await api.get(`/api/users/${userId}`);
  return response?.data ?? response;
}

export async function updateUser(userId, updates) {
  const response = await api.put(`/api/users/${userId}`, updates);
  return response?.data ?? response;
}

export async function getUserProgress(userId) {
  const response = await api.get(`/api/progress/user/${userId || ''}`);
  // API responses follow { success, data } – surface the nested progress payload
  return response?.data ?? response;
}

export async function resetUserProgress() {
  const response = await api.delete('/api/progress');
  return response?.data ?? response;
}
