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

    renameTag: async (oldTag, newTag) => {
        set({ isLoading: true, error: null });
        try {
            await renameTagApi(oldTag, newTag);
            // Update local state
            const tags = get().tags;
            const updatedTags = tags.map(tag =>
                tag === oldTag ? newTag :
                tag.startsWith(oldTag + '/') ? newTag + tag.substring(oldTag.length) :
                tag
            );
            set({ tags: updatedTags, isLoading: false });
        } catch (error) {
            set({
                error: error.message || 'Failed to rename tag',
                isLoading: false
            });
            throw error;
        }
    },

    deleteTag: async (tag) => {
        set({ isLoading: true, error: null });
        try {
            await deleteTagApi(tag);
            // Update local state
            const tags = get().tags;
            const updatedTags = tags.filter(t =>
                t !== tag && !t.startsWith(tag + '/')
            );
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