import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import { renderWithProviders } from '../testUtils';
import MarkdownEditor from '../../components/editors/MarkdownEditor';
import LinkedFrom from '../../components/notes/LinkedFrom';
import { MARKDOWN_COMPONENTS } from '../../components/notes/markdownComponents';
import { WikiLinkContext, markdownPluginsFor } from '../../hooks/useNoteLinks';
import { BACKLINKS, NOTE_TITLES } from '../../graphql/queries';
import {
    findWikiLinks, openWikiLink, completeWikiLink, linkMap, linkKey,
} from '../../utils/wikiLinks';

/**
 * [[Links]] (DOCS/CONTEXT.md §12): the syntax helpers, the rendered links
 * (resolved → the note; unresolved → "create it"), the [[ picker in the
 * markdown editor, and "Linked from".
 */

describe('wikiLinks helpers', () => {
    it('finds [[Title]] and [[Title|shown]], keyed case-insensitively', () => {
        expect(findWikiLinks('a [[Garage  Plan]] b [[x|the X]] [[ ]]').map((l) => [l.title, l.label, l.key]))
            .toEqual([['Garage Plan', 'Garage Plan', 'garage plan'], ['x', 'the X', 'x']]);
        expect(linkKey(' Mixed  Case ')).toBe('mixed case');
    });

    it('openWikiLink sees an unfinished [[ before the caret, and nothing else', () => {
        expect(openWikiLink('See [[gar', 9)).toEqual({ start: 4, query: 'gar' });
        expect(openWikiLink('See [[', 6)).toEqual({ start: 4, query: '' });
        expect(openWikiLink('See [[gar]] ok', 14)).toBeNull();
        expect(openWikiLink('See [[a|alias', 13)).toBeNull();
        expect(openWikiLink('[[a\nb', 5)).toBeNull();
    });

    it('completeWikiLink replaces the open [[query, swallowing a typed ]]', () => {
        expect(completeWikiLink('See [[gar', { start: 4, caret: 9 }, { id: 'a', title: 'Garage plan' }))
            .toEqual({ text: 'See [[Garage plan]]', caret: 19 });
        expect(completeWikiLink('See [[gar]] now', { start: 4, caret: 9 }, { id: 'a', title: 'Garage plan' }).text)
            .toBe('See [[Garage plan]] now');
    });

    it('a title the syntax cannot carry becomes an in-app id link', () => {
        expect(completeWikiLink('[[q', { start: 0, caret: 3 }, { id: 'abc', title: 'A [draft] | v2' }).text)
            .toBe('[A \\[draft\\] | v2](/notes/abc)');
    });

    it('linkMap keeps resolved title links only', () => {
        const m = linkMap([
            { key: 'a', noteId: '1' }, { key: 'b', noteId: null }, { key: 'id:ff', noteId: 'ff' },
        ]);
        expect([...m.entries()]).toEqual([['a', '1']]);
    });
});

function Rendered({ md, resolve = () => null }) {
    return (
        <ReactMarkdown remarkPlugins={markdownPluginsFor(resolve)} components={MARKDOWN_COMPONENTS}>{md}</ReactMarkdown>
    );
}

describe('rendered [[links]]', () => {
    it('a resolved link goes to the note; an unresolved one offers to create it', () => {
        const resolve = (key) => (key === 'garage plan' ? 'n42' : null);
        renderWithProviders(<Rendered md="See [[Garage Plan|the plan]] and [[Shed door]]." resolve={resolve} />);
        const plan = screen.getByRole('link', { name: 'the plan' });
        expect(plan).toHaveAttribute('href', '/notes/n42');
        expect(plan).toHaveAttribute('data-wikilink', 'resolved');
        const shed = screen.getByRole('link', { name: 'Shed door' });
        expect(shed).toHaveAttribute('href', '/notes/new?title=Shed%20door');
        expect(shed).toHaveAttribute('data-wikilink', 'missing');
        expect(shed.className).toContain('ng-wikilink-missing');
    });

    it('code is left alone', () => {
        const { container } = renderWithProviders(<Rendered md={'`[[Not a link]]`\n\n```\n[[Nor this]]\n```'} />);
        expect(container.querySelectorAll('a')).toHaveLength(0);
        expect(container.textContent).toContain('[[Not a link]]');
    });

    it('the viewer/editor resolver comes through WikiLinkContext', async () => {
        const { useMarkdownPlugins } = await import('../../hooks/useNoteLinks');
        function Probe() {
            const plugins = useMarkdownPlugins();
            return <ReactMarkdown remarkPlugins={plugins} components={MARKDOWN_COMPONENTS}>{'[[T]]'}</ReactMarkdown>;
        }
        renderWithProviders(
            <WikiLinkContext.Provider value={(k) => (k === 't' ? 'id7' : null)}><Probe /></WikiLinkContext.Provider>,
        );
        expect(screen.getByRole('link', { name: 'T' })).toHaveAttribute('href', '/notes/id7');
    });
});

// ── the [[ picker ──────────────────────────────────────────────────────────
const titles = (q, noteTitles) => ({
    request: { query: NOTE_TITLES, variables: { q, limit: 7 } },
    result: { data: { noteTitles } },
    maxUsageCount: 10,
});
const T = (id, title) => ({ id, title, type: 'markdown', updatedAt: '2026-09-20T12:00:00.000Z' });
const MOCKS = [
    titles(null, [T('a', 'Garage plan'), T('b', 'Kitchen')]),
    titles('gar', [T('a', 'Garage plan'), T('c', 'The garage')]),
    titles('garage plan', [T('a', 'Garage plan')]),
    titles('zzz', []),
    titles('tch', [T('b', 'Kitchen')]),
];

function Harness({ initial = '' }) {
    const [content, setContent] = useState(initial);
    return (
        <>
            <MarkdownEditor content={content} setContent={setContent} />
            <output data-testid="value">{content}</output>
        </>
    );
}

const body = () => screen.getByRole('textbox', { name: 'Note body' });
const type = (value) => fireEvent.change(body(), { target: { value, selectionStart: value.length, selectionEnd: value.length } });

describe('the [[ picker', () => {
    it('typing [[ lists titles; ↓ Enter inserts [[Title]]', async () => {
        renderWithProviders(<Harness />, { mocks: MOCKS });
        act(() => body().focus());
        type('See [[gar');
        const list = await screen.findByRole('listbox', { name: 'Link to a note' });
        await waitFor(() => expect(screen.getByRole('option', { name: /The garage/ })).toBeInTheDocument());
        expect(body()).toHaveAttribute('aria-controls', list.id);
        expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(body(), { key: 'ArrowDown' });
        expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
        expect(body().getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1].id);
        fireEvent.keyDown(body(), { key: 'Enter' });
        expect(screen.getByTestId('value').textContent).toBe('See [[The garage]]');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('a tap chooses too', async () => {
        renderWithProviders(<Harness />, { mocks: MOCKS });
        act(() => body().focus());
        type('[[gar');
        // Wait for the list for "gar" itself (after the debounce), not the
        // first list, whose rows are replaced a moment later.
        await screen.findByRole('option', { name: /The garage/ });
        fireEvent.click(screen.getByRole('option', { name: /Garage plan/ }));
        expect(screen.getByTestId('value').textContent).toBe('[[Garage plan]]');
    });

    it('offers a note that does not exist yet, as [[what you typed]]', async () => {
        renderWithProviders(<Harness />, { mocks: MOCKS });
        act(() => body().focus());
        type('[[zzz');
        const opt = await screen.findByRole('option', { name: /New note “zzz”/ });
        fireEvent.click(opt);
        expect(screen.getByTestId('value').textContent).toBe('[[zzz]]');
    });

    it('no "new note" row when a title matches exactly', async () => {
        renderWithProviders(<Harness />, { mocks: MOCKS });
        act(() => body().focus());
        type('[[garage plan');
        await screen.findByRole('option', { name: /Garage plan/ });
        await new Promise((r) => setTimeout(r, 200));
        expect(screen.queryByRole('option', { name: /New note/ })).not.toBeInTheDocument();
    });

    it('Enter pressed before the new list arrives still picks a row that matches what is typed', async () => {
        renderWithProviders(<Harness />, { mocks: MOCKS });
        act(() => body().focus());
        type('[[');
        await screen.findByRole('option', { name: /Kitchen/ }); // the q=null list: Garage plan, Kitchen
        // Mid-word, so neither row is a prefix match: only narrowing the stale
        // list to what is typed keeps Garage plan from being chosen.
        type('[[tch'); // no request for "tch" has answered (or even been sent) yet
        fireEvent.keyDown(body(), { key: 'Enter' });
        expect(screen.getByTestId('value').textContent).toBe('[[Kitchen]]');
    });

    it('Esc closes it, and it stays closed for that [[', async () => {
        renderWithProviders(<Harness />, { mocks: MOCKS });
        act(() => body().focus());
        type('[[gar');
        await screen.findByRole('listbox');
        fireEvent.keyDown(body(), { key: 'Escape' });
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        type('[[gara');
        await new Promise((r) => setTimeout(r, 200));
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(body()).not.toHaveAttribute('aria-controls');
    });

    it('Enter is an ordinary newline when the picker is closed', () => {
        renderWithProviders(<Harness initial="plain" />, { mocks: MOCKS });
        const ev = fireEvent.keyDown(body(), { key: 'Enter' });
        expect(ev).toBe(true); // not prevented
    });
});

// ── Linked from ────────────────────────────────────────────────────────────
const back = (backlinks) => ({ request: { query: BACKLINKS, variables: { noteId: 'me' } }, result: { data: { backlinks } } });

describe('LinkedFrom', () => {
    it('lists the linking notes with the sentence that links, the link in bold', async () => {
        renderWithProviders(<LinkedFrom noteId="me" />, {
            mocks: [back([
                { id: 'a', title: 'Shopping', type: 'markdown', updatedAt: '2026-09-20T12:00:00.000Z', snippet: 'buy brackets, see [[Garage plan|the plan]] first' },
                { id: 'me', title: 'Myself', type: 'markdown', updatedAt: null, snippet: null },
            ])],
        });
        const heading = await screen.findByRole('heading', { name: 'Linked from' });
        expect(heading.closest('section')).toHaveAttribute('data-linked-from');
        expect(screen.getByRole('link', { name: /Shopping/ })).toHaveAttribute('href', '/notes/a');
        expect(screen.getByText('the plan').tagName).toBe('STRONG');
        expect(screen.queryByText('Myself')).not.toBeInTheDocument();
    });

    it('renders nothing when nothing links here', async () => {
        const { container } = renderWithProviders(<LinkedFrom noteId="me" />, { mocks: [back([])] });
        await new Promise((r) => setTimeout(r, 30));
        expect(container.querySelector('section')).toBeNull();
    });

    it('renders nothing on error', async () => {
        const { container } = renderWithProviders(<LinkedFrom noteId="me" />, {
            mocks: [{ request: { query: BACKLINKS, variables: { noteId: 'me' } }, error: new Error('old gateway') }],
        });
        await new Promise((r) => setTimeout(r, 30));
        expect(container.querySelector('section')).toBeNull();
    });
});
