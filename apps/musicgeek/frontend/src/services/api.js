const API_BASE_URL = import.meta.env.VITE_API_URL || '';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

async function fetchAPI(endpoint, options = {}, isRetry = false) {
  const url = `${API_BASE_URL}${endpoint}`;

  const config = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (response.status === 401 || response.status === 403) {
        throw new ApiError('Authentication required. Please sign in again.', response.status, errorData);
      }

      throw new ApiError(errorData.error || 'API request failed', response.status, errorData);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    // Network error or other issues
    throw new ApiError('Network error or server unavailable', 0, {});
  }
}

export const api = {
  get: (endpoint) => fetchAPI(endpoint),

  post: (endpoint, data) =>
    fetchAPI(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  put: (endpoint, data) =>
    fetchAPI(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (endpoint) =>
    fetchAPI(endpoint, {
      method: 'DELETE',
    }),
};

export { ApiError };
