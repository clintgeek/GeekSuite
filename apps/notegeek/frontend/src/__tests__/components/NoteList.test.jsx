import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import ThemeModeProvider from '../../theme/ThemeModeProvider';
import NoteList from '../../components/NoteList';
import useNoteStore from '../../store/noteStore';

const AllProviders = ({ children }) => (
    <ThemeModeProvider>
        <MantineProvider>
            <MemoryRouter>{children}</MemoryRouter>
        </MantineProvider>
    </ThemeModeProvider>
);

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

vi.mock('@geeksuite/user', () => ({
    usePreferences: vi.fn(() => ({ preferences: {}, loaded: true })),
}));

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

describe('NoteList Unit Tests', () => {
    beforeEach(() => {
        useNoteStore.setState({
            notes: [
                { _id: '1', title: 'Note 1', content: 'Content 1', updatedAt: new Date().toISOString(), type: 'markdown' },
                { _id: '2', title: 'Note 2', content: 'Content 2', updatedAt: new Date().toISOString(), type: 'richtext' },
            ],
            isLoadingList: false,
        });
        vi.clearAllMocks();
    });

    it('renders list of notes', () => {
        render(<NoteList />, { wrapper: AllProviders });
        expect(screen.getByText('Note 1')).toBeInTheDocument();
        expect(screen.getByText('Note 2')).toBeInTheDocument();
    });

    it('shows loading skeleton when loading', () => {
        useNoteStore.setState({ isLoadingList: true });
        const { container } = render(<NoteList />, { wrapper: AllProviders });
        // MUI Skeletons render as divs with specific classes.
        expect(screen.queryByText('Note 1')).not.toBeInTheDocument();
        expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
    });

    it('shows empty state when no notes', () => {
        useNoteStore.setState({ notes: [] });
        render(<NoteList />, { wrapper: AllProviders });
        expect(screen.getByText(/No notes yet/i)).toBeInTheDocument();
    });
});
