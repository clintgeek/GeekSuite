import axios from 'axios';
import logger from '../utils/logger.js';

// baseGeek API configuration
const API_URL = '/api';
const APP_NAME = 'fitnessgeek'; // FitnessGeek app name

// Create axios instance with interceptors
const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  withCredentials: true,
});

// Auth service using baseGeek
export const authService = {
  register: async (userData) => {
    try {
      const response = await api.post('/auth/register', {
        username: userData.username,
        email: userData.email,
        password: userData.password,
        app: APP_NAME
      });
      return response.data;
    } catch (error) {
      console.error('Error registering user:', error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Registration failed';
      throw new Error(errorMessage);
    }
  },

  login: async (credentials) => {
    try {
      const requestData = {
        identifier: credentials.identifier,
        password: credentials.password,
        app: APP_NAME
      };

      const response = await api.post('/auth/login', requestData);
      return response.data;
    } catch (error) {
      logger.error('Error logging in:', error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Login failed';
      throw new Error(errorMessage);
    }
  },

  getCurrentUser: async () => {
    try {
      const response = await api.get('/me');
      return response.data?.user || response.data;
    } catch (error) {
      logger.error('Error getting current user:', error);
      throw error;
    }
  },

  logout: async () => {
    await api.post('/auth/logout');
  },

  isAuthenticated: () => false,
  initializeAuth: () => false,
  validateToken: async () => false,
  refreshToken: async () => {
    throw new Error('Token refresh is server-managed');
  }
};