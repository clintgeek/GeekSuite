import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

    it('shows empty state when no notes', async () => {
        const mocks = [mockNotesQuery([])];
        renderWithProviders(<NoteList />, { mocks });
        await waitFor(() => expect(screen.getByText(/No notes yet/i)).toBeInTheDocument());
    });
});
