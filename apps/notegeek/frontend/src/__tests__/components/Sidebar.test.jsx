import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { gql } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '../testUtils';
import Sidebar from '../../components/Sidebar';
import useAuthStore from '../../store/authStore';
import useNoteStore from '../../store/noteStore';

const GET_TAGS = gql`
  query GetNoteTags {
    noteTags
  }
`;

const theme = lightTheme;

// Mock Zustand stores directly (only the bits Sidebar still reads)
vi.mock('../../store/authStore', () => {
    const defaultStore = { logout: vi.fn(), user: { id: 1 } };
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

const TAGS = ['project/foo', 'project/bar', 'personal'];

function tagsMock(tags = TAGS) {
    return {
        request: { query: GET_TAGS },
        result: { data: { noteTags: tags } },
    };
}

const SidebarTestWrapper = ({ children, initialPath = '/', mocks = [tagsMock()] }) => (
    <ThemeProvider theme={theme}>
        <MockedProvider mocks={mocks} addTypename={false}>
            <MemoryRouter initialEntries={[initialPath]}>
                {children}
                <Routes>
                    <Route path="*" element={<div data-testid="route-content" />} />
                    <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
                </Routes>
            </MemoryRouter>
        </MockedProvider>
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

    it('renders tags hierarchically', async () => {
        render(<Sidebar />, { wrapper: SidebarTestWrapper });
        await waitFor(() => expect(screen.getByText('project')).toBeInTheDocument());
        expect(screen.getByText('foo')).toBeInTheDocument();
        expect(screen.getByText('bar')).toBeInTheDocument();
        expect(screen.getByText('personal')).toBeInTheDocument();
    });

    it('filters tags based on input', async () => {
        render(<Sidebar />, { wrapper: SidebarTestWrapper });
        await waitFor(() => expect(screen.getByText('project')).toBeInTheDocument());

        const filterInput = screen.getByPlaceholderText('Filter tags…');
        fireEvent.change(filterInput, { target: { value: 'foo' } });

        expect(screen.getByText('project')).toBeInTheDocument();
        expect(screen.getByText('foo')).toBeInTheDocument();

        expect(screen.queryByText('bar')).not.toBeInTheDocument();
        expect(screen.queryByText('personal')).not.toBeInTheDocument();
    });

    it('handles logout flow properly', async () => {
        const authStore = useAuthStore.getState();
        const noteStore = useNoteStore.getState();

        render(<Sidebar closeNavbar={vi.fn()} />, { wrapper: SidebarTestWrapper });

        const logoutBtn = screen.getByText('Sign out');
        fireEvent.click(logoutBtn);

        expect(authStore.logout).toHaveBeenCalled();
        expect(noteStore.clearNotes).toHaveBeenCalled();

        // Navigation should be to /login
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
});
