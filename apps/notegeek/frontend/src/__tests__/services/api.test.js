import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { setupAxiosInterceptors } from '@geeksuite/auth';

// Mock axios — still used for auth endpoints
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

// Mock the Apollo client — api.js delegates all CRUD to it.
// vi.hoisted ensures the mock object exists before the hoisted vi.mock factory runs.
const { mockApollo } = vi.hoisted(() => {
    const mockApollo = {
        query: vi.fn(),
        mutate: vi.fn(),
    };
    return { mockApollo };
});
vi.mock('../../apolloClient', () => ({
    apolloClient: mockApollo,
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
import {
    GET_NOTES,
    GET_NOTE_BY_ID,
    GET_TAGS,
    GET_FOLDERS,
    SEARCH_NOTES,
} from '../../graphql/queries';
import {
    CREATE_NOTE,
    UPDATE_NOTE,
    DELETE_NOTE,
    CREATE_FOLDER,
    UPDATE_FOLDER,
    DELETE_FOLDER,
    RENAME_TAG,
    DELETE_TAG,
} from '../../graphql/mutations';

describe('API Service', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    // =========================================================================
    // Axios client setup
    // =========================================================================
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
    // Auth endpoints (still REST via axios)
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
    // Notes endpoints (GraphQL)
    // =========================================================================
    it('getNotesApi calls apollo query with GET_NOTES and filters', async () => {
        const filters = { tag: 'work' };
        mockApollo.query.mockResolvedValueOnce({ data: { notes: [] } });
        await getNotesApi(filters);
        expect(mockApollo.query).toHaveBeenCalledWith({
            query: GET_NOTES,
            variables: filters,
            fetchPolicy: 'network-only',
        });
    });

    it('getNoteByIdApi calls apollo query with GET_NOTE_BY_ID', async () => {
        mockApollo.query.mockResolvedValueOnce({ data: { note: { id: '123' } } });
        await getNoteByIdApi('123');
        expect(mockApollo.query).toHaveBeenCalledWith({
            query: GET_NOTE_BY_ID,
            variables: { id: '123' },
            fetchPolicy: 'network-only',
        });
    });

    it('createNoteApi calls apollo mutate with CREATE_NOTE', async () => {
        const note = { title: 'New Note', content: 'hello' };
        mockApollo.mutate.mockResolvedValueOnce({ data: { createNote: { id: '1' } } });
        await createNoteApi(note);
        expect(mockApollo.mutate).toHaveBeenCalledWith({
            mutation: CREATE_NOTE,
            variables: note,
        });
    });

    it('updateNoteApi calls apollo mutate with UPDATE_NOTE', async () => {
        const note = { title: 'Updated' };
        mockApollo.mutate.mockResolvedValueOnce({ data: { updateNote: { id: '123' } } });
        await updateNoteApi('123', note);
        expect(mockApollo.mutate).toHaveBeenCalledWith({
            mutation: UPDATE_NOTE,
            variables: { id: '123', title: 'Updated' },
        });
    });

    it('deleteNoteApi calls apollo mutate with DELETE_NOTE', async () => {
        mockApollo.mutate.mockResolvedValueOnce({ data: { deleteNote: true } });
        await deleteNoteApi('123');
        expect(mockApollo.mutate).toHaveBeenCalledWith({
            mutation: DELETE_NOTE,
            variables: { id: '123' },
        });
    });

    // =========================================================================
    // Tags and Folders endpoints (GraphQL)
    // =========================================================================
    it('getTagsApi calls apollo query with GET_TAGS', async () => {
        mockApollo.query.mockResolvedValueOnce({ data: { noteTags: [] } });
        await getTagsApi();
        expect(mockApollo.query).toHaveBeenCalledWith({
            query: GET_TAGS,
            fetchPolicy: 'network-only',
        });
    });

    it('createFolderApi calls apollo mutate with CREATE_FOLDER', async () => {
        const folder = { name: 'Work' };
        mockApollo.mutate.mockResolvedValueOnce({ data: { createFolder: { id: '1' } } });
        await createFolderApi(folder);
        expect(mockApollo.mutate).toHaveBeenCalledWith({
            mutation: CREATE_FOLDER,
            variables: folder,
        });
    });

    it('getFoldersApi calls apollo query with GET_FOLDERS', async () => {
        mockApollo.query.mockResolvedValueOnce({ data: { folders: [] } });
        await getFoldersApi();
        expect(mockApollo.query).toHaveBeenCalledWith({
            query: GET_FOLDERS,
            fetchPolicy: 'network-only',
        });
    });

    it('updateFolderApi calls apollo mutate with UPDATE_FOLDER', async () => {
        const folder = { name: 'New Name' };
        mockApollo.mutate.mockResolvedValueOnce({ data: { updateFolder: { id: '123' } } });
        await updateFolderApi('123', folder);
        expect(mockApollo.mutate).toHaveBeenCalledWith({
            mutation: UPDATE_FOLDER,
            variables: { id: '123', name: 'New Name' },
        });
    });

    it('deleteFolderApi calls apollo mutate with DELETE_FOLDER and cascade param', async () => {
        mockApollo.mutate.mockResolvedValueOnce({ data: { deleteFolder: true } });
        await deleteFolderApi('123', true);
        expect(mockApollo.mutate).toHaveBeenCalledWith({
            mutation: DELETE_FOLDER,
            variables: { id: '123', deleteNotes: true },
        });

        mockApollo.mutate.mockResolvedValueOnce({ data: { deleteFolder: true } });
        await deleteFolderApi('456', false);
        expect(mockApollo.mutate).toHaveBeenCalledWith({
            mutation: DELETE_FOLDER,
            variables: { id: '456', deleteNotes: false },
        });
    });

    // =========================================================================
    // Search endpoints (GraphQL)
    // =========================================================================
    it('searchNotesApi calls apollo query with SEARCH_NOTES and rethrows errors', async () => {
        mockApollo.query.mockResolvedValueOnce({ data: { searchNotes: [] } });
        await searchNotesApi('query');
        expect(mockApollo.query).toHaveBeenCalledWith({
            query: SEARCH_NOTES,
            variables: { q: 'query' },
            fetchPolicy: 'network-only',
        });

        const searchError = new Error('Network error');
        mockApollo.query.mockRejectedValueOnce(searchError);
        await expect(searchNotesApi('fail')).rejects.toThrow('Network error');
    });

    // =========================================================================
    // Tag Management endpoints (GraphQL)
    // =========================================================================
    it('renameTagApi calls apollo mutate with RENAME_TAG and sends correct payload', async () => {
        mockApollo.mutate.mockResolvedValueOnce({ data: { renameTag: true } });
        await renameTagApi('old', 'new');
        expect(mockApollo.mutate).toHaveBeenCalledWith({
            mutation: RENAME_TAG,
            variables: { oldTag: 'old', newTag: 'new' },
        });

        const error = new Error('Rename failed');
        mockApollo.mutate.mockRejectedValueOnce(error);
        await expect(renameTagApi('fail', 'x')).rejects.toThrow('Rename failed');
    });

    it('deleteTagApi calls apollo mutate with DELETE_TAG', async () => {
        mockApollo.mutate.mockResolvedValueOnce({ data: { deleteTag: true } });
        await deleteTagApi('tag/with/slash');
        expect(mockApollo.mutate).toHaveBeenCalledWith({
            mutation: DELETE_TAG,
            variables: { tag: 'tag/with/slash' },
        });

        const error = new Error('Delete failed');
        mockApollo.mutate.mockRejectedValueOnce(error);
        await expect(deleteTagApi('fail')).rejects.toThrow('Delete failed');
    });
});
