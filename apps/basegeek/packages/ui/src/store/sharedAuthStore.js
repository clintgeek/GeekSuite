import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

const useSharedAuthStore = create(
    persist(
        (set, get) => ({
            token: null,
            refreshToken: null,
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
            currentApp: null,
            lastActivity: null,

            // Initialize auth state
            initialize: async (app) => {
                const state = get();
                if (!state.token) return false;

                try {
                    const response = await axios.post('/api/auth/validate', {
                        token: state.token,
                        app
                    });

                    if (response.data.valid) {
                        set({
                            user: response.data.user,
                            isAuthenticated: true,
                            currentApp: app,
                            error: null,
                            lastActivity: Date.now()
                        });
                        return true;
                    }
                } catch (error) {
                    // Try to refresh the token if we have a refresh token
                    if (state.refreshToken) {
                        try {
                            const refreshResult = await get().refreshToken();
                            if (refreshResult) return true;
                        } catch (refreshError) {
                            console.error('Failed to refresh token during initialize:', refreshError);
                        }
                    }

                    set({
                        token: null,
                        refreshToken: null,
                        user: null,
                        isAuthenticated: false,
                        currentApp: null,
                        error: 'Session expired'
                    });
                }
                return false;
            },

            // Login to any app
            login: async (identifier, password, app) => {
                console.log('sharedAuthStore login called', identifier, app);
                try {
                    set({ isLoading: true, error: null });
                    const response = await axios.post('/api/auth/login', {
                        identifier,
                        password,
                        app
                    });

                    console.log('sharedAuthStore login response.data:', response.data);
                    const { token, refreshToken, user } = response.data;
                    if (!token || !user) {
                        throw new Error('Invalid response from server');
                    }

                    set({
                        token,
                        refreshToken,
                        user,
                        isAuthenticated: true,
                        currentApp: app,
                        error: null,
                        isLoading: false,
                        lastActivity: Date.now()
                    });

                    // Broadcast auth state change
                    window.postMessage({
                        type: 'GEEK_AUTH_STATE_CHANGE',
                        payload: { token, refreshToken, user, app }
                    }, '*');

                    console.log('sharedAuthStore login returning:', response.data);
                    return response.data;
                } catch (error) {
                    const errorMessage = error.response?.data?.message || error.message || 'Login failed';
                    set({
                        error: errorMessage,
                        isLoading: false,
                        isAuthenticated: false,
                        token: null,
                        refreshToken: null,
                        user: null,
                        currentApp: null
                    });
                    console.log('sharedAuthStore login error:', error);
                    return { error: errorMessage };
                }
            },

            // Register new user
            register: async (username, email, password, app) => {
                try {
                    set({ isLoading: true, error: null });
                    const response = await axios.post('/api/auth/register', {
                        username,
                        email,
                        password,
                        app
                    });

                    const { token, refreshToken, user } = response.data;
                    if (!token || !user) {
                        throw new Error('Invalid response from server');
                    }

                    set({
                        token,
                        refreshToken,
                        user,
                        isAuthenticated: true,
                        currentApp: app,
                        error: null,
                        isLoading: false,
                        lastActivity: Date.now()
                    });

                    // Broadcast auth state change
                    window.postMessage({
                        type: 'GEEK_AUTH_STATE_CHANGE',
                        payload: { token, refreshToken, user, app }
                    }, '*');

                    return response.data;
                } catch (error) {
                    const errorMessage = error.response?.data?.message || error.message || 'Registration failed';
                    set({
                        error: errorMessage,
                        isLoading: false,
                        isAuthenticated: false,
                        token: null,
                        refreshToken: null,
                        user: null,
                        currentApp: null
                    });
                    return { error: errorMessage };
                }
            },

            // Logout from all apps
            logout: () => {
                set({
                    token: null,
                    refreshToken: null,
                    user: null,
                    isAuthenticated: false,
                    currentApp: null,
                    error: null,
                    lastActivity: null
                });

                // Broadcast logout
                window.postMessage({
                    type: 'GEEK_AUTH_STATE_CHANGE',
                    payload: { token: null, refreshToken: null, user: null, app: null }
                }, '*');
            },

            // Check auth status
            checkAuth: async () => {
                const state = get();
                if (!state.token || !state.currentApp) {
                    set({
                        user: null,
                        isAuthenticated: false,
                        error: null
                    });
                    return false;
                }

                try {
                    const response = await axios.post('/api/auth/validate', {
                        token: state.token,
                        app: state.currentApp
                    });

                    if (response.data.valid) {
                        set({
                            user: response.data.user,
                            isAuthenticated: true,
                            error: null,
                            lastActivity: Date.now()
                        });
                        return true;
                    }
                } catch (error) {
                    // Try to refresh the token
                    if (state.refreshToken) {
                        try {
                            const refreshResult = await get().refreshToken();
                            if (refreshResult) return true;
                        } catch (refreshError) {
                            console.error('Failed to refresh token during checkAuth:', refreshError);
                        }
                    }

                    set({
                        token: null,
                        refreshToken: null,
                        user: null,
                        isAuthenticated: false,
                        currentApp: null,
                        error: 'Session expired'
                    });
                }
                return false;
            },

            // Refresh token
            refreshToken: async () => {
                const state = get();
                if (!state.refreshToken || !state.currentApp) return false;

                try {
                    const response = await axios.post('/api/auth/refresh', {
                        refreshToken: state.refreshToken,
                        app: state.currentApp
                    });

                    const { token, refreshToken, user } = response.data;
                    set({
                        token,
                        refreshToken,
                        user,
                        isAuthenticated: true,
                        error: null,
                        lastActivity: Date.now()
                    });

                    // Broadcast token refresh
                    window.postMessage({
                        type: 'GEEK_AUTH_STATE_CHANGE',
                        payload: { token, refreshToken, user, app: state.currentApp }
                    }, '*');

                    return true;
                } catch (error) {
                    set({
                        token: null,
                        refreshToken: null,
                        user: null,
                        isAuthenticated: false,
                        currentApp: null,
                        error: 'Session expired'
                    });
                    return false;
                }
            }
        }),
        {
            name: 'geek-shared-auth',
            partialize: (state) => ({
                token: state.token,
                refreshToken: state.refreshToken,
                user: state.user,
                isAuthenticated: state.isAuthenticated,
                currentApp: state.currentApp,
                lastActivity: state.lastActivity
            })
        }
    )
);

// Listen for auth state changes from other apps
if (typeof window !== 'undefined') {
    window.addEventListener('message', (event) => {
        if (event.data.type === 'GEEK_AUTH_STATE_CHANGE') {
            const { token, refreshToken, user, app } = event.data.payload;
            useSharedAuthStore.setState({
                token,
                refreshToken,
                user,
                isAuthenticated: !!token,
                currentApp: app,
                lastActivity: Date.now()
            });
        }
    });
}

export default useSharedAuthStore;