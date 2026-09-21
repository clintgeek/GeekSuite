/**
 * The history panel.
 *
 * Keeping versions is only half the feature — the half that matters is being
 * able to get one back. This covers the path a user actually walks: open the
 * panel, recognise a version by what replaced it, read it, put it back.
 *
 * The `reason` chip is asserted deliberately. It is how you tell "I typed over
 * this" from "Tidy replaced this", which is usually the thing you came looking
 * for after an AI action ate something.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../testUtils';
import NoteHistoryDialog from '../../../components/notes/NoteHistoryDialog';
import { GET_NOTE_VERSIONS, GET_NOTE_VERSION } from '../../../graphql/queries';
import { RESTORE_NOTE_VERSION } from '../../../graphql/mutations';

const NOTE = 'note-1';

const version = (over = {}) => ({
  id: 'v1',
  noteId: NOTE,
  title: 'Roof',
  type: 'markdown',
  reason: 'edit',
  createdAt: '2026-09-20T15:00:00.000Z',
  ...over,
});

const listMock = (versions) => ({
  request: { query: GET_NOTE_VERSIONS, variables: { noteId: NOTE } },
  result: { data: { noteVersions: versions } },
});

const bodyMock = (id, content) => ({
  request: { query: GET_NOTE_VERSION, variables: { id } },
  result: {
    data: {
      noteVersion: { ...version({ id }), content },
    },
  },
});

const open = (mocks) =>
  renderWithProviders(
    <NoteHistoryDialog open noteId={NOTE} onClose={vi.fn()} onRestored={vi.fn()} />,
    { mocks },
  );

describe('the list', () => {
  it('says so plainly when there is no history yet', async () => {
    open([listMock([])]);
    expect(await screen.findByText(/no earlier versions yet/i)).toBeInTheDocument();
  });

  it('labels each version with what replaced it', async () => {
    open([listMock([version({ id: 'v1', reason: 'tidy' }), version({ id: 'v2', reason: 'compose' })])]);
    expect(await screen.findByText('Tidy')).toBeInTheDocument();
    expect(screen.getByText('Compose')).toBeInTheDocument();
  });
});

describe('reading one', () => {
  it('fetches the body only when a version is picked', async () => {
    open([listMock([version()]), bodyMock('v1', 'the text as it was')]);
    // Nothing is fetched up front: the list query omits content on purpose.
    expect(await screen.findByText(/pick a version/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Roof'));
    expect(await screen.findByText('the text as it was')).toBeInTheDocument();
  });
});

describe('putting one back', () => {
  it('cannot restore before a version is picked', async () => {
    open([listMock([version()])]);
    await screen.findByText('Roof');
    expect(screen.getByRole('button', { name: /restore this version/i })).toBeDisabled();
  });

  it('hands the restored note back to the page and closes', async () => {
    const onRestored = vi.fn();
    const onClose = vi.fn();
    const restored = {
      id: NOTE, title: 'Roof', content: 'the text as it was',
      type: 'markdown', tags: [], updatedAt: '2026-09-21T00:00:00.000Z',
    };
    renderWithProviders(
      <NoteHistoryDialog open noteId={NOTE} onClose={onClose} onRestored={onRestored} />,
      {
        mocks: [
          listMock([version()]),
          bodyMock('v1', 'the text as it was'),
          {
            request: { query: RESTORE_NOTE_VERSION, variables: { versionId: 'v1' } },
            result: { data: { restoreNoteVersion: restored } },
          },
        ],
      },
    );

    fireEvent.click(await screen.findByText('Roof'));
    await screen.findByText('the text as it was');
    fireEvent.click(screen.getByRole('button', { name: /restore this version/i }));

    await waitFor(() => expect(onRestored).toHaveBeenCalledWith(restored));
    expect(onClose).toHaveBeenCalled();
  });

  it('says why when the restore fails, and stays open', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <NoteHistoryDialog open noteId={NOTE} onClose={onClose} onRestored={vi.fn()} />,
      {
        mocks: [
          listMock([version()]),
          bodyMock('v1', 'the text as it was'),
          {
            request: { query: RESTORE_NOTE_VERSION, variables: { versionId: 'v1' } },
            error: new Error('Version not found'),
          },
        ],
      },
    );

    fireEvent.click(await screen.findByText('Roof'));
    await screen.findByText('the text as it was');
    fireEvent.click(screen.getByRole('button', { name: /restore this version/i }));

    expect(await screen.findByText(/version not found/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
