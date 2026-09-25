import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import SteamPreview, { PREVIEW_LIMIT, importSummary } from '../../views/settings/SteamPreview';
import { renderWithProviders } from '../testUtils';

const dryRun = {
  configured: true,
  total: 14,
  toCreate: Array.from({ length: 11 }, (_, i) => ({ steamAppId: String(1000 + i), title: `Steam Game ${i + 1}`, hours: i === 0 ? 0 : i * 1.5 })),
  toUpdateHours: [{ gameId: 'g1', title: 'Hades', hours: 40 }],
  unchanged: 2,
};

describe('SteamPreview', () => {
  it('shows the counts and the first N new titles with hours', () => {
    renderWithProviders(<SteamPreview preview={dryRun} />);
    const box = screen.getByTestId('steam-preview');
    expect(box).toHaveTextContent('14in the Steam library');
    expect(box).toHaveTextContent('11new to GameGeek');
    expect(box).toHaveTextContent('1hours to update');
    expect(box).toHaveTextContent('2already up to date');
    expect(screen.getByText('Steam Game 1')).toBeInTheDocument();
    expect(screen.getByText('Unplayed')).toBeInTheDocument();
    expect(screen.getByText(`Steam Game ${PREVIEW_LIMIT}`)).toBeInTheDocument();
    expect(screen.queryByText(`Steam Game ${PREVIEW_LIMIT + 1}`)).not.toBeInTheDocument();
    expect(screen.getByText(`…and ${11 - PREVIEW_LIMIT} more.`)).toBeInTheDocument();
  });

  it('explains a private profile instead of reporting zero games', () => {
    renderWithProviders(<SteamPreview preview={{ configured: true, private: true, total: 0, toCreate: [], toUpdateHours: [], unchanged: 0 }} />);
    const warn = screen.getByTestId('steam-private');
    expect(warn).toHaveTextContent(/private/i);
    expect(warn).toHaveTextContent(/Game details/);
    expect(screen.queryByTestId('steam-preview')).not.toBeInTheDocument();
  });

  it('passes the server message through when import is not configured', () => {
    renderWithProviders(<SteamPreview preview={{ configured: false, message: 'Steam import needs STEAM_API_KEY.' }} />);
    expect(screen.getByText('Steam import needs STEAM_API_KEY.')).toBeInTheDocument();
  });

  it('summarises a dry run', () => {
    expect(importSummary(dryRun)).toEqual({ total: 14, create: 11, hours: 1, unchanged: 2 });
    expect(importSummary(null)).toEqual({ total: 0, create: 0, hours: 0, unchanged: 0 });
  });
});
