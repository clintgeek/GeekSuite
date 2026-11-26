import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, within, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createNoteTheme } from '../../theme/createAppTheme';

vi.setConfig({ testTimeout: 20000 });

/**
 * "Turn into a diagram", wired into the page (DOCS/HANDWRITING.md).
 *
 * Where the risk lives:
 *   - the ⋯ entry sits where Convert does, and is hidden where Convert is
 *     (Typed notes, an unreadable page, a note in Recently deleted);
 *   - Mermaid's own parse is the check: a refused answer is sent back ONCE
 *     with the error (previous + problem), never more;
 *   - Save makes a NEW Typed note ("Diagram: <title>", back-link, fenced
 *     mermaid, the handwritten note's tags) and never writes the original;
 *   - an older gateway that does not know the mutation says so, plainly.
 *
 * Apollo is mocked at the hook level and Mermaid itself is mocked (jsdom
 * cannot lay out SVG); real Mermaid runs in the harness (scenes 32a-32e).
 */

const createNote = vi.fn();
const updateNote = vi.fn();
const diagramSketch = vi.fn();
const transcribeSketch = vi.fn();
const notify = vi.fn();
const exportPng = vi.fn();
const note = { current: null };
const archive = { current: { archived: false, archivedAt: null, deletedAt: null } };
const parseMermaid = vi.fn();
const renderMermaid = vi.fn();

const SHAPE_SNAPSHOT = JSON.stringify({
  store: {
    'page:page': { id: 'page:page', typeName: 'page' },
    'shape:a': { id: 'shape:a', typeName: 'shape', type: 'draw' },
  },
  schema: {},
});
const EMPTY_SNAPSHOT = JSON.stringify({ store: { 'page:page': { id: 'page:page', typeName: 'page' } }, schema: {} });

const sketch = (content = SHAPE_SNAPSHOT, extra = {}) => ({
  id: 'sketch-1',
  title: 'Deploy flow',
  content,
  type: 'handwritten',
  tags: ['work', 'infra'],
  isLocked: false,
  isEncrypted: false,
  createdAt: '2026-11-20T12:00:00.000Z',
  updatedAt: '2026-11-20T12:00:00.000Z',
  ...extra,
});

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      if (name === 'GetNoteById') return { data: { note: note.current }, loading: false, error: undefined };
      if (name === 'NoteArchiveState') return { data: { note: { id: 'sketch-1', ...archive.current } }, loading: false };
      return { data: undefined, loading: false, error: undefined };
    },
    useMutation: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      const fn = {
        CreateNote: createNote,
        UpdateNote: updateNote,
        DiagramSketch: diagramSketch,
        TranscribeSketch: transcribeSketch,
      }[name] || vi.fn().mockResolvedValue({ data: {} });
      return [fn, { loading: false }];
    },
  };
});

vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useToast: () => ({ notify }) };
});

vi.mock('../../utils/mermaidLoader', async () => {
  const actual = await vi.importActual('../../utils/mermaidLoader');
  return { ...actual, parseMermaid: (...a) => parseMermaid(...a), renderMermaid: (...a) => renderMermaid(...a) };
});

vi.mock('../../components/notes/NoteTypeRouter', async () => {
  const actual = await vi.importActual('../../components/notes/NoteTypeRouter');
  const React = await vi.importActual('react');
  function FakeEditor({ sketchApiRef }) {
    React.useEffect(() => {
      if (!sketchApiRef) return undefined;
      sketchApiRef.current = { exportPng, hasShapes: () => true };
      return () => { sketchApiRef.current = null; };
    }, [sketchApiRef]);
    return <div data-testid="editor" />;
  }
  return { ...actual, default: FakeEditor };
});

import NoteEditorPage from '../../pages/NoteEditorPage';

const theme = createNoteTheme('light');

function renderEditor(path = '/notes/sketch-1/edit') {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/notes/:id/edit" element={<NoteEditorPage />} />
          <Route path="/notes/:id" element={<div>viewer</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

const GOOD = 'flowchart TD\n  n1["Build"] --> n2["Deploy"]';
const BAD = 'flowchart TD\n  n1["Build"] --> n2["Deploy"';
const answer = (mermaid) => ({ data: { diagramSketch: { mermaid, repaired: false, provenance: { source: 'model', model: 'openai/gpt-4.1-mini' } } } });

beforeEach(() => {
  vi.clearAllMocks();
  note.current = sketch();
  archive.current = { archived: false, archivedAt: null, deletedAt: null };
  exportPng.mockResolvedValue({
    blob: new Blob(['png'], { type: 'image/png' }),
    base64: 'iVBORw0KGgoAAAA',
    mediaType: 'image/png',
    width: 1200,
    height: 800,
  });
  diagramSketch.mockResolvedValue(answer(GOOD));
  parseMermaid.mockImplementation(async (src) => (src.trim().endsWith(']') ? { ok: true } : { ok: false, error: 'Parse error on line 2: expecting SQE' }));
  renderMermaid.mockImplementation(async (src) => {
    if (!src.trim().endsWith(']')) throw new Error('Parse error on line 2: expecting SQE');
    return '<svg data-test-svg="1"><text>Build</text></svg>';
  });
  createNote.mockResolvedValue({ data: { createNote: { id: 'new-1', title: 'x' } } });
  updateNote.mockResolvedValue({ data: { updateNote: { id: 'sketch-1', title: 'Deploy flow' } } });
});

async function openMenu() {
  const more = await screen.findByRole('button', { name: 'More note actions' });
  await act(async () => { more.click(); });
  return screen.findByRole('menu');
}

async function startDiagram() {
  const menu = await openMenu();
  const item = within(menu).getByRole('menuitem', { name: /turn into a diagram/i });
  await act(async () => { item.click(); });
}

describe('the ⋯ entry', () => {
  it('sits next to Convert on a handwritten note with ink', async () => {
    renderEditor();
    const menu = await openMenu();
    const items = within(menu).getAllByRole('menuitem').map((el) => el.textContent);
    const convert = items.findIndex((t) => /Convert handwriting to text/.test(t));
    expect(items[convert + 1]).toMatch(/Turn into a diagram/);
    expect(within(menu).getByRole('menuitem', { name: /turn into a diagram/i })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('is disabled on an empty page, like Convert', async () => {
    note.current = sketch(EMPTY_SNAPSHOT);
    renderEditor();
    const menu = await openMenu();
    const item = within(menu).getByRole('menuitem', { name: /turn into a diagram/i });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(within(item).getByText('Write something first')).toBeInTheDocument();
  });

  it('is not offered on a Typed note', async () => {
    note.current = sketch('# hi', { type: 'markdown' });
    renderEditor();
    const menu = await openMenu();
    expect(within(menu).queryByRole('menuitem', { name: /turn into a diagram/i })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /convert handwriting/i })).not.toBeInTheDocument();
  });

  it('is hidden on a page that cannot be read', async () => {
    note.current = sketch('{"store": trunc');
    renderEditor();
    const menu = await openMenu();
    expect(within(menu).queryByRole('menuitem', { name: /turn into a diagram/i })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /convert handwriting/i })).not.toBeInTheDocument();
  });

  it('is not there for a note in Recently deleted (no menu at all)', async () => {
    archive.current = { archived: false, archivedAt: null, deletedAt: '2026-11-21T12:00:00.000Z' };
    renderEditor();
    await screen.findByTestId('editor');
    expect(screen.queryByRole('button', { name: 'More note actions' })).not.toBeInTheDocument();
  });
});

describe('making the diagram', () => {
  it('sends the exported page and shows the drawn diagram with its source, writing nothing', async () => {
    renderEditor();
    await startDiagram();
    const source = await screen.findByRole('textbox', { name: 'Mermaid source' });
    expect(source).toHaveValue(GOOD);
    expect(diagramSketch).toHaveBeenCalledTimes(1);
    expect(diagramSketch).toHaveBeenCalledWith({ variables: { image: 'iVBORw0KGgoAAAA', mediaType: 'image/png', source: undefined } });
    await waitFor(() => expect(document.querySelector('[data-test-svg]')).not.toBeNull());
    expect(screen.getByRole('img', { name: 'Diagram: Build, Deploy' })).toBeInTheDocument();
    expect(screen.getByAltText('The handwritten page that was read')).toBeInTheDocument();
    expect(createNote).not.toHaveBeenCalled();
    expect(updateNote).not.toHaveBeenCalled();
  });

  it("a diagram Mermaid can't parse is sent back once with the error, and the repair is used", async () => {
    diagramSketch.mockResolvedValueOnce(answer(BAD)).mockResolvedValueOnce(answer(GOOD));
    renderEditor();
    await startDiagram();
    expect(await screen.findByRole('textbox', { name: 'Mermaid source' })).toHaveValue(GOOD);
    expect(diagramSketch).toHaveBeenCalledTimes(2);
    expect(diagramSketch.mock.calls[1][0].variables).toMatchObject({ previous: BAD, problem: 'Parse error on line 2: expecting SQE' });
    expect(screen.getByRole('button', { name: 'Save as new note' })).toBeEnabled();
  });

  it('a repair that still fails is shown with the error and the source, and can be saved anyway', async () => {
    diagramSketch.mockResolvedValue(answer(BAD));
    renderEditor();
    await startDiagram();
    expect(await screen.findByRole('textbox', { name: 'Mermaid source' })).toHaveValue(BAD);
    expect(diagramSketch).toHaveBeenCalledTimes(2); // once, and one repair: never a third
    expect(await screen.findByText(/Mermaid can't draw this yet: Parse error on line 2/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save as new note' })).not.toBeInTheDocument();
    await act(async () => { screen.getByRole('button', { name: 'Save anyway' }).click(); });
    expect(createNote).toHaveBeenCalledTimes(1);
    expect(createNote.mock.calls[0][0].variables.content).toContain(BAD);
  });

  it('a page that is not a diagram says so, with Try again', async () => {
    diagramSketch.mockRejectedValueOnce(Object.assign(new Error('x'), {
      graphQLErrors: [{ message: 'x', extensions: { code: 'AI_NOT_A_DIAGRAM', details: [{ message: "This page doesn't look like a diagram. Boxes and arrows work best." }] } }],
    }));
    renderEditor();
    await startDiagram();
    expect(await screen.findByText(/doesn't look like a diagram/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it("an older gateway that doesn't know the mutation gets one plain sentence", async () => {
    diagramSketch.mockRejectedValueOnce(Object.assign(new Error('Cannot query field'), {
      graphQLErrors: [{ message: 'Cannot query field "diagramSketch" on type "Mutation".', extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }],
    }));
    renderEditor();
    await startDiagram();
    expect(await screen.findByText("Diagrams aren't available yet. Try again in a minute.")).toBeInTheDocument();
    // The page is still a working editor.
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(updateNote).not.toHaveBeenCalled();
  });
});

describe('saving', () => {
  it('makes a NEW Typed note: title, back-link, fenced mermaid, the same tags; the original is untouched', async () => {
    renderEditor();
    await startDiagram();
    const source = await screen.findByRole('textbox', { name: 'Mermaid source' });
    const edited = `${GOOD}\n  n2 --> n3["Verify"]`;
    fireEvent.change(source, { target: { value: edited } });
    await act(async () => { screen.getByRole('button', { name: 'Save as new note' }).click(); });

    expect(createNote).toHaveBeenCalledTimes(1);
    expect(createNote.mock.calls[0][0].variables).toEqual({
      title: 'Diagram: Deploy flow',
      content: `From handwritten note: [Deploy flow](/notes/sketch-1)\n\n\`\`\`mermaid\n${edited}\n\`\`\`\n`,
      type: 'markdown',
      tags: ['work', 'infra'],
    });
    expect(updateNote).not.toHaveBeenCalled();
    expect(await screen.findByText('viewer')).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith('Saved as a new note. The handwriting is unchanged.', { tone: 'success' });
  });
});
