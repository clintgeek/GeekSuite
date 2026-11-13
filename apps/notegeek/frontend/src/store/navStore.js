import { create } from 'zustand';

/**
 * Desktop sidebar collapse (Chef, 2026-11-13: the tag column was in the way,
 * most of all on a sketch). Per device, remembered in localStorage — a
 * convenience, so a blocked or empty store just means "open".
 *
 * Phones never see this: they have no sidebar (Layout.jsx).
 */
const KEY = 'notegeek:navCollapsed';

const read = () => {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

const write = (collapsed) => {
  try {
    window.localStorage.setItem(KEY, collapsed ? '1' : '0');
  } catch {
    /* private window / blocked storage: the toggle still works this session */
  }
};

const useNavStore = create((set) => ({
  navCollapsed: read(),
  toggleNav: () =>
    set((s) => {
      const navCollapsed = !s.navCollapsed;
      write(navCollapsed);
      return { navCollapsed };
    }),
}));

export default useNavStore;
