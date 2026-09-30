import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createNoteTheme } from '../../theme/createAppTheme';

/**
 * Inline #tags, end to end through the real editor page: type `#house/garage`
 * in the body, save, and the save carries the tag and the chips show it.
 * Mutations are mocked at the hook level so the payload can be read.
 */

const createNote = vi.fn();
const updateNote = vi.fn();

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: () => ({ data: undefined, loading: false, error: undefined }),
    useMutation: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      return [name === 'CreateNote' ? createNote : updateNote, { loading: false }];
    },
  };
});

vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useToast: () => ({ notify: vi.fn() }) };
});

// A plain textarea stands in for the five editors.
vi.mock('../../components/notes/NoteTypeRouter', async () => {
  const actual = await vi.importActual('../../components/notes/NoteTypeRouter');
  return {
    ...actual,
    default: ({ content, onChange }) => (
      <textarea aria-label="body" value={content} onChange={(e) => onChange(e.target.value)} />
    ),
  };
});

// The chips: rendered as text, with a remove button per chip.
vi.mock('../../components/TagSelector', () => ({
  default: ({ selectedTags, onChange }) => (
    <div data-testid="chips">
      {selectedTags.map((t) => (
        <button key={t} type="button" onClick={() => onChange(selectedTags.filter((x) => x !== t))}>
          remove {t}
        </button>
      ))}
      <span data-testid="chip-list">{selectedTags.join(',')}</span>
    </div>
  ),
}));

import NoteEditorPage from '../../pages/NoteEditorPage';

const theme = createNoteTheme('light');

function renderEditor(route) {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/notes/new" element={<NoteEditorPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

const pressSave = () =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));

async function typeBody(text) {
  const body = await screen.findByLabelText('body');
  await act(async () => { fireEvent.change(body, { target: { value: text } }); });
}

async function save() {
  await act(async () => { pressSave(); await Promise.resolve(); });
}

const lastSavedTags = () => {
  const calls = [...createNote.mock.calls, ...updateNote.mock.calls];
  return calls[calls.length - 1][0].variables.tags;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  createNote.mockResolvedValue({ data: { createNote: { id: 'n1', title: 'T' } } });
  updateNote.mockResolvedValue({ data: { updateNote: { id: 'n1', title: 'T' } } });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('NoteEditorPage — inline #tags', () => {
  it('a markdown note saves the #tags in its body and shows them as chips', async () => {
    renderEditor('/notes/new?type=markdown');
    await typeBody('# Heading\nBuy nails #house/garage and paint #fff `#code`');
    await save();

    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
    expect(lastSavedTags()).toEqual(['house/garage']);
    expect(screen.getByTestId('chip-list')).toHaveTextContent('house/garage');
  });

  it('a rich-text note reads its HTML body too', async () => {
    renderEditor('/notes/new?type=text');
    await typeBody('<p>call about #roof</p>');
    await save();
    await waitFor(() => expect(createNote).toHaveBeenCalled());
    expect(lastSavedTags()).toEqual(['roof']);
  });

  it('a code note never does', async () => {
    renderEditor('/notes/new?type=code');
    await typeBody('// #house');
    await save();
    await waitFor(() => expect(createNote).toHaveBeenCalled());
    expect(lastSavedTags()).toEqual([]);
  });

  it('is additive: deleting the text keeps the tag; removing the chip keeps it off', async () => {
    renderEditor('/notes/new?type=markdown');
    await typeBody('about #garden');
    await save();
    await waitFor(() => expect(createNote).toHaveBeenCalled());

    await typeBody('about nothing');
    await save();
    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1));
    expect(lastSavedTags()).toEqual(['garden']);

    await typeBody('about #garden again');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'remove garden' })); });
    await save();
    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(2));
    expect(lastSavedTags()).toEqual([]);
  });

  it('a word autosaved mid-typing is taken back when it grows into a longer tag', async () => {
    renderEditor('/notes/new?type=markdown');
    await typeBody('fix #hou');
    await save();
    await waitFor(() => expect(createNote).toHaveBeenCalled());
    expect(lastSavedTags()).toEqual(['hou']);

    await typeBody('fix #house/garage');
    await save();
    await waitFor(() => expect(updateNote).toHaveBeenCalled());
    expect(lastSavedTags()).toEqual(['house/garage']);
  });
});
