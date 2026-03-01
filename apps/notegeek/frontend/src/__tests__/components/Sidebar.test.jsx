import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material';
import Sidebar from '../../components/Sidebar';
import useAuthStore from '../../store/authStore';
import useTagStore from '../../store/tagStore';
import useNoteStore from '../../store/noteStore';

const theme = createTheme();

// Mock Zustand stores directly
vi.mock('../../store/authStore', () => {
    const defaultStore = { logout: vi.fn(), user: { id: 1 } };
    const useStore = vi.fn((selector) => (selector ? selector(defaultStore) : defaultStore));
    useStore.getState = () => defaultStore;
    useStore.setState = () => { };
    return { default: useStore };
});

vi.mock('../../store/tagStore', () => {
    const defaultStore = { tags: ['project/foo', 'project/bar', 'personal'], fetchTags: vi.fn(), clearTags: vi.fn(), isLoading: false, error: null };
    const useStore = vi.fn((selector) => (selector ? selector(defaultStore) : defaultStore));
    useStore.getState = () => defaultStore;
    useStore.setState = () => { };
    return { default: useStore };
});

vi.mock('../../store/noteStore', () => {
    const defaultStore = { clearNotes: vi.fn() };
    const useStore = vi.fn((selector) => (selector ? selector(defaultStore) : defaultStore));
    useStore.getState = () => defaultStore;
    useStore.setState = () => { };
    return { default: useStore };
});

vi.mock('../../components/TagContextMenu', () => ({
    default: () => <div data-testid="tag-context-menu-mock">ContextMenu</div>
}));

const SidebarTestWrapper = ({ children, initialPath = '/' }) => (
    <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={[initialPath]}>
            {children}
            <Routes>
                <Route path="*" element={<div data-testid="route-content" />} />
                <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
            </Routes>
        </MemoryRouter>
    </ThemeProvider>
);

describe('Sidebar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders main navigation links', () => {
        render(<Sidebar />, { wrapper: SidebarTestWrapper });
        expect(screen.getByText('New Note')).toBeInTheDocument();
        expect(screen.getByText('Home')).toBeInTheDocument();
        expect(screen.getByText('Search')).toBeInTheDocument();
        expect(screen.getByText('All Notes')).toBeInTheDocument();
    });

    it('renders tags hierarchically', () => {
        render(<Sidebar />, { wrapper: SidebarTestWrapper });
        expect(screen.getByText('project')).toBeInTheDocument();
        expect(screen.getByText('foo')).toBeInTheDocument();
        expect(screen.getByText('bar')).toBeInTheDocument();
        expect(screen.getByText('personal')).toBeInTheDocument();
    });

    it('filters tags based on input', () => {
        render(<Sidebar />, { wrapper: SidebarTestWrapper });

        const filterInput = screen.getByPlaceholderText('Filter tags...');
        fireEvent.change(filterInput, { target: { value: 'foo' } });

        expect(screen.getByText('project')).toBeInTheDocument();
        expect(screen.getByText('foo')).toBeInTheDocument();

        // 'bar' and 'personal' should not be in the document
        expect(screen.queryByText('bar')).not.toBeInTheDocument();
        expect(screen.queryByText('personal')).not.toBeInTheDocument();
    });

    it('handles logout flow properly', () => {
        const authStore = useAuthStore.getState();
        const tagStore = useTagStore.getState();
        const noteStore = useNoteStore.getState();

        render(<Sidebar closeNavbar={vi.fn()} />, { wrapper: SidebarTestWrapper });

        const logoutBtn = screen.getByText('Sign out');
        fireEvent.click(logoutBtn);

        expect(authStore.logout).toHaveBeenCalled();
        expect(noteStore.clearNotes).toHaveBeenCalled();
        expect(tagStore.clearTags).toHaveBeenCalled();

        // Navigation should be to /login
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
});
