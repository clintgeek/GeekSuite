import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import { createNoteTheme } from '../../theme/createAppTheme';

/**
 * ShareTarget (`/share`) — the receiving end of the Android share
 * target. `buildNoteFromShareParams` (the parse/build logic) has its own
 * pure-function coverage in `utils/shareTarget.test.js`; this file covers
 * the page's outcomes: nothing to share; a NEW note on one tap (it used to be
 * created on arrival — 2026-10-01 made it a choice); a save failure shown,
 * not swallowed; and "Add to an existing note" — the hybrid search ranks the
 * likely note first, Markdown notes only, and picking one opens Fold-in with
 * the share in it.
 *
 * Apollo is mocked at the hook level, same pattern as photoPagesPage.test.jsx.
 */

const createNote = vi.fn();
const notify = vi.fn();
const searchCalls = [];

const SEARCH_ROWS = [
  { _id: 'r1', title: 'Old rich note about spiders', type: 'text', matchedBy: 'keyword', snippet: 'spiders', why: null },
  { _id: 'n7', title: 'Spiders', type: 'markdown', matchedBy: 'both', snippet: 'Widow spiders…', why: 'Black widow and red widow' },
  { _id: 'n8', title: 'Garden', type: 'markdown', matchedBy: 'meaning', snippet: '', why: 'woodpile' },
];

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: (doc, opts) => {
      const name = doc?.definitions?.[0]?.name?.value;
      if (name === 'SearchNotes' && !opts?.skip) {
        searchCalls.push(opts.variables);
        return { data: { searchNotes: SEARCH_ROWS }, loading: false };
      }
      return { data: undefined, loading: false };
    },
    useMutation: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      const fn = { CreateNote: createNote }[name] || vi.fn().mockResolvedValue({ data: {} });
      return [fn, { loading: false }];
    },
    useApolloClient: () => ({ query: vi.fn(), mutate: vi.fn() }),
  };
});

vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useToast: () => ({ notify }) };
});

import ShareTarget from '../../pages/ShareTarget';

const theme = createNoteTheme('light');

function OpenedEditor() {
  const { id } = useParams();
  return <div>opened editor for note {id}</div>;
}

function renderShare(path) {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/share" element={<ShareTarget />} />
          <Route path="/notes/:id/edit" element={<OpenedEditor />} />
          <Route path="/" element={<div>home</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

beforeEach(() => {
  createNote.mockReset();
  notify.mockReset();
  searchCalls.length = 0;
});

describe('ShareTarget', () => {
  it('shows a friendly message when nothing usable was shared', async () => {
    renderShare('/share');
    expect(await screen.findByText(/nothing to share/i)).toBeInTheDocument();
    expect(createNote).not.toHaveBeenCalled();
  });

  it('creates nothing on arrival; "Save as a new note" creates the markdown note and opens it', async () => {
    createNote.mockResolvedValue({ data: { createNote: { id: 'note-123' } } });

    renderShare('/share?title=Read+later&text=worth+it&url=https%3A%2F%2Fexample.com');
    await screen.findByText('Shared to NoteGeek');
    expect(createNote).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save as a new note' }));
    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
    const [[args]] = createNote.mock.calls;
    expect(args.variables).toEqual({
      title: 'Read later',
      content: 'worth it\n\n[https://example.com](https://example.com)',
      type: 'markdown',
    });

    expect(await screen.findByText(/opened editor for note note-123/)).toBeInTheDocument();
  });

  it('shows an error state instead of a blank page when the save fails', async () => {
    createNote.mockRejectedValue(new Error('network down'));

    renderShare('/share?text=hello');
    fireEvent.click(await screen.findByRole('button', { name: 'Save as a new note' }));

    expect(await screen.findByText(/couldn.t save that share/i)).toBeInTheDocument();
    expect(notify).toHaveBeenCalled();
  });

  it('ranks the note it probably belongs in first — Markdown only — and opens Fold-in with the share', async () => {
    renderShare('/share?text=Found+a+brown+widow+in+the+garage');
    const best = await screen.findByRole('button', { name: 'Looks like it belongs in: Spiders' });
    // The search was asked with the shared text, by meaning as well as words.
    expect(searchCalls[0]).toEqual({ q: 'Found a brown widow in the garage', hybrid: true });
    // A rich-text note can't be folded into, so it is not offered at all.
    expect(screen.queryByText('Old rich note about spiders')).toBeNull();
    expect(screen.getByRole('button', { name: 'Garden' })).toBeInTheDocument();

    fireEvent.click(best);
    expect(await screen.findByText('Fold in new info')).toBeInTheDocument();
    expect(screen.getByText('Into “Spiders”')).toBeInTheDocument();
    expect(screen.getByLabelText('New info')).toHaveValue('Found a brown widow in the garage');
    expect(createNote).not.toHaveBeenCalled();
  });
});
