import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createNoteTheme } from '../../theme/createAppTheme';

/**
 * The editor's half of Markdown import (DOCS/CONTEXT.md §9): a brand-new,
 * still-empty Markdown note tells the importer a dropped file may take its
 * place; anything written, a saved note, or another type withdraws that.
 */

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: () => ({ data: undefined, loading: false, error: undefined }),
    useMutation: () => [vi.fn().mockResolvedValue({ data: {} }), { loading: false }],
  };
});

vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useToast: () => ({ notify: vi.fn() }) };
});

vi.mock('../../components/notes/NoteTypeRouter', async () => {
  const actual = await vi.importActual('../../components/notes/NoteTypeRouter');
  return { ...actual, default: () => <div data-testid="editor" /> };
});

import NoteEditorPage from '../../pages/NoteEditorPage';
import useImportStore from '../../store/importStore';

const theme = createNoteTheme('light');
const renderAt = (path) => render(
  <ThemeProvider theme={theme}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/notes/new" element={<NoteEditorPage />} />
      </Routes>
    </MemoryRouter>
  </ThemeProvider>
);

beforeEach(() => useImportStore.setState({ editorDropOk: false }));

describe('a blank new note and dropped files', () => {
  it('is open to a drop while empty, and not once a title is typed', async () => {
    renderAt('/notes/new');
    await screen.findByTestId('editor');
    expect(useImportStore.getState().editorDropOk).toBe(true);
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Note title' }), { target: { value: 'Mine' } });
    });
    expect(useImportStore.getState().editorDropOk).toBe(false);
  });

  it('a new sketch is not (tldraw takes its own drops)', async () => {
    renderAt('/notes/new?type=handwritten');
    await screen.findByTestId('editor');
    expect(useImportStore.getState().editorDropOk).toBe(false);
  });

  it('withdraws on leaving the page', async () => {
    const { unmount } = renderAt('/notes/new');
    await screen.findByTestId('editor');
    unmount();
    expect(useImportStore.getState().editorDropOk).toBe(false);
  });
});
