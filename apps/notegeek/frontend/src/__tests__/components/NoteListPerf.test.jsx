import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { GET_NOTES_PAGE, NOTE_THUMB_CONTENT } from '../../graphql/queries';
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
 * Since review 5.1 the list carries no bodies at all: each sketch tile
 * fetches its own note's body once it is near the screen.
 *
 * The time bar is an order of magnitude, not a local best: CI measures the
 * runner, not the code (see the wall-clock landmine in DOCS/CONTEXT.md).
 */

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
                preview: type === 'handwritten' ? '' : `Body ${i}`,
                pinned: false,
                pinnedAt: null,
                createdAt: new Date(now - i * 3600e3).toISOString(),
                updatedAt: new Date(now - i * 3600e3).toISOString(),
            };
        });
        const thumbMocks = notes.filter((n) => n.type === 'handwritten').map((n) => ({
            request: { query: NOTE_THUMB_CONTENT, variables: { id: n.id } },
            result: { data: { note: { id: n.id, content: heavy, updatedAt: n.updatedAt } } },
        }));

        const started = performance.now();
        renderWithProviders(<NoteList />, {
            mocks: [{
                request: { query: GET_NOTES_PAGE, variables: { tag: undefined, prefix: undefined, under: undefined, type: null, sort: 'updatedAt_desc', first: 100 } },
                result: { data: { notesPage: { notes, nextCursor: null, hasMore: false } } },
            }, ...thumbMocks],
        });
        await screen.findByText('Note 199');
        const rowsMs = performance.now() - started;

        // Every sketch row shows something the moment the rows are up: its
        // placeholder glyph, or its preview if its idle slot already ran. How
        // many of each is scheduling, not behaviour: on a slow CI runner the
        // 200 rows took long enough that every preview had landed first
        // (2026-09-27), so asserting "some placeholders" was a race.
        const shown = () => screen.queryAllByRole('img', { name: 'Sketch thumbnail' }).length
            + screen.queryAllByRole('img', { name: 'Sketch preview' }).length;
        expect(shown()).toBe(60);
        // …and every preview lands.
        await waitFor(() => expect(screen.getAllByRole('img', { name: 'Sketch preview' })).toHaveLength(60), { timeout: 60000 });

        console.info(`[perf] 200 rows in ${rowsMs.toFixed(0)}ms; all 60 sketch previews by ${(performance.now() - started).toFixed(0)}ms`);
        expect(rowsMs).toBeLessThan(30000);
    }, 120000);
});
