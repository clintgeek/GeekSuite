import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SlashFocusProvider } from '@geeksuite/ui';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import ThemeModeProvider from '../../theme/ThemeModeProvider';

// Pages to test
import QuickCaptureHome from '../../pages/QuickCaptureHome';
import useAuthStore from '../../store/authStore';
import useNoteStore from '../../store/noteStore';

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
    ThemeProvider: ({ children }) => children,
    useThemeMode: () => ({
        theme: 'light',
        themePreference: 'light',
        setThemePreference: vi.fn(),
        toggleTheme: vi.fn(),
    }),
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
    describe('QuickCaptureHome', () => {
        it('renders quick capture fields', () => {
            render(<QuickCaptureHome />, { wrapper: AllProviders });
            expect(screen.getByText(/Nothing here yet/i)).toBeInTheDocument();
        });

        it('"/" focuses the quick-capture box (the page\'s reason to exist)', () => {
            render(
                <SlashFocusProvider>
                    <QuickCaptureHome />
                </SlashFocusProvider>,
                { wrapper: AllProviders }
            );
            fireEvent.keyDown(document.body, { key: '/' });
            expect(screen.getByLabelText('Quick capture')).toHaveFocus();
        });

        describe('with a signed-in writer and some notes', () => {
            const iso = (h) => new Date(Date.now() - h * 3600e3).toISOString();
            const NOTES = [
                { id: '1', title: 'Roof quote', type: 'text', tags: [], content: '<p>Call Tuesday</p>', updatedAt: iso(1), createdAt: iso(90) },
                { id: '2', title: 'debounce.js', type: 'code', tags: ['dev'], content: '{"language":"javascript","code":"const a = 1;"}', updatedAt: iso(2), createdAt: iso(90) },
                { id: '3', title: 'Garden', type: 'handwritten', tags: [], content: '', updatedAt: iso(3), createdAt: iso(90) },
                { id: '4', title: 'Older one', type: 'markdown', tags: [], content: '# x', updatedAt: iso(30), createdAt: iso(90) },
            ];
            beforeEach(() => {
                useAuthStore.setState({ user: { username: 'chef', email: 'chef@example.com' }, isAuthenticated: true });
                useNoteStore.setState({ notes: NOTES });
            });
            afterEach(() => {
                useAuthStore.setState({ user: null, isAuthenticated: false });
                useNoteStore.setState({ notes: [] });
            });

            it('greets the writer with a capitalised name — "Chef", not "chef"', () => {
                render(<QuickCaptureHome />, { wrapper: AllProviders });
                expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Good (morning|afternoon|evening), Chef$/);
            });

            it('offers the last three notes under "Continue where you left off"', () => {
                render(<QuickCaptureHome />, { wrapper: AllProviders });
                const section = screen.getByRole('region', { name: /continue where you left off/i });
                const cards = within(section).getAllByRole('button');
                expect(cards).toHaveLength(3);
                expect(cards[0]).toHaveTextContent('Roof quote');
                expect(cards[2]).toHaveTextContent('Garden');
                // The fourth is in Recent, not duplicated in Continue.
                expect(within(section).queryByText('Older one')).toBeNull();
                expect(screen.getByRole('region', { name: /recent/i })).toHaveTextContent('Older one');
            });

            it('Capture is disabled while the box is empty, and enabled once there is a thought', () => {
                render(<QuickCaptureHome />, { wrapper: AllProviders });
                const capture = screen.getByRole('button', { name: /capture/i });
                expect(capture).toBeDisabled();
                fireEvent.change(screen.getByLabelText('Quick capture'), { target: { value: 'buy nails' } });
                expect(capture).toBeEnabled();
                fireEvent.change(screen.getByLabelText('Quick capture'), { target: { value: '   ' } });
                expect(capture).toBeDisabled();
            });
        });
    });
});
