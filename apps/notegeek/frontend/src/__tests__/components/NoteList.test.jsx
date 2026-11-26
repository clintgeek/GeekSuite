import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { GET_NOTES_PAGE as GET_NOTES } from '../../graphql/queries';
import { renderWithProviders } from '../testUtils';
import NoteList from '../../components/NoteList';

// The list query NoteList sends (graphql/queries.js).


// Default variables match what NoteList sends (notesPage, review 5.2).
const DEFAULT_VARS = { tag: undefined, prefix: undefined, under: undefined, type: null, sort: 'updatedAt_desc', first: 100 };

function mockNotesQuery(notes = [], variables = DEFAULT_VARS) {
    return {
        request: { query: GET_NOTES, variables },
        result: { data: { notesPage: { notes, nextCursor: null, hasMore: false } } },
    };
}

describe('NoteList Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders list of notes', async () => {
        const mocks = [mockNotesQuery([
            { id: '1', title: 'Note 1', preview: 'Content 1', type: 'markdown', tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            { id: '2', title: 'Note 2', preview: 'Content 2', type: 'richtext', tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ])];
        renderWithProviders(<NoteList />, { mocks });
        await waitFor(() => expect(screen.getByText('Note 1')).toBeInTheDocument());
        expect(screen.getByText('Note 2')).toBeInTheDocument();
    });

    it('shows loading skeleton when loading', () => {
        const mocks = [{ request: { query: GET_NOTES, variables: DEFAULT_VARS }, delay: 9999, result: { data: { notesPage: { notes: [], nextCursor: null, hasMore: false } } } }];
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
            { id: '1', title: 'Fresh', preview: '', type: 'text', tags: [], createdAt: iso(1000), updatedAt: iso(0.05) },
            { id: '2', title: 'Old', preview: '', type: 'text', tags: [], createdAt: iso(2000), updatedAt: iso(24 * 60) },
        ];
        // A–Z is sorted by the server now (review 5.2): a second query.
        renderWithProviders(<NoteList />, { mocks: [mockNotesQuery(notes), mockNotesQuery(notes, { ...DEFAULT_VARS, sort: 'title_asc' })] });
        expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument();
        const today = screen.getByRole('region', { name: 'Today' });
        expect(today).toHaveTextContent('Fresh');
        expect(today).not.toHaveTextContent('Old');

        fireEvent.click(screen.getByRole('button', { name: 'A-Z' }));
        expect(await screen.findByText('Fresh')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Today' })).not.toBeInTheDocument();
        expect(screen.getByText('Old')).toBeInTheDocument();
        vi.useRealTimers();
    });

    it('shows the type as a labelled glyph and up to two plain tags on every row', async () => {
        const notes = [
            { id: '1', title: 'Tagged', preview: 'x', type: 'markdown', tags: ['a', 'b/c', 'd'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ];
        renderWithProviders(<NoteList />, { mocks: [mockNotesQuery(notes)] });
        const row = (await screen.findByText('Tagged')).closest('a');
        // The type is an icon with an accessible name, not a coloured stamp.
        expect(within(row).getByRole('img', { name: 'Typed note' })).toBeInTheDocument();
        // Tags are plain words (the last path segment), no # and no chips.
        expect(row).toHaveTextContent('a · c +1');
        expect(row).not.toHaveTextContent('#');
        expect(row).not.toHaveTextContent('· d');
    });

    it('filters by type with one quiet row of pressed/unpressed chips', async () => {
        const notes = [
            { id: '1', title: 'One', preview: 'x', type: 'markdown', tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ];
        renderWithProviders(<NoteList />, { mocks: [mockNotesQuery(notes)] });
        await screen.findByText('One');
        const group = screen.getByRole('group', { name: 'Filter by type' });
        const all = within(group).getByRole('button', { name: /all/i });
        const handwritten = within(group).getByRole('button', { name: /handwritten/i });
        expect(all).toHaveAttribute('aria-pressed', 'true');
        expect(handwritten).toHaveAttribute('aria-pressed', 'false');
        // No Lab Notebook stamps left behind.
        expect(document.querySelector('.type-stamp')).toBeNull();
    });

    it('gives pinned notes their own group above the date groups, never repeated inside them', async () => {
        // Same wall-clock pin as the recency test above.
        vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 8, 26, 12, 0, 0) });
        const now = Date.now();
        const iso = (h) => new Date(now - h * 3600e3).toISOString();
        const notes = [
            { id: '1', title: 'Pinned but old', preview: '', type: 'text', tags: [], pinned: true, createdAt: iso(2000), updatedAt: iso(24 * 60) },
            { id: '2', title: 'Fresh', preview: '', type: 'text', tags: [], pinned: false, createdAt: iso(1000), updatedAt: iso(0.05) },
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
            { id: '1', title: 'One', preview: '', type: 'text', tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ];
        renderWithProviders(<NoteList />, { mocks: [mockNotesQuery(notes)] });
        await screen.findByText('One');
        expect(screen.queryByRole('heading', { name: 'Pinned' })).not.toBeInTheDocument();
    });

    it('a tag view sends `under` and each row names the sub-tag it sits in', async () => {
        const notes = [
            { id: '1', title: 'Parent note', preview: 'x', type: 'markdown', tags: ['house'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            { id: '2', title: 'Door note', preview: 'x', type: 'markdown', tags: ['misc', 'house/garage/door'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
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

describe('NoteList — server sort and keyset paging (review 5.1/5.2)', () => {
    const row = (i) => ({ id: `n${i}`, title: `Note ${i}`, preview: `Body ${i}`, type: 'markdown', tags: [], pinned: false, pinnedAt: null, createdAt: new Date(Date.now() - i * 1000).toISOString(), updatedAt: new Date(Date.now() - i * 1000).toISOString() });

    it('asks for one page, and "Show more notes" asks for the next with the server cursor', async () => {
        const first = Array.from({ length: 100 }, (_, i) => row(i));
        const second = [row(100), row(101)];
        renderWithProviders(<NoteList />, {
            mocks: [
                { request: { query: GET_NOTES, variables: DEFAULT_VARS }, result: { data: { notesPage: { notes: first, nextCursor: 'c1', hasMore: true } } } },
                { request: { query: GET_NOTES, variables: { ...DEFAULT_VARS, after: 'c1' } }, result: { data: { notesPage: { notes: second, nextCursor: null, hasMore: false } } } },
            ],
        });
        expect(await screen.findByText('Note 99')).toBeInTheDocument();
        expect(screen.getByText(/100\+ notes/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /show more notes/i }));
        expect(await screen.findByText('Note 101')).toBeInTheDocument();
        // The last page says so.
        expect(screen.queryByRole('button', { name: /show more notes/i })).toBeNull();
        expect(screen.getByText('102 notes')).toBeInTheDocument();
    });

    it('sorts on the server: A-Z asks for title_asc and shows the server order', async () => {
        const rows = [row(1), row(2)];
        renderWithProviders(<NoteList />, {
            mocks: [
                mockNotesQuery(rows),
                mockNotesQuery([{ ...row(2), title: 'apple' }, { ...row(1), title: 'Banana' }], { ...DEFAULT_VARS, sort: 'title_asc' }),
            ],
        });
        await screen.findByText('Note 1');
        fireEvent.click(screen.getByRole('button', { name: 'A-Z' }));
        const apple = await screen.findByText('apple');
        const banana = screen.getByText('Banana');
        expect(apple.compareDocumentPosition(banana) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shows the server preview, not the body (lists carry no content)', async () => {
        renderWithProviders(<NoteList />, { mocks: [mockNotesQuery([row(1)])] });
        expect(await screen.findByText('Body 1')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /show more notes/i })).toBeNull();
    });
});
