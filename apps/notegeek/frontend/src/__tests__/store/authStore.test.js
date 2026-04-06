import { vi, describe, it, expect, beforeEach } from 'vitest';

// --- Mocks ---
vi.mock('@geeksuite/auth', () => ({
    getMe: vi.fn(),
    loginRedirect: vi.fn(),
    logout: vi.fn(),
    onLogout: vi.fn(),
    startRefreshTimer: vi.fn(),
    stopRefreshTimer: vi.fn(),
}));

vi.mock('../../utils/resetUserStore', () => ({
    reset: vi.fn(),
}));

vi.mock('../../store/noteStore', () => ({
    default: {
        getState: vi.fn(() => ({
            fetchNotes: vi.fn(),
            clearNotes: vi.fn(),
        })),
    },
}));

import useAuthStore from '../../store/authStore';
import useNoteStore from '../../store/noteStore';
import { getMe, loginRedirect, logout, onLogout, startRefreshTimer, stopRefreshTimer } from '@geeksuite/auth';
import { reset as resetUserStore } from '../../utils/resetUserStore';

describe('useAuthStore', () => {
    const initialState = useAuthStore.getState();

    beforeEach(() => {
        useAuthStore.setState(initialState, true);
        vi.clearAllMocks();
        // Since persist uses localStorage by default in jsdom, we can clear it
        localStorage.clear();
    });

    // =========================================================================
    // clearError
    // =========================================================================
    describe('clearError', () => {
        it('should clear error state', () => {
            useAuthStore.setState({ error: 'Some error' });
            useAuthStore.getState().clearError();
            expect(useAuthStore.getState().error).toBeNull();
        });
    });

    // =========================================================================
    // login
    // =========================================================================
    describe('login', () => {
        it('should authenticate from session if getMe succeeds', async () => {
            const mockUser = { id: 1, name: 'Test User' };
            getMe.mockResolvedValueOnce(mockUser);

            const mockFetchNotes = vi.fn().mockResolvedValueOnce();
            useNoteStore.getState.mockReturnValueOnce({ fetchNotes: mockFetchNotes });

            const result = await useAuthStore.getState().login();

            expect(result).toEqual({ authenticated: true });
            expect(useAuthStore.getState().user).toEqual(mockUser);
            expect(useAuthStore.getState().isAuthenticated).toBe(true);
            expect(mockFetchNotes).toHaveBeenCalled();
            expect(loginRedirect).not.toHaveBeenCalled();
        });

        it('should redirect if getMe fails (no session)', async () => {
            getMe.mockResolvedValueOnce(null);

            const result = await useAuthStore.getState().login();

            expect(result).toEqual({ redirected: true });
            expect(useAuthStore.getState().user).toBeNull();
            expect(useAuthStore.getState().isAuthenticated).toBe(false);
            expect(loginRedirect).toHaveBeenCalledWith('notegeek', window.location.href, 'login');
        });

        it('should handle cookie-first failure (exception)', async () => {
            getMe.mockRejectedValueOnce(new Error('Network failure'));

            const result = await useAuthStore.getState().login();

            expect(result).toEqual({ redirected: true });
            expect(useAuthStore.getState().user).toBeNull();
            expect(useAuthStore.getState().isAuthenticated).toBe(false);
            expect(loginRedirect).toHaveBeenCalled();
        });
    });

    // =========================================================================
    // register
    // =========================================================================
    describe('register', () => {
        it('should call loginRedirect with register mode', async () => {
            const result = await useAuthStore.getState().register();

            expect(result).toEqual({ redirected: true });
            expect(loginRedirect).toHaveBeenCalledWith('notegeek', window.location.href, 'register');
        });
    });

    // =========================================================================
    // logout
    // =========================================================================
    describe('logout', () => {
        it('should stop refresh, reset stores, and call server logout', async () => {
            useAuthStore.setState({ user: { id: 1 }, isAuthenticated: true, error: 'err' });
            logout.mockResolvedValueOnce();

            await useAuthStore.getState().logout();

            const state = useAuthStore.getState();
            expect(stopRefreshTimer).toHaveBeenCalled();
            expect(resetUserStore).toHaveBeenCalled();
            expect(logout).toHaveBeenCalled();
            expect(state.user).toBeNull();
            expect(state.isAuthenticated).toBe(false);
            expect(state.error).toBeNull();
        });
    });

    // =========================================================================
    // hydrateUser
    // =========================================================================
    describe('hydrateUser', () => {
        it('should restore user and start refresh timer on success', async () => {
            const mockUser = { id: 1 };
            getMe.mockResolvedValueOnce(mockUser);

            const result = await useAuthStore.getState().hydrateUser();

            expect(result).toBe(true);
            const state = useAuthStore.getState();
            expect(state.user).toEqual(mockUser);
            expect(state.isAuthenticated).toBe(true);
            expect(startRefreshTimer).toHaveBeenCalled();
        });

        it('should sets error on failure', async () => {
            getMe.mockRejectedValueOnce(new Error('Fetch failed'));

            const result = await useAuthStore.getState().hydrateUser();

            expect(result).toBe(false);
            const state = useAuthStore.getState();
            expect(state.user).toBeNull();
            expect(state.isAuthenticated).toBe(false);
            expect(state.error).toBe('Fetch failed');
            expect(startRefreshTimer).not.toHaveBeenCalled();
        });

        it('should subscribe to logout broadcast only once', async () => {
            getMe.mockResolvedValueOnce(null);
            const mockUnsubscribe = vi.fn();
            onLogout.mockReturnValueOnce(mockUnsubscribe);

            await useAuthStore.getState().hydrateUser();

            expect(onLogout).toHaveBeenCalledTimes(1);
            expect(useAuthStore.getState()._logoutUnsubscribe).toBe(mockUnsubscribe);

            // Second call should not subscribe again
            getMe.mockResolvedValueOnce(null);
            await useAuthStore.getState().hydrateUser();
            expect(onLogout).toHaveBeenCalledTimes(1);
        });

        it('should handle logout broadcast execution', async () => {
            getMe.mockResolvedValueOnce(null);

            // Capture the broadcast callback
            let broadcastCallback;
            onLogout.mockImplementationOnce((cb) => {
                broadcastCallback = cb;
                return vi.fn();
            });

            await useAuthStore.getState().hydrateUser();

            // Execute the broadcast
            const mockClearNotes = vi.fn();
            useNoteStore.getState.mockReturnValueOnce({ clearNotes: mockClearNotes });

            broadcastCallback();

            expect(stopRefreshTimer).toHaveBeenCalled();
            expect(resetUserStore).toHaveBeenCalled();
            expect(mockClearNotes).toHaveBeenCalled();
        });
    });
});
