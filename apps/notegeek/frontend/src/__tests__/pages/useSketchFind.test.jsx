import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import useSketchFind, { pickFindText } from '../../pages/noteEditor/useSketchFind';
import { SKETCH_TRANSCRIPT, SKETCH_TRANSCRIPT_FIND } from '../../graphql/queries';

/**
 * The text a search hit is placed with (DOCS/HANDWRITING.md §5), and the
 * fallback when the gateway is older than the new fields: the old
 * `sketchTranscript.text`, then nothing. Never an error.
 */
const validationError = () => Object.assign(new Error('Cannot query field "lastReading" on type "SketchTranscriptState".'), {
    graphQLErrors: [{ extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }],
});

describe('useSketchFind', () => {
    it('asks for the new fields, marked so an old gateway is not taken for a stale bundle', async () => {
        const apollo = { query: vi.fn(async () => ({ data: { sketchTranscript: { current: false, text: null, lastReading: 'the side gate', lastEdit: null } } })) };
        const { result } = renderHook(() => useSketchFind({ apollo, noteId: 'hw1', query: 'gate' }));
        expect(result.current).toMatchObject({ query: 'gate', loading: true });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current).toMatchObject({ text: 'the side gate', stale: true });
        expect(apollo.query).toHaveBeenCalledTimes(1);
        expect(apollo.query.mock.calls[0][0]).toMatchObject({ query: SKETCH_TRANSCRIPT_FIND, variables: { noteId: 'hw1' }, fetchPolicy: 'no-cache', context: { newFields: true } });
    });

    it('an old gateway: falls back to the existing transcript text, quietly', async () => {
        const apollo = {
            query: vi.fn(async ({ query }) => {
                if (query === SKETCH_TRANSCRIPT_FIND) throw validationError();
                return { data: { sketchTranscript: { current: true, text: 'the side gate' } } };
            }),
        };
        const { result } = renderHook(() => useSketchFind({ apollo, noteId: 'hw1', query: 'gate' }));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current).toMatchObject({ text: 'the side gate', stale: false });
        expect(apollo.query.mock.calls[1][0].query).toBe(SKETCH_TRANSCRIPT);
    });

    it('nothing answers: no text, no error', async () => {
        const apollo = { query: vi.fn(async () => { throw validationError(); }) };
        const { result } = renderHook(() => useSketchFind({ apollo, noteId: 'hw1', query: 'gate' }));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current).toMatchObject({ text: null });
    });

    it('no query, no fetch', () => {
        const apollo = { query: vi.fn() };
        const { result } = renderHook(() => useSketchFind({ apollo, noteId: 'hw1', query: '' }));
        expect(result.current).toBeNull();
        expect(apollo.query).not.toHaveBeenCalled();
    });
});

describe('pickFindText', () => {
    it('the current text first; else the reading or the corrections that hold the words', () => {
        expect(pickFindText({ current: true, text: 'gate now', lastReading: 'gate now' }, 'gate')).toEqual({ text: 'gate now', stale: false });
        expect(pickFindText({ current: false, text: null, lastReading: 'fence', lastEdit: 'the gate' }, 'gate')).toEqual({ text: 'the gate', stale: true });
        expect(pickFindText({ current: false, text: null, lastReading: 'fence', lastEdit: 'wall' }, 'gate')).toEqual({ text: 'fence', stale: true });
        expect(pickFindText(null, 'gate')).toEqual({ text: null, stale: false });
    });
});
