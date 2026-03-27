import axios from 'axios';
import { setupAxiosInterceptors } from '@geeksuite/auth';

import { apolloClient } from '../apolloClient';
import { GET_FOLDERS, SEARCH_NOTES, GET_NOTES, GET_NOTE_BY_ID, GET_TAGS } from '../graphql/queries';
import { CREATE_FOLDER, UPDATE_FOLDER, DELETE_FOLDER, RENAME_TAG, DELETE_TAG, CREATE_NOTE, UPDATE_NOTE, DELETE_NOTE } from '../graphql/mutations';

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

// Add response interceptor for automatic 401 token refresh and requeueing
setupAxiosInterceptors(apiClient);

// Auth
export const loginApi = (credentials) => apiClient.post('/auth/login', credentials);
export const registerApi = (userData) => apiClient.post('/auth/register', userData);
export const logoutApi = () => apiClient.post('/auth/logout');
export const getMeApi = () => apiClient.get('/auth/me');

// Notes
export const getNotesApi = async (filters = {}) => {
    const { data } = await apolloClient.query({ query: GET_NOTES, variables: filters, fetchPolicy: 'network-only' });
    return { data: data.notes };
};
export const getNoteByIdApi = async (id) => {
    const { data } = await apolloClient.query({ query: GET_NOTE_BY_ID, variables: { id }, fetchPolicy: 'network-only' });
    return { data: data.note };
};
export const createNoteApi = async (noteData) => {
    const { data } = await apolloClient.mutate({ mutation: CREATE_NOTE, variables: noteData });
    return { data: data.createNote };
};
export const updateNoteApi = async (id, noteData) => {
    const { data } = await apolloClient.mutate({ mutation: UPDATE_NOTE, variables: { id, ...noteData } });
    return { data: data.updateNote };
};
export const deleteNoteApi = async (id) => {
    const { data } = await apolloClient.mutate({ mutation: DELETE_NOTE, variables: { id } });
    return { data: data.deleteNote };
};

// Tags
export const getTagsApi = async () => {
    const { data } = await apolloClient.query({ query: GET_TAGS, fetchPolicy: 'network-only' });
    return { data: data.noteTags };
};

// Folders
export const createFolderApi = async (folderData) => {
    const { data } = await apolloClient.mutate({ mutation: CREATE_FOLDER, variables: folderData });
    return { data: data.createFolder };
};
export const getFoldersApi = async () => {
    const { data } = await apolloClient.query({ query: GET_FOLDERS, fetchPolicy: 'network-only' });
    return { data: data.folders };
};
export const updateFolderApi = async (folderId, folderData) => {
    const { data } = await apolloClient.mutate({ mutation: UPDATE_FOLDER, variables: { id: folderId, ...folderData } });
    return { data: data.updateFolder };
};
export const deleteFolderApi = async (folderId, cascade = false) => {
    const { data } = await apolloClient.mutate({ mutation: DELETE_FOLDER, variables: { id: folderId, deleteNotes: cascade } });
    return { data: data.deleteFolder };
};

// Search
export const searchNotesApi = async (query) => {
    try {
        const { data } = await apolloClient.query({ query: SEARCH_NOTES, variables: { q: query }, fetchPolicy: 'network-only' });
        return { data: data.searchNotes };
    } catch (error) {
        console.error('Search failed:', error.message);
        throw error;
    }
};

// Tag Management
export const renameTagApi = async (oldTag, newTag) => {
    try {
        const { data } = await apolloClient.mutate({ mutation: RENAME_TAG, variables: { oldTag, newTag } });
        return { data: data.renameTag };
    } catch (error) {
        console.error('API Rename Tag Error:', error);
        throw error;
    }
};

export const deleteTagApi = async (tag) => {
    try {
        const { data } = await apolloClient.mutate({ mutation: DELETE_TAG, variables: { tag } });
        return { data: data.deleteTag };
    } catch (error) {
        console.error('Delete tag failed:', error.message);
        throw error;
    }
};

export default apiClient; // Export the configured instance for direct use if needed