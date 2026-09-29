import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../testUtils';
import NoteRow from '../../../components/notes/NoteRow';

/**
 * The row's pinned indicator: a quiet glyph with an accessible name
 * ("Pinned"), same visual weight as TypeIcon. The name must exist ONLY when
 * the note is pinned — this is what a screen reader announces, and it is
 * also how the mobile harness and the grouping tests probe for it.
 */

const note = (extra = {}) => ({
  id: 'n1',
  title: 'Roof quote',
  content: 'call back',
  type: 'text',
  tags: [],
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
  ...extra,
});

describe('NoteRow — pinned indicator', () => {
  it('shows a "Pinned" glyph when the note is pinned', () => {
    renderWithProviders(<NoteRow note={note({ pinned: true })} />);
    expect(screen.getByRole('img', { name: 'Pinned' })).toBeInTheDocument();
  });

  it('shows no "Pinned" glyph when the note is not pinned', () => {
    renderWithProviders(<NoteRow note={note({ pinned: false })} />);
    expect(screen.queryByRole('img', { name: 'Pinned' })).not.toBeInTheDocument();
  });

  it('shows no "Pinned" glyph when the note carries no pinned field at all', () => {
    renderWithProviders(<NoteRow note={note()} />);
    expect(screen.queryByRole('img', { name: 'Pinned' })).not.toBeInTheDocument();
  });
});
