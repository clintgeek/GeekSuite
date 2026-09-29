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

            it('is the capture box and the notes: no greeting, no "Continue" cards', () => {
                render(<QuickCaptureHome />, { wrapper: AllProviders });
                expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
                expect(screen.queryByText(/good (morning|afternoon|evening)/i)).toBeNull();
                expect(screen.queryByRole('region', { name: /continue where you left off/i })).toBeNull();
                // Every recent note, newest first, once each.
                const recent = screen.getByRole('region', { name: /recent/i });
                const titles = ['Roof quote', 'debounce.js', 'Garden', 'Older one'];
                for (const t of titles) expect(within(recent).getAllByText(t)).toHaveLength(1);
                expect(recent.textContent.indexOf('Roof quote')).toBeLessThan(recent.textContent.indexOf('Older one'));
            });

            it('offers Photo and Sketch while the box is empty, and Save once there is a thought', () => {
                render(<QuickCaptureHome />, { wrapper: AllProviders });
                expect(screen.getByRole('button', { name: 'New note from a photo of a page' })).toBeInTheDocument();
                expect(screen.getByRole('button', { name: 'New sketch' })).toBeInTheDocument();
                expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
                fireEvent.change(screen.getByLabelText('Quick capture'), { target: { value: 'buy nails' } });
                expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
                expect(screen.queryByRole('button', { name: 'New sketch' })).toBeNull();
                fireEvent.change(screen.getByLabelText('Quick capture'), { target: { value: '   ' } });
                expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
            });

            it('saves a capture as a Markdown note (the default type), not rich text', async () => {
                const createNote = vi.fn().mockResolvedValue({ id: 'n9' });
                useNoteStore.setState({ createNote, fetchNotes: vi.fn() });
                render(<QuickCaptureHome />, { wrapper: AllProviders });
                fireEvent.change(screen.getByLabelText('Quick capture'), { target: { value: 'buy nails' } });
                fireEvent.click(screen.getByRole('button', { name: 'Save' }));
                await vi.waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
                expect(createNote.mock.calls[0][0]).toMatchObject({ type: 'markdown', content: 'buy nails' });
            });
        });
    });
});
