import { create } from 'zustand';
import {
  getMe,
  loginRedirect,
  logout as logoutServer,
  onLogout as onLogoutBroadcast,
  startRefreshTimer,
  stopRefreshTimer,
} from '@geeksuite/auth';

const useSharedAuthStore = create((set, get) => {
  const syncUserFromSession = async () => {
    const currentUser = await getMe();
    if (currentUser) {
      set({ user: currentUser, isAuthenticated: true });
      return true;
    }
    set({ user: null, isAuthenticated: false });
    return false;
  };

  return {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    _logoutUnsubscribe: null,

    login: async () => {
      set({ error: null, isLoading: true });
      try {
        const restored = await syncUserFromSession();
        if (restored) {
          set({ isLoading: false });
          return { authenticated: true };
        }
      } catch (error) {
        console.warn('Cookie-first login attempt failed', error);
      }
      set({ isLoading: false });
      loginRedirect('storygeek', window.location.href, 'login');
      return { redirected: true };
    },

    register: async () => {
      loginRedirect('storygeek', window.location.href, 'register');
      return { redirected: true };
    },

    logout: async () => {
      stopRefreshTimer();
      await logoutServer();
      set({ user: null, isAuthenticated: false, error: null });
    },

    hydrateUser: async () => {
      // Setup cross-tab logout listener
      let unsubscribe = get()._logoutUnsubscribe;
      if (!unsubscribe) {
        unsubscribe = onLogoutBroadcast(() => {
          stopRefreshTimer();
          set({ user: null, isAuthenticated: false, error: null });
        });
        set({ _logoutUnsubscribe: unsubscribe });
      }

      set({ isLoading: true, error: null });
      try {
        const success = await syncUserFromSession();
        if (success) {
          startRefreshTimer(() => {
            set({ user: null, isAuthenticated: false, error: null });
          });
        }
        return success;
      } catch (e) {
        set({ user: null, isAuthenticated: false, error: e?.message });
        return false;
      } finally {
        set({ isLoading: false });
      }
    },

    // Keep checkAuth as alias for hydrateUser (used by RequireAuth)
    checkAuth: async () => {
      return await get().hydrateUser();
    },

    // Keep initialize as alias for hydrateUser (used by SharedAuthProvider)
    initialize: async () => {
      return await get().hydrateUser();
    },
  };
});

export default useSharedAuthStore;
