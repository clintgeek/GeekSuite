import { create } from 'zustand';

/** Whether the "New 1:1" person picker is open (components/oneOnOne/OneOnOnePicker.jsx). */
const useOneOnOneStore = create((set) => ({
  open: false,
  openPicker: () => set({ open: true }),
  closePicker: () => set({ open: false }),
}));

export const openOneOnOnePicker = () => useOneOnOneStore.getState().openPicker();

export default useOneOnOneStore;
