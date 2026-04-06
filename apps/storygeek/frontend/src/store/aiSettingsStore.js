import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAISettingsStore = create(
  persist(
    (set) => ({
      selectedProvider: null,
      selectedModelId: null,
      setSelection: (provider, modelId) => set({ selectedProvider: provider, selectedModelId: modelId })
    }),
    {
      name: 'storygeek-ai-settings'
    }
  )
);

export default useAISettingsStore;


