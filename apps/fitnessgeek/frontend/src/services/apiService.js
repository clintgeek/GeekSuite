import axios from 'axios';
import logger from '../utils/logger.js';

// Determine API base URL based on environment
let API_URL = '/api'; // Default for production

// For development - use local FitnessGeek backend
if (import.meta.env.DEV) {
  const hostname = window.location.hostname;
  const fitnessGeekPort = 3001; // FitnessGeek backend port
  API_URL = `http://${hostname}:${fitnessGeekPort}/api`;
}

// Create axios instance
logger.info('ApiService: Using API_URL:', API_URL);
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    logger.debug('ApiService: Request →', config.method?.toUpperCase() || 'GET', config.baseURL + config.url);
    return config;
  },
  (error) => {
    logger.error('[ApiService] Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle network errors
    if (!error.response) {
      logger.error('[ApiService] Network error:', error.message);
      return Promise.reject(new Error('Network error. Please check your connection.'));
    }

    // Handle API errors
    const { status, data } = error.response;
    logger.error(`[ApiService] Error ${status}:`, data);

    switch (status) {
      case 401:
        return Promise.reject(new Error(data.message || 'Unauthorized. Please login again.'));
      case 403:
        return Promise.reject(new Error(data.message || 'You do not have permission to access this resource.'));
      case 404:
        return Promise.reject(new Error(data.message || 'Resource not found.'));
      case 422:
        return Promise.reject(new Error(data.message || 'Validation error.'));
      case 500:
        return Promise.reject(new Error(data.message || 'Server error. Please try again later.'));
      default:
        return Promise.reject(new Error(data.message || 'An error occurred. Please try again.'));
    }
  }
);

// API service
export const apiService = {
  // GET request
  get: (url, config) => {
    return api.get(url, config).then((response) => response.data);
  },

  // POST request
  post: (url, data, config) => {
    return api.post(url, data, config).then((response) => response.data);
  },

  // PUT request
  put: (url, data, config) => {
    return api.put(url, data, config).then((response) => response.data);
  },

  // PATCH request
  patch: (url, data, config) => {
    return api.patch(url, data, config).then((response) => response.data);
  },

  // DELETE request
  delete: (url, config) => {
    return api.delete(url, config).then((response) => response.data);
  },
};