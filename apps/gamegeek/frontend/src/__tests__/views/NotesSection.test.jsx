/**
 * The notes draft (review 2026-11-20): it holds only what she changed, and a
 * save that comes back while she is still typing keeps what she typed since.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../testUtils';

const setState = vi.fn();
vi.mock('../../hooks/useGameActions', () => ({ useSetGameState: () => setState }));

const { default: NotesSection } = await import('../../views/detail/NotesSection');

const game = (me) => ({ id: 'g1', title: 'Hades', me });

beforeEach(() => { setState.mockReset(); });

describe('NotesSection draft', { timeout: 60000 }, () => {
  it('sends only the field she changed, and shows a review saved elsewhere meanwhile', async () => {
    setState.mockResolvedValue({});
    const { rerender } = renderWithProviders(<NotesSection game={game({ notes: 'Act 1', review: 'Good' })} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Notes' }), { target: { value: 'Act 2' } });

    // Her review changed on another device and the game was refetched.
    rerender(<NotesSection game={game({ notes: 'Act 1', review: 'Great, actually' })} />);
    expect(screen.getByRole('textbox', { name: 'Review' })).toHaveValue('Great, actually');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(setState).toHaveBeenCalledWith('g1', { notes: 'Act 2' }));
  });

  it('typing while a save is in flight is kept when the save comes back', async () => {
    let finish;
    setState.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { rerender } = renderWithProviders(<NotesSection game={game({ notes: '', review: '' })} />);
    const notes = screen.getByRole('textbox', { name: 'Notes' });
    fireEvent.change(notes, { target: { value: 'Boss 3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.change(notes, { target: { value: 'Boss 3: use the shield' } });

    // The save lands: the cache now says "Boss 3".
    await act(async () => { finish({}); });
    rerender(<NotesSection game={game({ notes: 'Boss 3', review: '' })} />);
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('Boss 3: use the shield');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('a save with nothing typed since clears the draft', async () => {
    setState.mockResolvedValue({});
    const { rerender } = renderWithProviders(<NotesSection game={game({ notes: '', review: '' })} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Notes' }), { target: { value: 'Done' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved.');
    rerender(<NotesSection game={game({ notes: 'Done', review: '' })} />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
