import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import { createNoteTheme } from '../../theme/createAppTheme';

/**
 * ShareTarget (`/share`) — the receiving end of the Android share
 * target. `buildNoteFromShareParams` (the parse/build logic) has its own
 * pure-function coverage in `utils/shareTarget.test.js`; this file covers
 * the page's three outcomes: nothing to share, a note gets created and
 * opened, and a save failure is shown rather than silently swallowed.
 *
 * Apollo is mocked at the hook level, same pattern as photoPagesPage.test.jsx.
 */

const createNote = vi.fn();
const notify = vi.fn();

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useMutation: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      const fn = { CreateNote: createNote }[name] || vi.fn().mockResolvedValue({ data: {} });
      return [fn, { loading: false }];
    },
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
});

describe('ShareTarget', () => {
  it('shows a friendly message when nothing usable was shared', async () => {
    renderShare('/share');
    expect(await screen.findByText(/nothing to share/i)).toBeInTheDocument();
    expect(createNote).not.toHaveBeenCalled();
  });

  it('creates a markdown note from the shared title/text/url and opens it', async () => {
    createNote.mockResolvedValue({ data: { createNote: { id: 'note-123' } } });

    renderShare('/share?title=Read+later&text=worth+it&url=https%3A%2F%2Fexample.com');

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

    expect(await screen.findByText(/couldn.t save that share/i)).toBeInTheDocument();
    expect(notify).toHaveBeenCalled();
  });
});
