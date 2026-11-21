import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { createNoteTheme } from '../../theme/createAppTheme';
import { __resetDraftsForTests, getDraft, draftKeyFor } from '../../utils/draftStore';
import { buildNoteFromTemplate, templateDay } from '../../utils/noteTemplates';

/**
 * DOCS/TEMPLATES_SPEC.md N2 and N3 — a new note from a template.
 *
 *   N2  `/notes/new?template=<id>` opens the ORDINARY editor with the
 *       template's title, tags and body, as a Markdown note.
 *   N3  It behaves like a new note nobody has typed in: opening it and
 *       leaving — by Back, by another page, by the app being hidden or
 *       killed — creates no note and writes no device draft, so nothing
 *       later offers to "Restore unsaved changes". The first edit (or an
 *       explicit save) saves it like any new note.
 *
 * Modelled on noteEditorDurability.test.jsx: the real page and route, Apollo
 * mocked at the hook level so mutations can be counted, the real draft store
 * (memory fallback) with `saveDraft` spied.
 */

const createNote = vi.fn();
const updateNote = vi.fn();
const notify = vi.fn();
const saveDraftSpy = vi.fn();

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: () => ({ data: undefined, loading: false, error: undefined }),
    useMutation: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      const fn = { CreateNote: createNote, UpdateNote: updateNote }[name] || vi.fn().mockResolvedValue({ data: {} });
      return [fn, { loading: false }];
    },
  };
});

vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useToast: () => ({ notify, dismiss: vi.fn() }) };
});

vi.mock('../../utils/draftStore', async () => {
  const actual = await vi.importActual('../../utils/draftStore');
  return {
    ...actual,
    saveDraft: (...args) => { saveDraftSpy(...args); return actual.saveDraft(...args); },
  };
});

// A plain textarea stands in for the five editors; it reports the type it was given.
vi.mock('../../components/notes/NoteTypeRouter', async () => {
  const actual = await vi.importActual('../../components/notes/NoteTypeRouter');
  return {
    ...actual,
    default: ({ content, onChange, type }) => (
      <textarea aria-label="Body" data-note-type={type} value={content} onChange={(e) => onChange(e.target.value)} />
    ),
  };
});

import NoteEditorRoute from '../../pages/NoteEditorRoute';

const theme = createNoteTheme('light');

function Where() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div data-testid="where">{location.pathname + location.search}</div>
      <button type="button" onClick={() => navigate('/notes')}>Go to notes</button>
      <button type="button" onClick={() => navigate(-1)}>History back</button>
    </>
  );
}

function renderAt(...entries) {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="/notes/new" element={<NoteEditorRoute />} />
          <Route path="/notes/:id/edit" element={<NoteEditorRoute />} />
          <Route path="/notes" element={<div>notes list</div>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </ThemeProvider>
  );
}

const body = () => screen.getByLabelText('Body');
const titleField = () => screen.getByPlaceholderText(/untitled/i);
const wait = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Nothing reached the server and nothing was kept on the device. */
async function expectNothingSaved() {
  expect(createNote).not.toHaveBeenCalled();
  expect(updateNote).not.toHaveBeenCalled();
  expect(saveDraftSpy).not.toHaveBeenCalled();
  // MemoryRouter's first entry has the history key "default".
  expect(await getDraft(draftKeyFor(null, 'default'))).toBeNull();
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetDraftsForTests();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  createNote.mockImplementation(({ variables }) => Promise.resolve({
    data: { createNote: { id: 'new-1', title: variables.title, tags: variables.tags, updatedAt: '2026-11-20T09:00:00.000Z' } },
  }));
  updateNote.mockImplementation(({ variables }) => Promise.resolve({
    data: { updateNote: { id: variables.id, title: variables.title, tags: variables.tags, updatedAt: '2026-11-20T09:00:01.000Z' } },
  }));
});
afterEach(() => {
  setVisibility('visible');
  vi.useRealTimers();
});

describe('N2 — a template opens the ordinary editor, filled in', () => {
  it('shows the template\'s title, tags and body, as a Markdown note', async () => {
    renderAt('/notes/new?template=meeting');
    const seed = buildNoteFromTemplate('meeting', new Date());
    expect(titleField().value).toBe(`Meeting — ${templateDay(new Date())}`);
    expect(body().value).toBe(seed.content);
    expect(body().value).toContain('## Action items');
    expect(body().dataset.noteType).toBe('markdown');
    // The tag chip (the print copy lists it too).
    expect(screen.getAllByText('meeting').length).toBeGreaterThan(0);
  });

  it('is Markdown whatever ?type= says: a template is a typed page', () => {
    renderAt('/notes/new?template=recipe&type=handwritten');
    expect(body().dataset.noteType).toBe('markdown');
    expect(body().value).toContain('## Ingredients');
  });

  it('an unknown id falls back to a plain new note', async () => {
    renderAt('/notes/new?template=not-a-template');
    expect(titleField().value).toBe('');
    expect(body().value).toBe('');
    expect(body().dataset.noteType).toBe('markdown');
    await wait(3000);
    await expectNothingSaved();
  });

  it('an explicit ?title= (an unresolved [[link]]) still names the note', () => {
    renderAt('/notes/new?template=meeting&title=Roof%20quote%20call');
    expect(titleField().value).toBe('Roof quote call');
    expect(body().value).toContain('## Agenda');
  });
});

describe('N3 — opening a template and leaving creates nothing', () => {
  it('sitting on it saves nothing: no create, no device draft, and it still reads "draft"', async () => {
    renderAt('/notes/new?template=meeting');
    expect(body().value).toContain('## Agenda');
    // Well past the 500 ms draft mirror and the 2 s autosave.
    await wait(6000);
    await expectNothingSaved();
    expect(screen.getByRole('status')).toHaveTextContent(/^draft$/);
  });

  it('the app being hidden, or the page going away, saves nothing', async () => {
    renderAt('/notes/new?template=weekly-review');
    await act(async () => { setVisibility('hidden'); });
    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    await wait(3000);
    await expectNothingSaved();
  });

  it('the editor\'s own Back saves nothing', async () => {
    renderAt('/notes', '/notes/new?template=packing-list');
    expect(body().value).toContain('## Documents');
    fireEvent.click(screen.getByRole('button', { name: /^back/i }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/notes'));
    await wait(3000);
    expect(createNote).not.toHaveBeenCalled();
    expect(saveDraftSpy).not.toHaveBeenCalled();
  });

  it('navigating elsewhere (the unmount flush) saves nothing', async () => {
    renderAt('/notes/new?template=decision-record');
    expect(body().value).toContain('## Options considered');
    fireEvent.click(screen.getByRole('button', { name: 'Go to notes' }));
    await screen.findByText('notes list');
    await wait(3000);
    await expectNothingSaved();
  });

  it('coming back to the same history entry offers no draft to restore', async () => {
    renderAt('/notes/new?template=meeting');
    await wait(1000);
    fireEvent.click(screen.getByRole('button', { name: 'Go to notes' }));
    await screen.findByText('notes list');
    fireEvent.click(screen.getByRole('button', { name: 'History back' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/notes/new?template=meeting'));
    await wait(1000);
    expect(screen.queryByRole('button', { name: /restore unsaved changes/i })).toBeNull();
    // The template is simply there again, still unsaved.
    expect(body().value).toContain('## Agenda');
    await expectNothingSaved();
  });

  it('a second template opened from the first starts clean too', async () => {
    renderAt('/notes/new?template=meeting', '/notes/new?template=recipe');
    expect(body().value).toContain('## Ingredients');
    expect(body().value).not.toContain('## Agenda');
    await wait(3000);
    expect(createNote).not.toHaveBeenCalled();
    expect(saveDraftSpy).not.toHaveBeenCalled();
  });
});

describe('N3 — from the first edit it is an ordinary new note', () => {
  it('typing in the body keeps a device copy, then creates the note with the template\'s title and tags', async () => {
    renderAt('/notes/new?template=meeting');
    const seeded = body().value;
    fireEvent.change(body(), { target: { value: `${seeded}- [ ] Send the minutes — me, Friday\n` } });
    await wait(600);
    expect(saveDraftSpy).toHaveBeenCalled();
    expect((await getDraft(draftKeyFor(null, 'default')))?.content).toContain('Send the minutes');
    await wait(2000);
    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
    expect(createNote.mock.calls[0][0].variables).toEqual({
      title: `Meeting — ${templateDay(new Date())}`,
      content: `${seeded}- [ ] Send the minutes — me, Friday\n`,
      tags: ['meeting'],
      type: 'markdown',
    });
    // The address becomes the note's (1.20), and the new-note draft is gone.
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/notes/new-1/edit'));
    await waitFor(async () => expect(await getDraft(draftKeyFor(null, 'default'))).toBeNull());
  });

  it('editing only the title saves the whole template under that title', async () => {
    renderAt('/notes/new?template=project-brief');
    fireEvent.change(titleField(), { target: { value: 'Project brief — new backup box' } });
    await wait(2100);
    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
    const sent = createNote.mock.calls[0][0].variables;
    expect(sent.title).toBe('Project brief — new backup box');
    expect(sent.content).toContain('## Done when');
    expect(sent.tags).toEqual(['project']);
  });

  it('Ctrl+S saves it as it stands: an explicit save is a save', async () => {
    renderAt('/notes/new?template=packing-list');
    await wait(100);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    });
    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
    expect(createNote.mock.calls[0][0].variables.tags).toEqual(['packing']);
    expect(createNote.mock.calls[0][0].variables.type).toBe('markdown');
  });

  it('leaving right after an edit still saves it (the unmount flush is untouched)', async () => {
    renderAt('/notes/new?template=recipe');
    fireEvent.change(titleField(), { target: { value: 'Recipe — chili' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go to notes' }));
    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
    expect(createNote.mock.calls[0][0].variables.title).toBe('Recipe — chili');
  });
});
