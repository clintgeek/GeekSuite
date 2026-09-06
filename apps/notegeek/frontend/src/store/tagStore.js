import { create } from 'zustand';
import {
    getTagsApi,
    renameTagApi,
    deleteTagApi,
} from '../services/api';

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
     * Rename one tag.
     *
     * Deliberately an EXACT match, matching what the server does. The resolver
     * is `Note.updateMany({ userId, tags: oldTag }, { $set: { 'tags.$': newTag } })`
     * (`graphql/notegeek/resolvers.js`), which touches only notes carrying that
     * literal string. This store used to rename the whole `oldTag/...` subtree
     * locally, so renaming `work` showed `newname/ideas` in the sidebar while
     * the database still said `work/ideas` — and the children snapped back on
     * the next real fetch. Renaming a subtree is a server-side decision; until
     * the resolver makes it, the client must not pretend it did.
     */
    renameTag: async (oldTag, newTag) => {
        set({ isLoading: true, error: null });
        try {
            await renameTagApi(oldTag, newTag);
            const tags = get().tags;
            const renamed = tags.map(tag => (tag === oldTag ? newTag : tag));
            // The server merges into an existing tag rather than duplicating,
            // so a rename onto a tag that already exists collapses the two.
            const updatedTags = [...new Set(renamed)].sort();
            set({ tags: updatedTags, isLoading: false });
        } catch (error) {
            set({
                error: error.message || 'Failed to rename tag',
                isLoading: false
            });
            throw error;
        }
    },

    /**
     * Delete one tag. Exact match, for the same reason `renameTag` is exact:
     * the resolver is `$pull: { tags: tag }`, which leaves `tag/child` alone.
     * Pruning the subtree here made deleted children reappear on refetch.
     */
    deleteTag: async (tag) => {
        set({ isLoading: true, error: null });
        try {
            await deleteTagApi(tag);
            const tags = get().tags;
            const updatedTags = tags.filter(t => t !== tag);
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