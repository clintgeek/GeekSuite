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

const GET_TAG_COUNTS = gql`
  query GetNoteTagCounts {
    notes {
      id
      tags
    }
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

const COUNT_NOTES = [
    { id: 'a', tags: ['project/foo'] },
    { id: 'b', tags: ['project/foo', 'project/bar'] },
    { id: 'c', tags: ['personal'] },
];

function countsMock(notes = COUNT_NOTES) {
    return {
        request: { query: GET_TAG_COUNTS },
        result: { data: { notes } },
    };
}

const SidebarTestWrapper = ({ children, initialPath = '/', mocks = [tagsMock(), countsMock()] }) => (
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

    it('is headed "Tags", not "Collections"', () => {
        render(<Sidebar />, { wrapper: SidebarTestWrapper });
        expect(screen.getByText('Tags')).toBeInTheDocument();
        expect(screen.queryByText('Collections')).toBeNull();
    });

    it('shows a note count on every row, parents counting distinct notes', async () => {
        render(<Sidebar />, { wrapper: SidebarTestWrapper });
        const row = async (name) => (await screen.findByRole('link', { name: new RegExp(`^${name}\\s*\\d+$`) }));
        // `project` covers notes a and b — b carries two project tags but is one note.
        expect(await row('project')).toHaveTextContent(/project\s*2$/);
        expect(await row('foo')).toHaveTextContent(/foo\s*2$/);
        expect(await row('bar')).toHaveTextContent(/bar\s*1$/);
        expect(await row('personal')).toHaveTextContent(/personal\s*1$/);
    });

    it('collapses and expands a branch with its chevron', async () => {
        try { window.localStorage.removeItem('notegeek.tagTree.collapsed'); } catch { /* ignore */ }
        render(<Sidebar />, { wrapper: SidebarTestWrapper });
        const chevron = await screen.findByRole('button', { name: 'Collapse project' });
        expect(chevron).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('foo')).toBeInTheDocument();

        fireEvent.click(chevron);
        expect(screen.queryByText('foo')).not.toBeInTheDocument();
        const expand = screen.getByRole('button', { name: 'Expand project' });
        expect(expand).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(expand);
        expect(screen.getByText('foo')).toBeInTheDocument();
    });

    it('opens the branch of the tag being viewed, even if it was collapsed', async () => {
        try { window.localStorage.setItem('notegeek.tagTree.collapsed', JSON.stringify(['project'])); } catch { /* ignore */ }
        render(<Sidebar />, {
            wrapper: ({ children }) => <SidebarTestWrapper initialPath="/tags/project%2Fbar">{children}</SidebarTestWrapper>,
        });
        expect(await screen.findByText('bar')).toBeInTheDocument();
        try { window.localStorage.removeItem('notegeek.tagTree.collapsed'); } catch { /* ignore */ }
    });

    it('does not render account actions (they live in the header avatar menu)', () => {
        render(<Sidebar closeNavbar={vi.fn()} />, { wrapper: SidebarTestWrapper });

        // Shell grammar (2026-09-02): the sidebar has no footer; Settings and
        // Sign out are only in the top bar's account menu.
        expect(screen.queryByText('Sign out')).toBeNull();
        expect(screen.queryByText('Settings')).toBeNull();
    });
});
