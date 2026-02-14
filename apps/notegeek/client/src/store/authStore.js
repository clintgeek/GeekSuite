import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import useNoteStore from './noteStore';
import { getMe, loginRedirect, logout as logoutServer, onLogout as onLogoutBroadcast, startRefreshTimer, stopRefreshTimer } from '../utils/authClient';
import { reset as resetUserStore } from '../utils/resetUserStore';

const useAuthStore = create(
    persist(
        (set, get) => {
            const syncUserFromSession = async () => {
                const currentUser = await getMe();
                if (currentUser) {
                    set({ user: currentUser, isAuthenticated: true });
                    try {
                        const noteStore = useNoteStore.getState();
                        await noteStore.fetchNotes?.();
                    } catch {
                        // ignore downstream fetch errors
                    }
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
                        if (restored) {
                            return { authenticated: true };
                        }
                    } catch (error) {
                        console.warn('Cookie-first login attempt failed', error);
                    } finally {
                        set({ isLoading: false });
                    }

                    loginRedirect(window.location.href, 'login');
                    return { redirected: true };
                },

                register: async () => {
                    loginRedirect(window.location.href, 'register');
                    return { redirected: true };
                },

                logout: async () => {
                    stopRefreshTimer();
                    resetUserStore();
                    await logoutServer();
                    set({ user: null, isAuthenticated: false, error: null });
                },

                hydrateUser: async () => {
                    let unsubscribe = get()._logoutUnsubscribe;
                    if (!unsubscribe) {
                        unsubscribe = onLogoutBroadcast(() => {
                            stopRefreshTimer();
                            resetUserStore();
                            set({ user: null, isAuthenticated: false, error: null });
                            try {
                                const noteStore = useNoteStore.getState();
                                noteStore.clearNotes?.();
                            } catch {
                                // ignore
                            }
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
                        set({ user: null, isAuthenticated: false, error: e?.message || 'Failed to fetch session' });
                        return false;
                    } finally {
                        set({ isLoading: false });
                    }
                },
            };
        },
        {
            name: 'auth-storage',
            version: 2,
            partialize: () => ({}),
            migrate: () => ({}),
            merge: (_persistedState, currentState) => currentState,
        }
    )
);

export default useAuthStore;