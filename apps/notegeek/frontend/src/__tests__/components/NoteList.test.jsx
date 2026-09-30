import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { gql } from '@apollo/client';
import { renderWithProviders } from '../testUtils';
import NoteList from '../../components/NoteList';

const GET_NOTES = gql`
    query GetNotes($tag: String, $prefix: String, $under: String, $type: String, $limit: Int) {
        notes(tag: $tag, prefix: $prefix, under: $under, type: $type, limit: $limit) {
            id
            title
            content
            type
            tags
            pinned
            pinnedAt
            createdAt
            updatedAt
        }
    }
`;

// Default variables match what NoteList sends: { tag, prefix, under, type: null, limit: 200 }
const DEFAULT_VARS = { tag: undefined, prefix: undefined, under: undefined, type: null, limit: 200 };

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

    it('shows the type as a labelled glyph and up to two plain tags on every row', async () => {
        const notes = [
            { id: '1', title: 'Tagged', content: 'x', type: 'markdown', tags: ['a', 'b/c', 'd'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ];
        renderWithProviders(<NoteList />, { mocks: [mockNotesQuery(notes)] });
        const row = (await screen.findByText('Tagged')).closest('a');
        // The type is an icon with an accessible name, not a coloured stamp.
        expect(within(row).getByRole('img', { name: 'Markdown note' })).toBeInTheDocument();
        // Tags are plain words (the last path segment), no # and no chips.
        expect(row).toHaveTextContent('a · c +1');
        expect(row).not.toHaveTextContent('#');
        expect(row).not.toHaveTextContent('· d');
    });

    it('filters by type with one quiet row of pressed/unpressed chips', async () => {
        const notes = [
            { id: '1', title: 'One', content: 'x', type: 'markdown', tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ];
        renderWithProviders(<NoteList />, { mocks: [mockNotesQuery(notes)] });
        await screen.findByText('One');
        const group = screen.getByRole('group', { name: 'Filter by type' });
        const all = within(group).getByRole('button', { name: /all/i });
        const sketches = within(group).getByRole('button', { name: /sketches/i });
        expect(all).toHaveAttribute('aria-pressed', 'true');
        expect(sketches).toHaveAttribute('aria-pressed', 'false');
        // No Lab Notebook stamps left behind.
        expect(document.querySelector('.type-stamp')).toBeNull();
    });

    it('gives pinned notes their own group above the date groups, never repeated inside them', async () => {
        // Same wall-clock pin as the recency test above.
        vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 8, 26, 12, 0, 0) });
        const now = Date.now();
        const iso = (h) => new Date(now - h * 3600e3).toISOString();
        const notes = [
            { id: '1', title: 'Pinned but old', content: '', type: 'text', tags: [], pinned: true, createdAt: iso(2000), updatedAt: iso(24 * 60) },
            { id: '2', title: 'Fresh', content: '', type: 'text', tags: [], pinned: false, createdAt: iso(1000), updatedAt: iso(0.05) },
        ];
        renderWithProviders(<NoteList />, { mocks: [mockNotesQuery(notes)] });

        await screen.findByRole('heading', { name: 'Pinned' });
        const pinnedSection = screen.getByRole('region', { name: 'Pinned' });
        expect(pinnedSection).toHaveTextContent('Pinned but old');

        // The pinned note is old enough it would otherwise land in a month
        // bucket, not "Today" — its OWN group is what puts it up top, and it
        // must not also appear inside "Today".
        const today = screen.getByRole('region', { name: 'Today' });
        expect(today).toHaveTextContent('Fresh');
        expect(today).not.toHaveTextContent('Pinned but old');
        expect(screen.getAllByText('Pinned but old')).toHaveLength(1);
        vi.useRealTimers();
    });

    it('shows no "Pinned" heading when nothing is pinned', async () => {
        const notes = [
            { id: '1', title: 'One', content: '', type: 'text', tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ];
        renderWithProviders(<NoteList />, { mocks: [mockNotesQuery(notes)] });
        await screen.findByText('One');
        expect(screen.queryByRole('heading', { name: 'Pinned' })).not.toBeInTheDocument();
    });

    it('a tag view sends `under` and each row names the sub-tag it sits in', async () => {
        const notes = [
            { id: '1', title: 'Parent note', content: 'x', type: 'markdown', tags: ['house'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            { id: '2', title: 'Door note', content: 'x', type: 'markdown', tags: ['misc', 'house/garage/door'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ];
        const vars = { ...DEFAULT_VARS, under: 'house' };
        renderWithProviders(<NoteList under="house" />, { mocks: [mockNotesQuery(notes, vars)] });
        const door = (await screen.findByText('Door note')).closest('a');
        // The part under `house`, first, then the rest.
        expect(door).toHaveTextContent('garage/door · misc');
        const parent = screen.getByText('Parent note').closest('a');
        // Tagged exactly `house`: the header already says so.
        expect(parent).not.toHaveTextContent('house');
    });

    it('shows empty state when no notes', async () => {
        const mocks = [mockNotesQuery([])];
        renderWithProviders(<NoteList />, { mocks });
        await waitFor(() => expect(screen.getByText(/No notes yet/i)).toBeInTheDocument());
    });
});
