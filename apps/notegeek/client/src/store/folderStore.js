import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import apiClient from '../services/api'; // Assuming apiClient is the configured axios instance

const useFolderStore = create(devtools(persist((set) => ({
    folders: [],
    isLoading: false,
    error: null,

    // Fetch Folders
    fetchFolders: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await apiClient.get('/folders');
            set({ folders: response.data, isLoading: false });
        } catch (error) {
            console.error("Error fetching folders:", error);
            set({ error: error.response?.data?.message || 'Failed to fetch folders', isLoading: false });
        }
    },

    // Create Folder
    createFolder: async (folderData) => { // folderData should be like { name: 'New Folder Name' }
        set({ isLoading: true, error: null }); // Use isLoading for feedback
        try {
            // Use apiClient.post to create the folder
            const response = await apiClient.post('/folders', folderData);
            const newFolder = response.data;
            // Add the new folder to the existing list and sort alphabetically
            set((state) => ({
                folders: [...state.folders, newFolder].sort((a, b) => a.name.localeCompare(b.name)),
                isLoading: false,
            }));
            return newFolder; // Return the created folder
        } catch (error) {
            console.error("Error creating folder:", error);
            const errorMessage = error.response?.data?.message || 'Failed to create folder';
            set({ error: errorMessage, isLoading: false });
            // Throw error again so UI can catch it if needed
            throw new Error(errorMessage);
        }
    },

    // Clear folders on logout etc. (if needed)
    clearFolders: () => set({ folders: [], error: null }),

    // TODO: Add create/update/delete folder actions

}), {
    name: 'folder-storage', // unique name
})));

export default useFolderStore;