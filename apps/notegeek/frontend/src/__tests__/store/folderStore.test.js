import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
    }
}));

import useFolderStore from '../../store/folderStore';
import apiClient from '../../services/api';

describe('useFolderStore', () => {
    const initialState = useFolderStore.getState();

    beforeEach(() => {
        useFolderStore.setState(initialState, true);
        vi.clearAllMocks();
        // Clear mock localStorage from zustand persist
        localStorage.clear();

        // Suppress console errors during negative test cases
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    // =========================================================================
    // fetchFolders
    // =========================================================================
    describe('fetchFolders', () => {
        it('should set folders on success', async () => {
            const mockFolders = [{ id: 1, name: 'Work' }];
            apiClient.get.mockResolvedValueOnce({ data: mockFolders });

            await useFolderStore.getState().fetchFolders();

            const state = useFolderStore.getState();
            expect(apiClient.get).toHaveBeenCalledWith('/folders');
            expect(state.isLoading).toBe(false);
            expect(state.folders).toEqual(mockFolders);
            expect(state.error).toBeNull();
        });

        it('should set error on failure', async () => {
            apiClient.get.mockRejectedValueOnce({ response: { data: { message: 'Fetch failed' } } });

            await useFolderStore.getState().fetchFolders();

            const state = useFolderStore.getState();
            expect(state.isLoading).toBe(false);
            expect(state.error).toBe('Fetch failed');
            expect(state.folders).toEqual([]);
        });
    });

    // =========================================================================
    // createFolder
    // =========================================================================
    describe('createFolder', () => {
        it('should add folder sorted and return it on success', async () => {
            useFolderStore.setState({ folders: [{ name: 'Zebra' }, { name: 'Apple' }] });

            const newFolder = { name: 'Banana' };
            apiClient.post.mockResolvedValueOnce({ data: newFolder });

            const result = await useFolderStore.getState().createFolder(newFolder);

            const state = useFolderStore.getState();
            expect(apiClient.post).toHaveBeenCalledWith('/folders', newFolder);
            expect(result).toEqual(newFolder);
            expect(state.isLoading).toBe(false);
            // Verify sorting: Apple, Banana, Zebra
            expect(state.folders).toEqual([{ name: 'Apple' }, { name: 'Banana' }, { name: 'Zebra' }]);
            expect(state.error).toBeNull();
        });

        it('should throw error on failure and set state', async () => {
            apiClient.post.mockRejectedValueOnce({ response: { data: { message: 'Create failed' } } });

            await expect(useFolderStore.getState().createFolder({ name: 'New' })).rejects.toThrow('Create failed');

            const state = useFolderStore.getState();
            expect(state.isLoading).toBe(false);
            expect(state.error).toBe('Create failed');
        });
    });

    // =========================================================================
    // clearFolders
    // =========================================================================
    describe('clearFolders', () => {
        it('should reset folders and error', () => {
            useFolderStore.setState({ folders: [{ name: 'F1' }], error: 'err' });

            useFolderStore.getState().clearFolders();

            const state = useFolderStore.getState();
            expect(state.folders).toEqual([]);
            expect(state.error).toBeNull();
        });
    });
});
