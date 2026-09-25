import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import FindMetadataDialog from '../../views/detail/FindMetadataDialog';
import { getMetadataCandidates } from '../../api/rest';
import { makeDetailGame } from '../fixtures';
import { renderWithProviders } from '../testUtils';

vi.mock('../../api/rest', () => ({ getMetadataCandidates: vi.fn() }));

const CANDIDATES = [
  { provider: 'steam', providerId: '1145360', title: 'Hades', year: 2020, coverUrl: null, platforms: ['pc', 'switch'], wouldMatch: true },
  { provider: 'igdb', providerId: '113112', title: 'Hades', year: 2020, coverUrl: null, platforms: ['pc'], wouldMatch: false },
];

describe('FindMetadataDialog', () => {
  afterEach(() => vi.clearAllMocks());

  it('loads candidates for the game when opened and lists them with a best-match marker', async () => {
    getMetadataCandidates.mockResolvedValueOnce({ candidates: CANDIDATES });
    const game = makeDetailGame({ id: 'g1', title: 'Hades' });
    renderWithProviders(<FindMetadataDialog open game={game} onClose={vi.fn()} onApply={vi.fn()} />);

    expect(getMetadataCandidates).toHaveBeenCalledWith('g1');
    await waitFor(() => expect(screen.getByRole('list', { name: 'Metadata candidates' })).toBeInTheDocument());
    const list = screen.getByRole('list', { name: 'Metadata candidates' });
    expect(within(list).getAllByText('Hades')).toHaveLength(2);
    expect(screen.getByText('Best match')).toBeInTheDocument();
  });

  it('applies the picked candidate, notifies, and closes', async () => {
    getMetadataCandidates.mockResolvedValueOnce({ candidates: CANDIDATES });
    const onApply = vi.fn().mockResolvedValue();
    const onApplied = vi.fn();
    const onClose = vi.fn();
    const game = makeDetailGame({ id: 'g1', title: 'Hades' });
    renderWithProviders(<FindMetadataDialog open game={game} onClose={onClose} onApply={onApply} onApplied={onApplied} />);

    await waitFor(() => expect(screen.getByRole('list', { name: 'Metadata candidates' })).toBeInTheDocument());
    const steamOption = screen.getByRole('button', { name: /Use the match from Steam/ });
    fireEvent.click(steamOption);

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(CANDIDATES[0]));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(CANDIDATES[0]));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('keeps the sheet open and does not call onApplied when apply fails', async () => {
    getMetadataCandidates.mockResolvedValueOnce({ candidates: CANDIDATES });
    const onApply = vi.fn().mockRejectedValue(new Error('nope'));
    const onApplied = vi.fn();
    const onClose = vi.fn();
    const game = makeDetailGame({ id: 'g1', title: 'Hades' });
    renderWithProviders(<FindMetadataDialog open game={game} onClose={onClose} onApply={onApply} onApplied={onApplied} />);

    await waitFor(() => expect(screen.getByRole('list', { name: 'Metadata candidates' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Use the match from Steam/ }));

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApplied).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows an empty state when there are no candidates', async () => {
    getMetadataCandidates.mockResolvedValueOnce({ candidates: [] });
    const game = makeDetailGame({ id: 'g1', title: 'Some Obscure Game' });
    renderWithProviders(<FindMetadataDialog open game={game} onClose={vi.fn()} onApply={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/No candidates found/)).toBeInTheDocument());
  });
});
