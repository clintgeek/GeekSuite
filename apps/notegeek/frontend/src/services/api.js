import axios from 'axios';

// Define the base URL for the API
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Create an axios instance
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
    // Ensure cookies are sent with cross-origin requests
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN',
    // Explicitly set credentials mode
    credentials: 'include'
});

// Add response interceptor for auth errors
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response) {
            // Handle 401 Unauthorized
            if (error.response.status === 401) {
                // Cookie-first SSO: let the app redirect to /login based on auth state.
            }
            console.error('API Error:', error.response.status, error.config?.url);
        } else if (error.request) {
            console.error('API No Response:', error.request);
        } else {
            console.error('API Error:', error.message);
        }
        return Promise.reject(error);
    }
);

// Auth
export const loginApi = (credentials) => apiClient.post('/auth/login', credentials);
export const registerApi = (userData) => apiClient.post('/auth/register', userData);
export const logoutApi = () => apiClient.post('/auth/logout');
export const getMeApi = () => apiClient.get('/auth/me');

// Notes
export const getNotesApi = (filters = {}) => apiClient.get('/notes', { params: filters });
export const getNoteByIdApi = (id) => apiClient.get(`/notes/${id}`);
export const createNoteApi = (noteData) => apiClient.post('/notes', noteData);
export const updateNoteApi = (id, noteData) => apiClient.put(`/notes/${id}`, noteData);
export const deleteNoteApi = (id) => apiClient.delete(`/notes/${id}`);

// Tags
export const getTagsApi = () => apiClient.get('/tags');

// Folders
export const createFolderApi = (folderData) => apiClient.post('/folders', folderData);
export const getFoldersApi = () => apiClient.get('/folders');
export const updateFolderApi = (folderId, folderData) => apiClient.put(`/folders/${folderId}`, folderData);
export const deleteFolderApi = (folderId, cascade = false) => apiClient.delete(`/folders/${folderId}?deleteNotes=${cascade}`);

// Search
export const searchNotesApi = async (query) => {
    try {
        const response = await apiClient.get('/search', { params: { q: query } });
        return response;
    } catch (error) {
        console.error('Search failed:', error.message);
        throw error;
    }
};

// Tag Management
export const renameTagApi = async (oldTag, newTag) => {
    try {
        const response = await apiClient.put('/tags/rename', { oldTag, newTag });
        return response;
    } catch (error) {
        console.error('API Rename Tag Error:', error);
        throw error;
    }
};

export const deleteTagApi = async (tag) => {
    try {
        const response = await apiClient.delete(`/tags/${encodeURIComponent(tag)}`);
        return response;
    } catch (error) {
        console.error('Delete tag failed:', error.message);
        throw error;
    }
};

export default apiClient; // Export the configured instance for direct use if needed