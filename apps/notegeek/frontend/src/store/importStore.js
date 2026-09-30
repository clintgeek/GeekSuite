import { create } from 'zustand';

/**
 * Markdown import (components/new/NoteImporter.jsx, DOCS/CONTEXT.md §9).
 *
 * The importer is mounted once, inside Layout's toast provider. The New
 * surfaces that start an import (the phone's NewNoteSheet in the tab bar,
 * desktop's NewNoteMenu in the top bar) render OUTSIDE that provider, so
 * they cannot own the import themselves: their toasts would be dropped.
 * They call `openImportPicker()` instead, which reaches the importer's
 * hidden file input synchronously, inside the tap, as the browser requires
 * for a file picker.
 *
 *   picker        the importer's "open the file picker", or null
 *   editorDropOk  the new-note editor is empty, so a dropped file may take
 *                 its place (NoteEditorPage sets it)
 */
const useImportStore = create((set) => ({
  picker: null,
  editorDropOk: false,
  setPicker: (picker) => set({ picker }),
  setEditorDropOk: (editorDropOk) => set((s) => (s.editorDropOk === editorDropOk ? s : { editorDropOk })),
}));

/** Open the file picker. False when no importer is mounted. */
export function openImportPicker() {
  const pick = useImportStore.getState().picker;
  if (!pick) return false;
  pick();
  return true;
}

export default useImportStore;
