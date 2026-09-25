import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import DetailsSection from '../../views/detail/DetailsSection';
import { makeDetailGame } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const enrichment = (over = {}) => ({
  __typename: 'GameEnrichment',
  status: null,
  provider: null,
  providerId: null,
  matchedTitle: null,
  matchedAt: null,
  attempts: 0,
  error: null,
  manual: false,
  ...over,
});

describe('DetailsSection — metadata provenance line', () => {
  it('shows nothing when the game has no enrichment record at all', () => {
    renderWithProviders(<DetailsSection game={makeDetailGame({ enrichment: null })} />);
    expect(screen.queryByTestId('metadata-provenance')).not.toBeInTheDocument();
  });

  it('matched: names the provider and the matched title', () => {
    const game = makeDetailGame({ enrichment: enrichment({ status: 'matched', provider: 'steam', matchedTitle: 'Hades' }) });
    renderWithProviders(<DetailsSection game={game} />);
    expect(screen.getByTestId('metadata-provenance')).toHaveTextContent('Details from Steam');
    expect(screen.getByTestId('metadata-provenance')).toHaveTextContent('matched as “Hades”');
  });

  it('matched + manual: adds "chosen by you"', () => {
    const game = makeDetailGame({ enrichment: enrichment({ status: 'matched', provider: 'igdb', matchedTitle: 'Hades', manual: true }) });
    renderWithProviders(<DetailsSection game={game} />);
    expect(screen.getByTestId('metadata-provenance')).toHaveTextContent('Details from IGDB');
    expect(screen.getByTestId('metadata-provenance')).toHaveTextContent('chosen by you');
  });

  it('no-match: shows the line and a working Find metadata link', () => {
    const onFindMetadata = vi.fn();
    const game = makeDetailGame({ enrichment: enrichment({ status: 'no-match' }) });
    renderWithProviders(<DetailsSection game={game} onFindMetadata={onFindMetadata} />);
    expect(screen.getByTestId('metadata-provenance')).toHaveTextContent('No metadata match yet');
    fireEvent.click(screen.getByRole('button', { name: 'Find metadata…' }));
    expect(onFindMetadata).toHaveBeenCalledTimes(1);
  });

  it('ambiguous: shows the line and a working Find metadata link', () => {
    const onFindMetadata = vi.fn();
    const game = makeDetailGame({ enrichment: enrichment({ status: 'ambiguous' }) });
    renderWithProviders(<DetailsSection game={game} onFindMetadata={onFindMetadata} />);
    expect(screen.getByTestId('metadata-provenance')).toHaveTextContent('Several possible matches — pick one');
    fireEvent.click(screen.getByRole('button', { name: 'Find metadata…' }));
    expect(onFindMetadata).toHaveBeenCalledTimes(1);
  });

  it('pending: a quiet looking-up line, no link', () => {
    const game = makeDetailGame({ enrichment: enrichment({ status: 'pending' }) });
    renderWithProviders(<DetailsSection game={game} />);
    expect(screen.getByTestId('metadata-provenance')).toHaveTextContent('Looking up details…');
    expect(screen.queryByRole('button', { name: 'Find metadata…' })).not.toBeInTheDocument();
  });

  it('unlinked: says so plainly', () => {
    const game = makeDetailGame({ enrichment: enrichment({ status: 'unlinked' }) });
    renderWithProviders(<DetailsSection game={game} />);
    expect(screen.getByTestId('metadata-provenance')).toHaveTextContent('Metadata unlinked');
  });

  it('error: a quiet failure, no alarm, no link', () => {
    const game = makeDetailGame({ enrichment: enrichment({ status: 'error', error: 'timeout' }) });
    renderWithProviders(<DetailsSection game={game} />);
    expect(screen.getByTestId('metadata-provenance')).toHaveTextContent("Couldn't look up details");
    expect(screen.queryByRole('button', { name: 'Find metadata…' })).not.toBeInTheDocument();
  });
});
