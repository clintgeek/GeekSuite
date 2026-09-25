import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import PlayniteImportCard from '../../views/settings/PlayniteImportCard';
import { importPlaynite } from '../../api/rest';
import { renderWithProviders } from '../testUtils';

vi.mock('../../api/rest', () => ({ importPlaynite: vi.fn() }));

const ApolloWrapper = ({ children }) => <MockedProvider mocks={[]}>{children}</MockedProvider>;

const dryRunFixture = (over = {}) => ({
  schemaVersion: 1,
  generatedAtUtc: '2026-09-25T16:21:03Z',
  total: 20,
  counts: { create: 5, addCopy: 2, update: 3, unchanged: 10, skippedHidden: 4, notInFile: 1, invalid: 0 },
  samples: {
    create: [{ title: 'Arcade Paradise', storefront: 'epic' }],
    addCopy: [{ title: 'Celeste', storefront: 'gog' }],
    update: [{ title: 'Hades', hoursBefore: 1.2, hoursAfter: 3.4 }],
    notInFile: [{ title: 'Old Game' }],
  },
  committed: false,
  ...over,
});

function selectFile() {
  const file = new File(['{"schemaVersion":1,"games":[]}'], 'playnite-library.json', { type: 'application/json' });
  const input = screen.getByTestId('playnite-file-input');
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

function renderCard(profile = null) {
  return renderWithProviders(<PlayniteImportCard profile={profile} />, { wrapper: ApolloWrapper });
}

describe('PlayniteImportCard', () => {
  afterEach(() => vi.clearAllMocks());

  it('runs a dry run automatically on file pick and shows its counts', async () => {
    importPlaynite.mockResolvedValueOnce(dryRunFixture());
    renderCard();

    selectFile();

    await waitFor(() => expect(screen.getByTestId('playnite-preview')).toBeInTheDocument());
    const box = screen.getByTestId('playnite-preview');
    expect(box).toHaveTextContent('5New games');
    expect(box).toHaveTextContent('2Extra copies of games you already have');
    expect(box).toHaveTextContent('3Updated');
    expect(box).toHaveTextContent('10Unchanged');
    expect(box).toHaveTextContent("1 game from an earlier import isn't in this file");

    expect(importPlaynite).toHaveBeenCalledTimes(1);
    expect(importPlaynite).toHaveBeenCalledWith(expect.any(File), { dryRun: true, includeHidden: false });
  });

  it('re-requests the dry run with includeHidden when the toggle is switched on', async () => {
    importPlaynite.mockResolvedValueOnce(dryRunFixture());
    renderCard();
    const file = selectFile();
    await waitFor(() => expect(screen.getByTestId('playnite-preview')).toBeInTheDocument());

    importPlaynite.mockResolvedValueOnce(dryRunFixture({ counts: { create: 8, addCopy: 2, update: 3, unchanged: 10, skippedHidden: 4, notInFile: 1, invalid: 0 } }));
    const toggle = screen.getByLabelText(/hidden in Playnite/i);
    fireEvent.click(toggle);

    await waitFor(() => expect(importPlaynite).toHaveBeenCalledTimes(2));
    expect(importPlaynite).toHaveBeenLastCalledWith(file, { dryRun: true, includeHidden: true });
    await waitFor(() => expect(screen.getByTestId('playnite-preview')).toHaveTextContent('8New games'));
  });

  it('commits with dryRun false and refetches the library', async () => {
    importPlaynite.mockResolvedValueOnce(dryRunFixture());
    renderCard();
    const file = selectFile();
    await waitFor(() => expect(screen.getByTestId('playnite-preview')).toBeInTheDocument());

    const commitButton = screen.getByRole('button', { name: 'Import 10 games' });
    importPlaynite.mockResolvedValueOnce(dryRunFixture({ committed: true }));
    fireEvent.click(commitButton);

    await waitFor(() => expect(importPlaynite).toHaveBeenLastCalledWith(file, { dryRun: false, includeHidden: false }));
    await screen.findByText(/Playnite import done/i);
    // The card resets once the import lands.
    expect(screen.queryByRole('button', { name: /Import \d+ games/ })).not.toBeInTheDocument();
  });

  it('shows the schema v1 message for a bad file', async () => {
    const err = new Error('Bad file');
    err.body = { error: { code: 'PLAYNITE_BAD_FILE', message: 'nope' } };
    importPlaynite.mockRejectedValueOnce(err);
    renderCard();

    selectFile();

    await waitFor(() =>
      expect(screen.getByTestId('playnite-error')).toHaveTextContent("That file isn't a Playnite Library Exporter export (schema v1).")
    );
    expect(screen.queryByTestId('playnite-preview')).not.toBeInTheDocument();
  });
});
