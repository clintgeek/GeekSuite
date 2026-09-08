import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The player's model choice for their stories.
 *
 * `null` / `null` is **Automatic**, and it is the default: aiGeek picks from
 * its live alive-model list and remembers the pick per story (its sticky
 * pick), so the Game Master's voice stays consistent without anybody naming a
 * model. That replaced the backend's `STORYGEEK_GM_PROVIDER` /
 * `STORYGEEK_GM_MODEL` env-var pin in Phase 2.
 *
 * A non-null pair is a **pin**: a row the player chose from
 * `GET /api/ai/models/alive`, sent as `provider` + `model` on that story's
 * turns. A pin aiGeek cannot honour degrades to the automatic pick and the
 * turn reports a one-line notice, rather than failing.
 *
 * The keys keep their old names (and the store its old persisted name) so a
 * player's existing choice survives the upgrade. A stored row that is no
 * longer alive is dropped by the Settings page on load — see Settings.jsx.
 */
const useAISettingsStore = create(
  persist(
    (set) => ({
      selectedProvider: null,
      selectedModelId: null,
      setSelection: (provider, modelId) => set({
        selectedProvider: provider || null,
        selectedModelId: modelId || null
      }),
      /** Back to letting aiGeek choose. */
      clearSelection: () => set({ selectedProvider: null, selectedModelId: null })
    }),
    {
      name: 'storygeek-ai-settings'
    }
  )
);

export default useAISettingsStore;
