import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';

// authStore mock mirrors the pattern used by __tests__/pages/pages.test.jsx —
// a selector-or-plain-call store, mutable per test via setState.
vi.mock('../store/authStore', () => {
    const store = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        hydrateUser: vi.fn(() => Promise.resolve()),
    };
    const useStore = vi.fn((selector) => (selector ? selector(store) : store));
    useStore.getState = () => store;
    useStore.setState = (newState) =>
        Object.assign(store, typeof newState === 'function' ? newState(store) : newState);
    return { default: useStore };
});

vi.mock('../store/noteStore', () => {
    const store = {
        notes: [],
        createNote: vi.fn(),
        fetchNotes: vi.fn(),
        clearSelectedNote: vi.fn(),
        isLoadingList: false,
        searchResults: [],
    };
    const useStore = vi.fn((selector) => (selector ? selector(store) : store));
    useStore.getState = () => store;
    useStore.setState = (newState) =>
        Object.assign(store, typeof newState === 'function' ? newState(store) : newState);
    return { default: useStore };
});

// Login/Register render a distinctive marker so a leaked render (the bug
// this test guards against) is unambiguous in the assertion.
vi.mock('../components/Login', () => ({
    default: () => <div>LOGIN_SPLASH_MARKER</div>,
}));
vi.mock('../components/Register', () => ({
    default: () => <div>REGISTER_FORM_MARKER</div>,
}));
// The authenticated landing page — real QuickCaptureHome pulls in note store
// wiring this test doesn't need; a marker is enough to prove which route won.
vi.mock('../pages/QuickCaptureHome', () => ({
    default: () => <div>HOME_MARKER</div>,
}));
vi.mock('../components/Layout', () => ({
    default: ({ children }) => <div data-testid="layout">{children}</div>,
}));

import useAuthStore from '../store/authStore';

function setPath(path) {
    window.history.pushState({}, '', path);
}

describe('App auth-gated routes', () => {
    beforeEach(() => {
        useAuthStore.setState({ isAuthenticated: false });
        setPath('/');
    });

    it('renders the login splash at /login when signed out', async () => {
        setPath('/login');
        render(<App />);
        await waitFor(() => expect(screen.getByText('LOGIN_SPLASH_MARKER')).toBeInTheDocument());
    });

    it('redirects /login to home instead of the splash when already signed in', async () => {
        useAuthStore.setState({ isAuthenticated: true });
        setPath('/login');
        render(<App />);
        await waitFor(() => expect(screen.getByText('HOME_MARKER')).toBeInTheDocument());
        expect(screen.queryByText('LOGIN_SPLASH_MARKER')).not.toBeInTheDocument();
    });

    it('redirects /register to home instead of the form when already signed in', async () => {
        useAuthStore.setState({ isAuthenticated: true });
        setPath('/register');
        render(<App />);
        await waitFor(() => expect(screen.getByText('HOME_MARKER')).toBeInTheDocument());
        expect(screen.queryByText('REGISTER_FORM_MARKER')).not.toBeInTheDocument();
    });
});
