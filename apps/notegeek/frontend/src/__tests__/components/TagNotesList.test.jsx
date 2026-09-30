import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import { MockedProvider } from '@apollo/client/testing';
import { gql } from '@apollo/client';
import { lightTheme } from '../testUtils';
import TagNotesList from '../../components/TagNotesList';

const theme = lightTheme;

vi.mock('../../components/NoteList', () => ({
    default: ({ tag, under }) => (
        <div data-testid="notelist-mock">NoteList tag={String(tag)} under={String(under)}</div>
    ),
}));

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

const MOCKS = [
    { request: { query: GET_TAGS }, result: { data: { noteTags: ['house', 'house/garage', 'house/garage/door', 'house/kitchen', 'houseboat'] } } },
    {
        request: { query: GET_TAG_COUNTS },
        result: {
            data: {
                notes: [
                    { id: '1', tags: ['house'] },
                    { id: '2', tags: ['house/garage'] },
                    { id: '3', tags: ['house/garage/door'] },
                    { id: '4', tags: ['house/kitchen'] },
                    { id: '5', tags: ['houseboat'] },
                ],
            },
        },
    },
];

const Wrapper = ({ children, initialPath, mocks = MOCKS }) => (
    <ThemeProvider theme={theme}>
        <MockedProvider mocks={mocks} addTypename={false}>
            <MemoryRouter initialEntries={[initialPath]}>
                <Routes>
                    <Route path="/tags/:tag" element={children} />
                    <Route path="/missing" element={children} />
                </Routes>
            </MemoryRouter>
        </MockedProvider>
    </ThemeProvider>
);

const renderAt = (path, mocks) =>
    render(<TagNotesList />, {
        wrapper: ({ children }) => <Wrapper initialPath={path} mocks={mocks}>{children}</Wrapper>,
    });

describe('TagNotesList', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows error alert if no tag is found in URL', () => {
        renderAt('/missing');

        expect(screen.getByText('No tag parameter found in URL')).toBeInTheDocument();
        expect(screen.queryByTestId('notelist-mock')).not.toBeInTheDocument();
    });

    it('decodes the tag, renders the breadcrumb path, and lists the SUBTREE (under), not the exact tag', () => {
        renderAt('/tags/project%2Ffoo%2Fbar', []);

        const crumbs = screen.getByRole('navigation', { name: 'Tag path' });
        expect(within(crumbs).getByRole('link', { name: 'All notes' })).toHaveAttribute('href', '/notes');
        expect(within(crumbs).getByRole('link', { name: 'project' })).toHaveAttribute('href', '/tags/project');
        expect(within(crumbs).getByRole('link', { name: 'foo' })).toHaveAttribute('href', '/tags/project%2Ffoo');
        expect(screen.getByRole('heading', { level: 1, name: 'bar' })).toBeInTheDocument();

        expect(screen.getByTestId('notelist-mock')).toHaveTextContent('under=project/foo/bar');
        expect(screen.getByTestId('notelist-mock')).toHaveTextContent('tag=undefined');
    });

    it('shows the direct sub-tags as links with descendant-inclusive counts (matching the tree)', async () => {
        renderAt('/tags/house');

        const row = await screen.findByRole('navigation', { name: 'Sub-tags of house' });
        const links = within(row).getAllByRole('link');
        expect(links.map((a) => a.textContent)).toEqual(['garage2', 'kitchen1']);
        expect(links[0]).toHaveAttribute('href', '/tags/house%2Fgarage');
    });

    it('a leaf tag has no sub-tag row', async () => {
        renderAt('/tags/house%2Fkitchen');
        await screen.findByRole('heading', { level: 1, name: 'kitchen' });
        // Let the mocked queries land, then check.
        await new Promise((r) => setTimeout(r, 0));
        expect(screen.queryByRole('navigation', { name: /Sub-tags/ })).not.toBeInTheDocument();
    });
});
