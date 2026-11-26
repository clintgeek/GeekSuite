import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../testUtils';
import NoteRow from '../../../components/notes/NoteRow';

/**
 * A keyword search hit on a handwritten note opens the note at the words
 * (DOCS/HANDWRITING.md §5): the row links to `/notes/:id?find=<q>`.
 */
const row = (extra = {}) => ({
    _id: 'hw1',
    title: 'Garage and gate',
    type: 'handwritten',
    tags: [],
    snippet: 'ask about the side gate',
    isLocked: false,
    isEncrypted: false,
    createdAt: '2026-11-20T12:00:00.000Z',
    updatedAt: '2026-11-20T12:00:00.000Z',
    ...extra,
});
const href = () => screen.getByRole('link').getAttribute('href');

describe('NoteRow: a search hit in a handwritten note', () => {
    it.each(['keyword', 'both', null])('a %s hit links to the words on the page', (matchedBy) => {
        renderWithProviders(<NoteRow note={row({ matchedBy })} query=" side gate " />);
        expect(href()).toBe('/notes/hw1?find=side%20gate');
    });

    it('a meaning-only hit opens the note as usual', () => {
        renderWithProviders(<NoteRow note={row({ matchedBy: 'meaning', why: 'the fence' })} query="gate" />);
        expect(href()).toBe('/notes/hw1');
    });

    it('a typed note, a locked note and a plain list row open as usual', () => {
        const { unmount } = renderWithProviders(<NoteRow note={row({ type: 'markdown' })} query="gate" />);
        expect(href()).toBe('/notes/hw1');
        unmount();
        const locked = renderWithProviders(<NoteRow note={row({ isLocked: true })} query="gate" />);
        expect(href()).toBe('/notes/hw1');
        locked.unmount();
        renderWithProviders(<NoteRow note={row()} />);
        expect(href()).toBe('/notes/hw1');
    });
});
