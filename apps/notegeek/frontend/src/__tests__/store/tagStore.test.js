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
        /**
         * Nested tags (2026-09-30): the gateway now renames the whole subtree
         * (`house` → `home` makes `house/garage` `home/garage`), so the store
         * mirrors it. Before that, the resolver was an exact match and so was
         * this — the store must never rename what the server did not.
         */
        it('renames the tag and its subtree, matching what the resolver does', async () => {
            useTagStore.setState({ tags: ['parent', 'parent/child', 'parent/child/deep', 'parentless', 'other'] });
            renameTagApi.mockResolvedValueOnce({});

            await useTagStore.getState().renameTag('parent', 'newparent');

            const state = useTagStore.getState();
            expect(state.isLoading).toBe(false);
            expect(state.tags).toEqual(['newparent', 'newparent/child', 'newparent/child/deep', 'other', 'parentless']);
            expect(renameTagApi).toHaveBeenCalledWith('parent', 'newparent');
        });

        it('a move to a path carries the children', async () => {
            useTagStore.setState({ tags: ['garage', 'garage/door', 'house'] });
            renameTagApi.mockResolvedValueOnce({});

            await useTagStore.getState().renameTag('garage', ' house / garage ');

            expect(renameTagApi).toHaveBeenCalledWith('garage', 'house/garage');
            expect(useTagStore.getState().tags).toEqual(['house', 'house/garage', 'house/garage/door']);
        });

        it('refuses a move into its own descendant without calling the server', async () => {
            useTagStore.setState({ tags: ['house', 'house/garage'] });

            await expect(useTagStore.getState().renameTag('house', 'house/garage')).rejects.toThrow('inside itself');

            expect(renameTagApi).not.toHaveBeenCalled();
            expect(useTagStore.getState().tags).toEqual(['house', 'house/garage']);
        });

        it('collapses a rename onto an existing tag instead of listing it twice', async () => {
            useTagStore.setState({ tags: ['home', 'house'] });
            renameTagApi.mockResolvedValueOnce({});

            await useTagStore.getState().renameTag('house', 'home');

            expect(useTagStore.getState().tags).toEqual(['home']);
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
        // The gateway pulls the tag and its subtree; the store mirrors it —
        // and leaves a shared-prefix sibling (`deleted`) alone.
        it('removes the tag and its subtree, matching what the resolver does', async () => {
            useTagStore.setState({ tags: ['del', 'del/child', 'del/child/deep', 'keep', 'deleted'] });
            deleteTagApi.mockResolvedValueOnce({});

            await useTagStore.getState().deleteTag('del');

            const state = useTagStore.getState();
            expect(state.isLoading).toBe(false);
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
