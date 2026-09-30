import { create } from 'zustand';
import {
    getTagsApi,
    renameTagApi,
    deleteTagApi,
} from '../services/api';
import { normalizeTag, isInSubtree, swapPrefix } from '../utils/tagPath';

const useTagStore = create((set, get) => ({
    tags: [],
    isLoading: false,
    error: null,

    // Action to fetch unique tags
    fetchTags: async () => {
        if (get().isLoading) return;
        set({ isLoading: true, error: null });
        try {
            const response = await getTagsApi();
            if (response.data) {
                set({ tags: response.data, isLoading: false }); // API returns sorted array of strings
            } else {
                throw new Error('No tags data received');
            }
        } catch (error) {
            const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch tags';
            set({ error: errorMessage, isLoading: false });
        }
    },

    // Action to add a new tag to the local state
    addTag: (newTag) => {
        set((state) => {
            // Only add if it's not already in the list
            if (!state.tags.includes(newTag)) {
                return { tags: [...state.tags, newTag].sort() };
            }
            return state;
        });
    },

    // Clear tags (useful for logout)
    clearTags: () => {
        set({ tags: [], error: null });
    },

    /**
     * Rename or move a tag WITH its subtree — the same thing the gateway does
     * (`graphql/notegeek/resolvers.js` renameTag): `house` → `home` makes
     * `house/garage` `home/garage`; `garage` → `house/garage` moves it and
     * its children. A rename onto an existing tag merges (one copy).
     *
     * The mirror is the point. Until 2026-09-30 the server renamed only the
     * exact tag, so this store did too — it had once renamed the subtree on
     * its own and the children snapped back on the next fetch. Now both
     * rewrite the subtree, with the same normalization.
     *
     * The server refuses a move into the tag's own descendant; so does this,
     * before the round trip, in the same words.
     */
    renameTag: async (oldTag, newTag) => {
        const from = normalizeTag(oldTag);
        const to = normalizeTag(newTag);
        if (from && to && from !== to && isInSubtree(to, from)) {
            const error = new Error(`Can't move #${from} inside itself (#${to}).`);
            set({ error: error.message });
            throw error;
        }
        set({ isLoading: true, error: null });
        try {
            await renameTagApi(from, to);
            const renamed = get().tags.map((tag) => swapPrefix(tag, from, to));
            set({ tags: [...new Set(renamed)].sort(), isLoading: false });
        } catch (error) {
            set({
                error: error.message || 'Failed to rename tag',
                isLoading: false
            });
            throw error;
        }
    },

    /**
     * Delete a tag AND every tag beneath it — the gateway's `deleteTag` pulls
     * the whole subtree. The notes stay.
     */
    deleteTag: async (tag) => {
        const root = normalizeTag(tag);
        set({ isLoading: true, error: null });
        try {
            await deleteTagApi(root);
            const updatedTags = get().tags.filter((t) => !isInSubtree(t, root));
            set({ tags: updatedTags, isLoading: false });
        } catch (error) {
            set({
                error: error.message || 'Failed to delete tag',
                isLoading: false
            });
            throw error;
        }
    }
}));

export default useTagStore;
