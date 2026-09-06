import axios from 'axios';
import { setupAxiosInterceptors } from '@geeksuite/auth';

import { apolloClient } from '../apolloClient';
import { SEARCH_NOTES, GET_NOTES, GET_NOTE_BY_ID, GET_TAGS } from '../graphql/queries';
import { RENAME_TAG, DELETE_TAG, CREATE_NOTE, UPDATE_NOTE, DELETE_NOTE } from '../graphql/mutations';
// Every mutation owns the cache consequences of its own write — see
// graphql/cacheUpdates.js for what each of these owes and why.
import { onNoteCreated, onNoteUpdated, onNoteDeleted, onTagsRewritten } from '../graphql/cacheUpdates';

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
    const { data } = await apolloClient.mutate({
        mutation: CREATE_NOTE,
        variables: noteData,
        update: onNoteCreated,
    });
    return { data: data.createNote };
};
export const updateNoteApi = async (id, noteData) => {
    const { data } = await apolloClient.mutate({
        mutation: UPDATE_NOTE,
        variables: { id, ...noteData },
        update: onNoteUpdated,
    });
    return { data: data.updateNote };
};
export const deleteNoteApi = async (id) => {
    const { data } = await apolloClient.mutate({
        mutation: DELETE_NOTE,
        variables: { id },
        // `deleteNote` returns a bare Boolean, so the id has to be closed over
        // here. Without the evict the row survived in every cached `notes(...)`
        // list and `/notes` rendered a ghost linking to a 404.
        update: onNoteDeleted(id),
    });
    return { data: data.deleteNote };
};

// Tags
export const getTagsApi = async () => {
    const { data } = await apolloClient.query({ query: GET_TAGS, fetchPolicy: 'network-only' });
    return { data: data.noteTags };
};

// Folders — deleted 2026-09-06 (Q65). NoteGeek never shipped a folder UI:
// nothing rendered a folder, nothing created one, and `store/folderStore.js`
// was still calling REST routes (`GET/POST /folders`) that were removed when
// the app moved to the gateway. Notes are organised by TAGS, which is the
// convention the sidebar, the search and the tag index all implement. The
// gateway's `Folder` type, resolvers and model were removed the same day (R127).

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
        const { data } = await apolloClient.mutate({
            mutation: RENAME_TAG,
            variables: { oldTag, newTag },
            update: onTagsRewritten,
        });
        return { data: data.renameTag };
    } catch (error) {
        console.error('API Rename Tag Error:', error);
        throw error;
    }
};

export const deleteTagApi = async (tag) => {
    try {
        const { data } = await apolloClient.mutate({
            mutation: DELETE_TAG,
            variables: { tag },
            update: onTagsRewritten,
        });
        return { data: data.deleteTag };
    } catch (error) {
        console.error('Delete tag failed:', error.message);
        throw error;
    }
};

export default apiClient; // Export the configured instance for direct use if needed