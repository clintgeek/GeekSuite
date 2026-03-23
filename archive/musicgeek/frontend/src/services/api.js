import axios from 'axios';
import { setupAxiosInterceptors } from '@geeksuite/auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

setupAxiosInterceptors(apiClient);

function handleAxiosError(error) {
  if (error.response) {
    const errorData = error.response.data || {};
    const status = error.response.status;

    if (status === 401 || status === 403) {
      throw new ApiError('Authentication required. Please sign in again.', status, errorData);
    }
    throw new ApiError(errorData.error || errorData.message || 'API request failed', status, errorData);
  }
  throw new ApiError('Network error or server unavailable', 0, {});
}

export const api = {
  get: async (endpoint) => {
    try {
      const response = await apiClient.get(endpoint);
      return response.data;
    } catch (e) {
      handleAxiosError(e);
    }
  },

  post: async (endpoint, data) => {
    try {
      const response = await apiClient.post(endpoint, data);
      return response.data;
    } catch (e) {
      handleAxiosError(e);
    }
  },

  put: async (endpoint, data) => {
    try {
      const response = await apiClient.put(endpoint, data);
      return response.data;
    } catch (e) {
      handleAxiosError(e);
    }
  },

  delete: async (endpoint) => {
    try {
      const response = await apiClient.delete(endpoint);
      return response.data;
    } catch (e) {
      handleAxiosError(e);
    }
  },
};

export { ApiError };
