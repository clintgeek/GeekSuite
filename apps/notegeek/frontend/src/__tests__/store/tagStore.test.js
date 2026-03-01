import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({
    getTagsApi: vi.fn(),
    renameTagApi: vi.fn(),
    deleteTagApi: vi.fn(),
}));

import useTagStore from '../../store/tagStore';
import { getTagsApi, renameTagApi, deleteTagApi } from '../../services/api';

describe('useTagStore', () => {
    const initialState = useTagStore.getState();

    beforeEach(() => {
        useTagStore.setState(initialState, true);
        vi.clearAllMocks();
    });

    // =========================================================================
    // fetchTags
    // =========================================================================
    describe('fetchTags', () => {
        it('should populate tags on success', async () => {
            const mockTags = ['apple', 'banana'];
            getTagsApi.mockResolvedValueOnce({ data: mockTags });

            const promise = useTagStore.getState().fetchTags();

            expect(useTagStore.getState().isLoading).toBe(true);
            await promise;

            const state = useTagStore.getState();
            expect(state.isLoading).toBe(false);
            expect(state.tags).toEqual(mockTags);
            expect(state.error).toBeNull();
        });

        it('should handle missing data array', async () => {
            getTagsApi.mockResolvedValueOnce({});

            await useTagStore.getState().fetchTags();

            const state = useTagStore.getState();
            expect(state.isLoading).toBe(false);
            expect(state.error).toBe('No tags data received');
        });

        it('should set error on failure', async () => {
            getTagsApi.mockRejectedValueOnce(new Error('API Error'));

            await useTagStore.getState().fetchTags();

            const state = useTagStore.getState();
            expect(state.isLoading).toBe(false);
            expect(state.error).toBe('API Error');
            expect(state.tags).toEqual([]);
        });

        it('should guard against concurrent fetches', async () => {
            getTagsApi.mockResolvedValueOnce({ data: [] });
            useTagStore.setState({ isLoading: true });

            await useTagStore.getState().fetchTags();

            expect(getTagsApi).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // addTag
    // =========================================================================
    describe('addTag', () => {
        it('should add unique tag and sort alphabetically', () => {
            useTagStore.setState({ tags: ['zebra', 'apple'] });

            useTagStore.getState().addTag('mango');

            expect(useTagStore.getState().tags).toEqual(['apple', 'mango', 'zebra']);
        });

        it('should ignore duplicate tags', () => {
            useTagStore.setState({ tags: ['apple', 'zebra'] });

            useTagStore.getState().addTag('apple');

            expect(useTagStore.getState().tags).toEqual(['apple', 'zebra']);
        });
    });

    // =========================================================================
    // renameTag
    // =========================================================================
    describe('renameTag', () => {
        it('should rename tag and its children', async () => {
            useTagStore.setState({ tags: ['parent', 'parent/child', 'other'] });
            renameTagApi.mockResolvedValueOnce({});

            await useTagStore.getState().renameTag('parent', 'newparent');

            const state = useTagStore.getState();
            expect(state.isLoading).toBe(false);
            expect(state.tags).toEqual(['newparent', 'newparent/child', 'other']);
        });

        it('should set error on API failure', async () => {
            renameTagApi.mockRejectedValueOnce(new Error('Rename failed'));

            await expect(useTagStore.getState().renameTag('old', 'new')).rejects.toThrow('Rename failed');

            const state = useTagStore.getState();
            expect(state.isLoading).toBe(false);
            expect(state.error).toBe('Rename failed');
        });
    });

    // =========================================================================
    // deleteTag
    // =========================================================================
    describe('deleteTag', () => {
        it('should remove tag and its children', async () => {
            useTagStore.setState({ tags: ['del', 'del/child', 'keep', 'deleted'] });
            deleteTagApi.mockResolvedValueOnce({});

            await useTagStore.getState().deleteTag('del');

            const state = useTagStore.getState();
            expect(state.isLoading).toBe(false);
            // Notice "deleted" does not start with "del/", so it shouldn't be removed
            // Wait, let's check the store logic:
            // updateTags = tags.filter(t => t !== tag && !t.startsWith(tag + '/'))
            // "deleted" starts with "del", but not "del/".
            expect(state.tags).toEqual(['keep', 'deleted']);
        });

        it('should set error on API failure', async () => {
            deleteTagApi.mockRejectedValueOnce(new Error('Delete failed'));

            await expect(useTagStore.getState().deleteTag('del')).rejects.toThrow('Delete failed');

            const state = useTagStore.getState();
            expect(state.isLoading).toBe(false);
            expect(state.error).toBe('Delete failed');
        });
    });

    // =========================================================================
    // clearTags
    // =========================================================================
    describe('clearTags', () => {
        it('should reset tags array and error', () => {
            useTagStore.setState({ tags: ['a', 'b'], error: 'err' });

            useTagStore.getState().clearTags();

            expect(useTagStore.getState().tags).toEqual([]);
            expect(useTagStore.getState().error).toBeNull();
        });
    });
});
