import { vi, describe, it, expect, beforeEach } from 'vitest';
import axios from 'axios';
import { setupAxiosInterceptors } from '@geeksuite/auth';

// Mock axios
vi.mock('axios', () => {
    const mockAxiosInstance = {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    };
    return {
        default: {
            create: vi.fn(() => mockAxiosInstance),
        }
    };
});

// Mock @geeksuite/auth
vi.mock('@geeksuite/auth', () => ({
    setupAxiosInterceptors: vi.fn(),
}));

// Import after mocks
import apiClient, {
    loginApi,
    registerApi,
    logoutApi,
    getMeApi,
    getNotesApi,
    getNoteByIdApi,
    createNoteApi,
    updateNoteApi,
    deleteNoteApi,
    getTagsApi,
    createFolderApi,
    getFoldersApi,
    updateFolderApi,
    deleteFolderApi,
    searchNotesApi,
    renameTagApi,
    deleteTagApi,
} from '../../services/api';

describe('API Service', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });
    beforeEach(() => {
        // Suppress console errors for specific tests
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    it('apiClient is created with correct config', () => {
        expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
            withCredentials: true,
            headers: { 'Content-Type': 'application/json' },
            xsrfCookieName: 'XSRF-TOKEN',
            xsrfHeaderName: 'X-XSRF-TOKEN',
            credentials: 'include',
        }));
        expect(setupAxiosInterceptors).toHaveBeenCalledWith(apiClient);
    });

    // =========================================================================
    // Auth endpoints
    // =========================================================================
    it('loginApi calls POST /auth/login', async () => {
        const credentials = { email: 'test@test.com', password: 'password' };
        apiClient.post.mockResolvedValueOnce({ data: { token: '123' } });
        await loginApi(credentials);
        expect(apiClient.post).toHaveBeenCalledWith('/auth/login', credentials);
    });

    it('registerApi calls POST /auth/register', async () => {
        const userData = { email: 'test@test.com', password: 'password' };
        await registerApi(userData);
        expect(apiClient.post).toHaveBeenCalledWith('/auth/register', userData);
    });

    it('logoutApi calls POST /auth/logout', async () => {
        await logoutApi();
        expect(apiClient.post).toHaveBeenCalledWith('/auth/logout');
    });

    it('getMeApi calls GET /auth/me', async () => {
        await getMeApi();
        expect(apiClient.get).toHaveBeenCalledWith('/auth/me');
    });

    // =========================================================================
    // Notes endpoints
    // =========================================================================
    it('getNotesApi calls GET /notes with filters', async () => {
        const filters = { tag: 'work' };
        await getNotesApi(filters);
        expect(apiClient.get).toHaveBeenCalledWith('/notes', { params: filters });
    });

    it('getNoteByIdApi calls GET /notes/:id', async () => {
        await getNoteByIdApi('123');
        expect(apiClient.get).toHaveBeenCalledWith('/notes/123');
    });

    it('createNoteApi calls POST /notes', async () => {
        const note = { title: 'New Note', content: 'hello' };
        await createNoteApi(note);
        expect(apiClient.post).toHaveBeenCalledWith('/notes', note);
    });

    it('updateNoteApi calls PUT /notes/:id', async () => {
        const note = { title: 'Updated' };
        await updateNoteApi('123', note);
        expect(apiClient.put).toHaveBeenCalledWith('/notes/123', note);
    });

    it('deleteNoteApi calls DELETE /notes/:id', async () => {
        await deleteNoteApi('123');
        expect(apiClient.delete).toHaveBeenCalledWith('/notes/123');
    });

    // =========================================================================
    // Tags and Folders endpoints
    // =========================================================================
    it('getTagsApi calls GET /tags', async () => {
        await getTagsApi();
        expect(apiClient.get).toHaveBeenCalledWith('/tags');
    });

    it('createFolderApi calls POST /folders', async () => {
        const folder = { name: 'Work' };
        await createFolderApi(folder);
        expect(apiClient.post).toHaveBeenCalledWith('/folders', folder);
    });

    it('getFoldersApi calls GET /folders', async () => {
        await getFoldersApi();
        expect(apiClient.get).toHaveBeenCalledWith('/folders');
    });

    it('updateFolderApi calls PUT /folders/:id', async () => {
        const folder = { name: 'New Name' };
        await updateFolderApi('123', folder);
        expect(apiClient.put).toHaveBeenCalledWith('/folders/123', folder);
    });

    it('deleteFolderApi calls DELETE /folders/:id with cascade param', async () => {
        await deleteFolderApi('123', true);
        expect(apiClient.delete).toHaveBeenCalledWith('/folders/123?deleteNotes=true');

        await deleteFolderApi('456', false);
        expect(apiClient.delete).toHaveBeenCalledWith('/folders/456?deleteNotes=false');
    });

    // =========================================================================
    // Search endpoints
    // =========================================================================
    it('searchNotesApi calls GET /search and rethrows errors', async () => {
        apiClient.get.mockResolvedValueOnce({ data: [] });
        await searchNotesApi('query');
        expect(apiClient.get).toHaveBeenCalledWith('/search', { params: { q: 'query' } });

        const searchError = new Error('Network error');
        apiClient.get.mockRejectedValueOnce(searchError);
        await expect(searchNotesApi('fail')).rejects.toThrow('Network error');
    });

    // =========================================================================
    // Tag Management endpoints
    // =========================================================================
    it('renameTagApi calls PUT /tags/rename and sends correct payload', async () => {
        apiClient.put.mockResolvedValueOnce({ data: {} });
        await renameTagApi('old', 'new');
        expect(apiClient.put).toHaveBeenCalledWith('/tags/rename', { oldTag: 'old', newTag: 'new' });

        const error = new Error('Rename failed');
        apiClient.put.mockRejectedValueOnce(error);
        await expect(renameTagApi('fail', 'x')).rejects.toThrow('Rename failed');
    });

    it('deleteTagApi calls DELETE with encoded URL', async () => {
        apiClient.delete.mockResolvedValueOnce({ data: {} });
        await deleteTagApi('tag/with/slash');
        // 'tag/with/slash' -> 'tag%2Fwith%2Fslash'
        expect(apiClient.delete).toHaveBeenCalledWith(`/tags/tag%2Fwith%2Fslash`);

        const error = new Error('Delete failed');
        apiClient.delete.mockRejectedValueOnce(error);
        await expect(deleteTagApi('fail')).rejects.toThrow('Delete failed');
    });
});
