import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createNoteTheme } from '../../theme/createAppTheme';

/**
 * Fold-in, wired into the editor (DOCS/CONTEXT.md §13).
 *
 *   - offered in the ⋯ menu for a saved Markdown note, and not for others
 *   - an unsaved edit is SAVED before the proposal is asked for, so the
 *     gateway proposes against what is on screen
 *   - after Apply the editor shows the note as the server wrote it, clean
 *
 * The sheet itself is covered in foldInSheet.test.jsx.
 */

const updateNote = vi.fn();
const preview = vi.fn();
const applyFn = vi.fn();
const notify = vi.fn();
let NOTE;

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      if (name === 'GetNoteById') return { data: { note: NOTE }, loading: false, error: undefined };
      return { data: undefined, loading: false, error: undefined };
    },
    useMutation: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      const fn = { UpdateNote: updateNote, FoldInPreview: preview, FoldInApply: applyFn }[name]
        || vi.fn().mockResolvedValue({ data: {} });
      return [fn, { loading: false }];
    },
    useApolloClient: () => ({
      query: vi.fn().mockResolvedValue({ data: { note: { ...NOTE } } }),
      mutate: vi.fn().mockResolvedValue({ data: {} }),
    }),
  };
});

vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useToast: () => ({ notify }) };
});

// A plain textarea stands in for the editors, so the body can be typed into
// and read back.
vi.mock('../../components/notes/NoteTypeRouter', async () => {
  const actual = await vi.importActual('../../components/notes/NoteTypeRouter');
  return {
    ...actual,
    default: ({ content, onChange }) => (
      <textarea aria-label="Body" value={content} onChange={(e) => onChange(e.target.value)} />
    ),
  };
});

import NoteEditorPage from '../../pages/NoteEditorPage';

const theme = createNoteTheme('light');

const base = (over = {}) => ({
  id: 'note-1',
  title: 'Spiders',
  content: '## Widow spiders\n\n- Black widow\n',
  type: 'markdown',
  tags: [],
  isLocked: false,
  isEncrypted: false,
  pinned: false,
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
  ...over,
});

function renderEditor() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={['/notes/note-1/edit']}>
        <Routes>
          <Route path="/notes/:id/edit" element={<NoteEditorPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'More note actions' }));

beforeEach(() => {
  NOTE = base();
  updateNote.mockReset();
  preview.mockReset();
  applyFn.mockReset();
  notify.mockReset();
  updateNote.mockImplementation(async ({ variables }) => ({ data: { updateNote: { ...NOTE, ...variables } } }));
});

describe('Fold in, from the editor', () => {
  it('is in the ⋯ menu of a saved Markdown note', async () => {
    renderEditor();
    openMenu();
    expect(await screen.findByRole('menuitem', { name: 'Fold in new info' })).toBeInTheDocument();
  });

  it('is not offered on a code note', async () => {
    NOTE = base({ type: 'code', content: JSON.stringify({ language: 'js', code: 'x' }) });
    renderEditor();
    openMenu();
    await screen.findByRole('menuitem', { name: /version history/i });
    expect(screen.queryByRole('menuitem', { name: 'Fold in new info' })).toBeNull();
  });

  it('saves an unsaved edit before asking, then shows the folded-in note clean', async () => {
    const order = [];
    updateNote.mockImplementation(async ({ variables }) => {
      order.push('save');
      return { data: { updateNote: { ...NOTE, ...variables } } };
    });
    preview.mockImplementation(async () => {
      order.push('preview');
      return {
        data: {
          foldInPreview: {
            operations: [{
              __typename: 'FoldInOperation', id: 'op1', type: 'append_to_list', why: 'widows', anchor: 'Red widow', items: ['Brown widow'],
              location: 'List under "## Widow spiders"', start: 40, end: 40, text: '- Brown widow',
            }],
            summary: '', unplaced: [], baseUpdatedAt: NOTE.updatedAt,
            stats: { inputChars: 5, noteChars: 40, strategy: 'whole', sectionsTotal: 1, sectionsSent: 1, sentChars: 40, proposed: 1, valid: 1, failed: false, truncated: false, dropped: [] },
            provenance: { source: 'model', reason: null, model: 'm', provider: 'p', cached: false, callsToday: 1, cap: 60 },
          },
        },
      };
    });
    const FOLDED = '## Widow spiders\n\n- Black widow\n- Red widow\n- Brown widow\n';
    applyFn.mockResolvedValue({ data: { foldInApply: { note: { ...NOTE, content: FOLDED, updatedAt: '2026-10-01T12:02:00.000Z' }, versionId: 'v1', applied: 1 } } });

    renderEditor();
    const body = await screen.findByLabelText('Body');
    fireEvent.change(body, { target: { value: '## Widow spiders\n\n- Black widow\n- Red widow\n' } });

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Fold in new info' }));
    fireEvent.change(await screen.findByLabelText('New info'), { target: { value: 'brown widow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propose changes' }));

    await waitFor(() => expect(order).toEqual(['save', 'preview']));
    expect(updateNote.mock.calls[0][0].variables.content).toBe('## Widow spiders\n\n- Black widow\n- Red widow\n');

    fireEvent.click(await screen.findByRole('button', { name: 'Apply 1 change' }));
    await waitFor(() => expect(screen.getByLabelText('Body')).toHaveValue(FOLDED));
    // Clean: no autosave of the server's own text fires afterwards.
    await new Promise((r) => setTimeout(r, 2300));
    expect(updateNote).toHaveBeenCalledTimes(1);
  }, 15000);
});
