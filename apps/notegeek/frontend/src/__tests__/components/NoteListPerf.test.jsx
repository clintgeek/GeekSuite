import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { gql } from '@apollo/client';
import { renderWithProviders } from '../testUtils';
import NoteList from '../../components/NoteList';

/**
 * A long list with heavy sketch notes must stay a list, not a parse queue.
 *
 * Thumbnails parse their note's JSON snapshot OFF the render path (an idle
 * slot per note, after the row is near the viewport — jsdom has no
 * IntersectionObserver, so here every row counts as visible, which is the
 * worst case). So: the rows paint with a placeholder glyph first, and the
 * sketch previews arrive after.
 *
 * The time bar is an order of magnitude, not a local best: CI measures the
 * runner, not the code (see the wall-clock landmine in DOCS/CONTEXT.md).
 */

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

function sketch(strokes, points) {
    const store = {};
    for (let s = 0; s < strokes; s += 1) {
        store[`shape:${s}`] = {
            id: `shape:${s}`, typeName: 'shape', type: 'draw', x: s * 10, y: s * 4,
            props: { segments: [{ type: 'free', points: Array.from({ length: points }, (_, i) => ({ x: i, y: Math.sin(i / 5) * 20, z: 0.5 })) }] },
        };
    }
    return JSON.stringify({ store });
}

describe('NoteList — a long list with sketch thumbnails', () => {
    it('renders 200 rows (60 heavy sketches) promptly, thumbnails after', async () => {
        const heavy = sketch(40, 150); // ~250 KB each, ~15 MB in the list
        const now = Date.now();
        const notes = Array.from({ length: 200 }, (_, i) => {
            const type = i % 10 < 3 ? 'handwritten' : i % 10 === 3 ? 'code' : 'text';
            return {
                id: `n${i}`,
                title: `Note ${i}`,
                type,
                tags: ['a', 'b'],
                content: type === 'handwritten' ? heavy : type === 'code' ? '{"language":"js","code":"const x = 1;"}' : `<p>Body ${i}</p>`,
                createdAt: new Date(now - i * 3600e3).toISOString(),
                updatedAt: new Date(now - i * 3600e3).toISOString(),
            };
        });

        const started = performance.now();
        renderWithProviders(<NoteList />, {
            mocks: [{
                request: { query: GET_NOTES, variables: { tag: undefined, prefix: undefined, type: null, limit: 200 } },
                result: { data: { notes } },
            }],
        });
        await screen.findByText('Note 199');
        const rowsMs = performance.now() - started;

        // Rows are on screen before a single sketch has been parsed…
        expect(screen.getAllByRole('img', { name: 'Sketch note' }).length).toBeGreaterThan(0);
        // …and the previews land afterwards.
        await waitFor(() => expect(screen.getAllByRole('img', { name: 'Sketch preview' })).toHaveLength(60), { timeout: 20000 });

        console.info(`[perf] 200 rows in ${rowsMs.toFixed(0)}ms; all 60 sketch previews by ${(performance.now() - started).toFixed(0)}ms`);
        expect(rowsMs).toBeLessThan(15000);
    }, 40000);
});
