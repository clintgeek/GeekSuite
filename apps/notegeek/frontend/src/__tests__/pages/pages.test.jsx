import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import ThemeModeProvider from '../../theme/ThemeModeProvider';

// Pages to test
import LoginPage from '../../pages/LoginPage';
import RegisterPage from '../../pages/RegisterPage';
import QuickCaptureHome from '../../pages/QuickCaptureHome';

const AllProviders = ({ children }) => (
    <ThemeModeProvider>
        <MantineProvider>
            <MemoryRouter>{children}</MemoryRouter>
        </MantineProvider>
    </ThemeModeProvider>
);

vi.mock('../../store/authStore', () => {
    const store = {
        user: null,
        isAuthenticated: false,
        error: null,
        isLoading: false,
        login: vi.fn(),
        register: vi.fn(),
    };
    const useStore = vi.fn((selector) => (selector ? selector(store) : store));
    useStore.getState = () => store;
    useStore.setState = (newState) => Object.assign(store, typeof newState === 'function' ? newState(store) : newState);
    return { default: useStore };
});

vi.mock('../../store/noteStore', () => {
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
    useStore.setState = (newState) => Object.assign(store, typeof newState === 'function' ? newState(store) : newState);
    return { default: useStore };
});

vi.mock('@geeksuite/user', () => ({
    usePreferences: vi.fn(() => ({ preferences: {}, loaded: true })),
}));

// Mock ResizeObserver for Mantine
global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

describe('Page Tests', () => {
    describe('LoginPage', () => {
        it('renders login components', () => {
            render(<LoginPage />, { wrapper: AllProviders });
            expect(screen.getAllByText(/Email/i)[0]).toBeInTheDocument();
        });
    });

    describe('RegisterPage', () => {
        it('renders register components', () => {
            render(<RegisterPage />, { wrapper: AllProviders });
            expect(screen.getAllByText(/Create Account/i)[0]).toBeInTheDocument();
        });
    });

    describe('QuickCaptureHome', () => {
        it('renders quick capture fields', () => {
            render(<QuickCaptureHome />, { wrapper: AllProviders });
            expect(screen.getByText(/Your desk is empty/i)).toBeInTheDocument();
        });
    });
});
