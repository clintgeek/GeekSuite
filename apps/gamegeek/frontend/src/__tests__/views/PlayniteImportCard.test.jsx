import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import PlayniteImportCard from '../../views/settings/PlayniteImportCard';
import { importPlaynite, getPlayniteDropStatus } from '../../api/rest';
import { renderWithProviders } from '../testUtils';

vi.mock('../../api/rest', () => ({ importPlaynite: vi.fn(), getPlayniteDropStatus: vi.fn() }));

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

  beforeEach(() => {
    getPlayniteDropStatus.mockResolvedValue({ enabled: false, watching: false, folder: null, lastFile: null });
  });

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

  describe('the Nextcloud auto-import line', () => {
    it('shows nothing when the drop importer is not enabled', async () => {
      getPlayniteDropStatus.mockResolvedValue({ enabled: false, watching: false, folder: null, lastFile: null });
      renderCard();
      await waitFor(() => expect(getPlayniteDropStatus).toHaveBeenCalled());
      expect(screen.queryByTestId('playnite-auto-import')).not.toBeInTheDocument();
    });

    it('says it is waiting for the folder when enabled but this user has none yet', async () => {
      getPlayniteDropStatus.mockResolvedValue({ enabled: true, watching: false, folder: 'gamegeek-import/chef/', lastFile: null });
      renderCard();
      await waitFor(() =>
        expect(screen.getByTestId('playnite-auto-import')).toHaveTextContent('Auto-import: waiting for a gamegeek-import/chef/ folder in Nextcloud.')
      );
    });

    it('reports the last imported export with new/updated counts', async () => {
      getPlayniteDropStatus.mockResolvedValue({
        enabled: true,
        watching: true,
        folder: 'gamegeek-import/chef/',
        lastFile: {
          name: 'playnite-library.json',
          status: 'imported',
          processedAt: new Date().toISOString(),
          generatedAtUtc: '2026-09-25T16:21:03Z',
          counts: { create: 3, addCopy: 0, update: 5, unchanged: 900, skippedHidden: 200, notInFile: 0, invalid: 0 },
          error: null,
        },
      });
      renderCard();
      await waitFor(() =>
        expect(screen.getByTestId('playnite-auto-import')).toHaveTextContent(
          'Auto-import: watching gamegeek-import/chef/ in Nextcloud — last export imported Today (3 new, 5 updated)'
        )
      );
    });

    it('shows a failed last export quietly, with its error', async () => {
      getPlayniteDropStatus.mockResolvedValue({
        enabled: true,
        watching: true,
        folder: 'gamegeek-import/chef/',
        lastFile: {
          name: 'playnite-library.json',
          status: 'failed',
          processedAt: new Date().toISOString(),
          generatedAtUtc: null,
          counts: null,
          error: 'Unsupported Playnite export schemaVersion (2); expected 1',
        },
      });
      renderCard();
      await waitFor(() =>
        expect(screen.getByTestId('playnite-auto-import')).toHaveTextContent(
          'the last export failed: Unsupported Playnite export schemaVersion (2); expected 1'
        )
      );
    });

    it('never blocks the manual upload path when the status fetch fails', async () => {
      getPlayniteDropStatus.mockRejectedValue(new Error('network blip'));
      importPlaynite.mockResolvedValueOnce(dryRunFixture());
      renderCard();
      selectFile();
      await waitFor(() => expect(screen.getByTestId('playnite-preview')).toBeInTheDocument());
      expect(screen.queryByTestId('playnite-auto-import')).not.toBeInTheDocument();
    });
  });
});
