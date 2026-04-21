import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  getMe,
  loginRedirect,
  logout as logoutServer,
  onLogout as onLogoutBroadcast,
  startRefreshTimer,
  stopRefreshTimer
} from '@geeksuite/auth';

const useAuthStore = create(
  persist(
    (set, get) => {
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

        clearError: () => set({ error: null }),

        login: async () => {
          set({ error: null, isLoading: true });
          try {
            const restored = await syncUserFromSession();
            if (restored) return { authenticated: true };
          } catch (error) {
            console.warn('Cookie-first login attempt failed', error);
          } finally {
            set({ isLoading: false });
          }
          loginRedirect('dashgeek', window.location.href, 'login');
          return { redirected: true };
        },

        register: async () => {
          loginRedirect('dashgeek', window.location.href, 'register');
          return { redirected: true };
        },

        logout: async () => {
          stopRefreshTimer();
          await logoutServer();
          set({ user: null, isAuthenticated: false, error: null });
        },

        hydrateUser: async () => {
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
            set({
              user: null,
              isAuthenticated: false,
              error: e?.message || 'Failed to fetch session'
            });
            return false;
          } finally {
            set({ isLoading: false });
          }
        },
      };
    },
    {
      name: 'dashgeek-auth-storage',
      version: 1,
      partialize: () => ({}),
      migrate: () => ({}),
      merge: (_persistedState, currentState) => currentState,
    }
  )
);

export default useAuthStore;
