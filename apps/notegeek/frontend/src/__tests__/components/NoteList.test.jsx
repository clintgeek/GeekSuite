import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { gql } from '@apollo/client';
import { renderWithProviders } from '../testUtils';
import NoteList from '../../components/NoteList';

const GET_NOTES = gql`
    query GetNotes($tag: String, $prefix: String, $type: String, $limit: Int) {
        notes(tag: $tag, prefix: $prefix, type: $type, limit: $limit) {
            id
            title
            content
            type
            tags
            createdAt
            updatedAt
        }
    }
`;

// Default variables match what NoteList sends: { tag, prefix, type: null, limit: 200 }
const DEFAULT_VARS = { tag: undefined, prefix: undefined, type: null, limit: 200 };

function mockNotesQuery(notes = [], variables = DEFAULT_VARS) {
    return {
        request: { query: GET_NOTES, variables },
        result: { data: { notes } },
    };
}

describe('NoteList Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders list of notes', async () => {
        const mocks = [mockNotesQuery([
            { id: '1', title: 'Note 1', content: 'Content 1', type: 'markdown', tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            { id: '2', title: 'Note 2', content: 'Content 2', type: 'richtext', tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ])];
        renderWithProviders(<NoteList />, { mocks });
        await waitFor(() => expect(screen.getByText('Note 1')).toBeInTheDocument());
        expect(screen.getByText('Note 2')).toBeInTheDocument();
    });

    it('shows loading skeleton when loading', () => {
        const mocks = [{ request: { query: GET_NOTES, variables: DEFAULT_VARS }, delay: 9999, result: { data: { notes: [] } } }];
        const { container } = renderWithProviders(<NoteList />, { mocks });
        expect(screen.queryByText('Note 1')).not.toBeInTheDocument();
        expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
    });

    it('groups a date sort by recency, and A-Z not at all', async () => {
        // Pin the clock to local noon: "3 minutes ago" is not "Today" when the
        // suite happens to run at 00:01 (wall-clock tests measure the runner).
        vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 8, 26, 12, 0, 0) });
        const now = Date.now();
        const iso = (h) => new Date(now - h * 3600e3).toISOString();
        const notes = [
            { id: '1', title: 'Fresh', content: '', type: 'text', tags: [], createdAt: iso(1000), updatedAt: iso(0.05) },
            { id: '2', title: 'Old', content: '', type: 'text', tags: [], createdAt: iso(2000), updatedAt: iso(24 * 60) },
        ];
        renderWithProviders(<NoteList />, { mocks: [mockNotesQuery(notes)] });
        expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument();
        const today = screen.getByRole('region', { name: 'Today' });
        expect(today).toHaveTextContent('Fresh');
        expect(today).not.toHaveTextContent('Old');

        fireEvent.click(screen.getByRole('button', { name: 'A-Z' }));
        expect(screen.queryByRole('heading', { name: 'Today' })).not.toBeInTheDocument();
        expect(screen.getByText('Fresh')).toBeInTheDocument();
        expect(screen.getByText('Old')).toBeInTheDocument();
        vi.useRealTimers();
    });

    it('shows the type stamp and up to two tags on every row', async () => {
        const notes = [
            { id: '1', title: 'Tagged', content: 'x', type: 'markdown', tags: ['a', 'b/c', 'd'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ];
        renderWithProviders(<NoteList />, { mocks: [mockNotesQuery(notes)] });
        const row = (await screen.findByText('Tagged')).closest('a');
        expect(row).toHaveTextContent('Markdown');
        expect(row).toHaveTextContent('#a');
        expect(row).toHaveTextContent('#c');
        expect(row).toHaveTextContent('+1');
        expect(row).not.toHaveTextContent('#d');
    });

    it('shows empty state when no notes', async () => {
        const mocks = [mockNotesQuery([])];
        renderWithProviders(<NoteList />, { mocks });
        await waitFor(() => expect(screen.getByText(/No notes yet/i)).toBeInTheDocument());
    });
});
