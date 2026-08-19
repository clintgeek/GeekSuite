import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { MockedProvider } from '@apollo/client/testing';
import { gql } from '@apollo/client';
import ThemeModeProvider from '../../theme/ThemeModeProvider';

// Component Imports
import DeleteNoteDialog from '../../components/DeleteNoteDialog';
import NoteTypeSelector from '../../components/NoteTypeSelector';
import TagSelector from '../../components/TagSelector';
import NoteHeader from '../../components/NoteHeader';
import Header from '../../components/Header';
import NoteList from '../../components/NoteList';
import SearchResults from '../../components/SearchResults';
import AppErrorBoundary from '../../components/AppErrorBoundary';
import Layout from '../../components/Layout';

// Minimal mocks for Apollo queries used by NoteList / Sidebar inside Layout
const GET_NOTES = gql`
    query GetNotes($tag: String, $prefix: String, $type: String, $limit: Int) {
        notes(tag: $tag, prefix: $prefix, type: $type, limit: $limit) { id title content type tags createdAt updatedAt }
    }
`;
const GET_TAGS = gql`
    query GetNoteTags { noteTags }
`;
const apolloMocks = [
    { request: { query: GET_NOTES, variables: { tag: undefined, prefix: undefined, type: null, limit: 200 } }, result: { data: { notes: [] } } },
    { request: { query: GET_TAGS }, result: { data: { noteTags: [] } } },
];

const AllProviders = ({ children }) => (
    <ThemeModeProvider>
        <MantineProvider>
            <MockedProvider mocks={apolloMocks} addTypename={false}>
                <MemoryRouter>{children}</MemoryRouter>
            </MockedProvider>
        </MantineProvider>
    </ThemeModeProvider>
);

// --- Mock stores used by most components ---
vi.mock('../../store/noteStore', () => {
    const store = {
        notes: [],
        selectedNote: null,
        isLoadingList: false,
        isLoadingSelected: false,
        fetchNotes: vi.fn(),
        fetchNoteById: vi.fn(),
        clearSelectedNote: vi.fn(),
        searchResults: [],
        isSearching: false,
    };
    const useStore = vi.fn((selector) => (selector ? selector(store) : store));
    useStore.getState = () => store;
    useStore.setState = (newState) => Object.assign(store, typeof newState === 'function' ? newState(store) : newState);
    return { default: useStore };
});

vi.mock('../../store/authStore', () => {
    const store = {
        user: { _id: 'testuser', email: 'test@example.com' },
        isAuthenticated: true,
        logout: vi.fn(),
    };
    const useStore = vi.fn((selector) => (selector ? selector(store) : store));
    useStore.getState = () => store;
    useStore.setState = (newState) => Object.assign(store, typeof newState === 'function' ? newState(store) : newState);
    return { default: useStore };
});

vi.mock('../../store/tagStore', () => {
    const store = {
        tags: ['test', 'example'],
        fetchTags: vi.fn(),
    };
    const useStore = vi.fn((selector) => (selector ? selector(store) : store));
    useStore.getState = () => store;
    useStore.setState = (newState) => Object.assign(store, typeof newState === 'function' ? newState(store) : newState);
    return { default: useStore };
});

vi.mock('../../store/folderStore', () => {
    const store = {
        folders: [],
        fetchFolders: vi.fn(),
    };
    const useStore = vi.fn((selector) => (selector ? selector(store) : store));
    useStore.getState = () => store;
    useStore.setState = (newState) => Object.assign(store, typeof newState === 'function' ? newState(store) : newState);
    return { default: useStore };
});

// Mock window.matchMedia for Mantine
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

describe('Smoke Tests - Basic UI Components', () => {

    describe('DeleteNoteDialog', () => {
        it('should render without crashing', () => {
            render(<DeleteNoteDialog opened={true} onClose={vi.fn()} onConfirm={vi.fn()} />, { wrapper: AllProviders });
        });
    });

    describe('NoteTypeSelector', () => {
        it('should render without crashing', () => {
            render(<NoteTypeSelector onSelect={vi.fn()} />, { wrapper: AllProviders });
        });
    });

    describe('TagSelector', () => {
        it('should render without crashing', () => {
            render(<TagSelector value={[]} onChange={vi.fn()} />, { wrapper: AllProviders });
        });
    });

    describe('NoteHeader', () => {
        it('should render without crashing', () => {
            render(<NoteHeader onBurgerClick={vi.fn()} isMobile={false} opened={false} />, { wrapper: AllProviders });
        });
    });

    describe('Header', () => {
        it('should render without crashing', () => {
            render(<Header toggleMobile={vi.fn()} toggleDesktop={vi.fn()} mobileOpened={false} desktopOpened={true} />, { wrapper: AllProviders });
        });
    });

    describe('NoteList', () => {
        it('should render without crashing', () => {
            render(<NoteList />, { wrapper: AllProviders });
        });
    });

    describe('SearchResults', () => {
        it('should render without crashing', () => {
            render(<SearchResults />, { wrapper: AllProviders });
        });
    });

    describe('AppErrorBoundary', () => {
        it('should render without crashing', () => {
            render(
                <AppErrorBoundary>
                    <div>Child Content</div>
                </AppErrorBoundary>,
                { wrapper: AllProviders }
            );
        });
    });

    describe('Layout', () => {
        it('should render without crashing', () => {
            render(<Layout />, { wrapper: AllProviders });
        });
    });

});
