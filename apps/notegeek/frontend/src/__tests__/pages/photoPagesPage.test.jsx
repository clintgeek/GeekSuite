import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createTLStore, defaultShapeUtils, defaultBindingUtils } from '@tldraw/tldraw';
import { createNoteTheme } from '../../theme/createAppTheme';

vi.setConfig({ testTimeout: 30000 });

/**
 * "Photo of a page", wired into its page (DOCS/HANDWRITING.md §3).
 *
 * Where the risk lives:
 *   - at most 8 pages; rotate, reorder and remove each page;
 *   - the size guard says "too big" before anything is read or created;
 *   - one transcribeSketch call per page, `source: 'photo'`, JPEG, strictly
 *     in page order, with progress, and a retry that carries on from the
 *     failed page;
 *   - the review shows every page and one transcript with page markers;
 *   - the result is two NEW notes — a photo sketch note first (a REAL tldraw
 *     snapshot: loaded back here through tldraw's own store) and a Markdown
 *     note whose first line links to it. Nothing is ever updated.
 *
 * Apollo is mocked at the hook level. Image preparation is a fake (its own
 * arithmetic is photoPages.test.js); the snapshot builder is the real one.
 */

const createNote = vi.fn();
const updateNote = vi.fn();
const composeNote = vi.fn();
const transcribeSketch = vi.fn();
const notify = vi.fn();

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: () => ({ data: undefined, loading: false, error: undefined }),
    useMutation: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      const fn = {
        CreateNote: createNote,
        UpdateNote: updateNote,
        ComposeNote: composeNote,
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

// The tag picker loads the tag list from the store; not what is tested here.
vi.mock('../../components/TagSelector', () => ({
  default: ({ selectedTags, onChange }) => (
    <button type="button" onClick={() => onChange([...selectedTags, 'house'])}>add tag</button>
  ),
}));

import PhotoPagesPage from '../../pages/PhotoPagesPage';

const theme = createNoteTheme('light');

// A real 1x1 JPEG: tldraw's validator only needs a real data: URL.
const JPEG_1PX = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

const prepared = (bytes = 450_000, width = 1500, height = 2000) => ({
  blob: new Blob(['x'], { type: 'image/jpeg' }),
  bytes,
  width,
  height,
  base64: JPEG_1PX,
  dataUrl: `data:image/jpeg;base64,${JPEG_1PX}`,
});

let prepare;

function renderPage(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={['/notes/photo']}>
        <Routes>
          <Route path="/notes/photo" element={<PhotoPagesPage prepare={prepare} {...props} />} />
          <Route path="/notes/:id" element={<div>opened note</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

const photo = (name) => new File(['jpeg'], name, { type: 'image/jpeg' });
const filesInput = () => document.querySelector('input[data-photo-input="files"]');
const add = (...names) => fireEvent.change(filesInput(), { target: { files: names.map(photo) } });

async function addReady(...names) {
  add(...names);
  const label = names.length > 1 ? new RegExp(`read ${names.length} pages`, 'i') : /read the page/i;
  await waitFor(() => expect(screen.getByRole('button', { name: label })).toBeEnabled());
}

const reading = (text) => ({ data: { transcribeSketch: { text, provenance: { source: 'model', model: 'openai/gpt-4.1-mini' } } } });

let created;
beforeEach(() => {
  vi.clearAllMocks();
  created = 0;
  prepare = vi.fn(async () => prepared());
  URL.createObjectURL = vi.fn(() => `blob:page-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
  transcribeSketch.mockImplementation(async ({ variables }) => reading(`text of ${variables.image.length}`));
  createNote.mockImplementation(async ({ variables }) => {
    created += 1;
    return { data: { createNote: { id: variables.type === 'handwritten' ? `photo-${created}` : `md-${created}`, ...variables } } };
  });
  composeNote.mockResolvedValue({
    data: {
      composeNote: {
        markdown: '# Kitchen plan\n\n- tiles\n- lights\n',
        stats: { inputChars: 40, fragments: 1, chunks: 1, chunksFailed: 0, strategy: 'single', truncated: false, degenerate: false },
        provenance: { reason: null, model: 'openai/gpt-4.1-mini' },
      },
    },
  });
});

afterEach(() => {
  delete URL.createObjectURL;
  delete URL.revokeObjectURL;
});

describe('the page tray', () => {
  it('each photo becomes a page, prepared unturned, with the count and size meter', async () => {
    renderPage();
    await addReady('one.jpg', 'two.jpg');
    const rows = within(screen.getByRole('region', { name: 'Pages' })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(prepare.mock.calls.map(([f, r]) => [f.name, r])).toEqual([['one.jpg', 0], ['two.jpg', 0]]);
    expect(screen.getByText(/2 of 8 pages · 1\.2 of 5\.0 MB/)).toBeInTheDocument();
    expect(screen.getAllByText('1500×2000 · 450 KB')).toHaveLength(2);
  });

  it('holds at most 8 pages, and says what it left out', async () => {
    renderPage();
    add(...Array.from({ length: 10 }, (_, i) => `p${i + 1}.jpg`));
    await waitFor(() => expect(screen.getByRole('button', { name: /read 8 pages/i })).toBeEnabled());
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
    expect(prepare).toHaveBeenCalledTimes(8);
    expect(screen.getByText(/up to 8 pages, so the last 2 photos were not added/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add another page/i })).toBeDisabled();
  });

  it('rotate re-prepares the page from the original photo, a quarter turn at a time', async () => {
    renderPage();
    await addReady('one.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Rotate page 1' }));
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole('button', { name: 'Rotate page 1' }));
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(3));
    expect(prepare.mock.calls.map(([f, r]) => [f.name, r])).toEqual([['one.jpg', 0], ['one.jpg', 90], ['one.jpg', 180]]);
  });

  it('remove drops the page; a photo that cannot be decoded says so on its row', async () => {
    prepare = vi.fn(async (file) => {
      if (file.name.endsWith('.heic')) throw new Error("This browser can't open HEIC photos (IMG.heic).");
      return prepared();
    });
    renderPage();
    add('one.jpg', 'IMG.heic');
    expect(await screen.findByRole('alert')).toHaveTextContent("can't open HEIC photos");
    // A failed page blocks reading until it is removed.
    expect(screen.getByRole('button', { name: /read 2 pages/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove page 2' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /read the page/i })).toBeEnabled());
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('the size guard refuses a set over the 5 MB snapshot ceiling before anything is read or created', async () => {
    prepare = vi.fn(async () => prepared(1_000_000));
    renderPage();
    await waitFor(() => expect(filesInput()).toBeTruthy());
    add('a.jpg', 'b.jpg', 'c.jpg', 'd.jpg');
    expect(await screen.findByText(/too big for one note \(5\.3 MB; the limit is 5\.0 MB\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /read 4 pages/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /read 4 pages/i }));
    expect(transcribeSketch).not.toHaveBeenCalled();
    expect(createNote).not.toHaveBeenCalled();
    // Removing a page brings it under.
    fireEvent.click(screen.getByRole('button', { name: 'Remove page 4' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /read 3 pages/i })).toBeEnabled());
  });
});

describe('two copies of each page (Chef, 2026-09-27)', () => {
  // The model reads the full 2000px copy; the note keeps the smaller one, so a
  // full set of camera pages fits under the 5 MB ceiling.
  const twoCopies = () => ({ ...prepared(1_000_000, 1500, 2000), keep: { ...prepared(300_000, 1200, 1600), dataUrl: `data:image/jpeg;base64,${JPEG_1PX}` } }); // the copies are told apart by size

  it('sizes the note by the KEPT copy, so pages the full size would refuse still fit', async () => {
    prepare = vi.fn(async () => twoCopies());
    renderPage();
    await waitFor(() => expect(filesInput()).toBeTruthy());
    add('a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg');
    // 6 x 1 MB would be refused; 6 x 0.3 MB kept copies fit.
    await waitFor(() => expect(screen.getByRole('button', { name: /read 6 pages/i })).toBeEnabled());
    expect(screen.queryByText(/too big for one note/)).not.toBeInTheDocument();
  });

  it('stores the kept copy in the photo note, at its own size', async () => {
    prepare = vi.fn(async () => twoCopies());
    transcribeSketch.mockResolvedValueOnce(reading('milk'));
    renderPage();
    await addReady('one.jpg');
    fireEvent.click(screen.getByRole('button', { name: /read the page/i }));
    await screen.findByRole('textbox', { name: 'Transcript' });
    fireEvent.click(screen.getByRole('button', { name: 'Keep as plain text' }));
    await screen.findByText('opened note');
    const photoVars = createNote.mock.calls.map(([{ variables }]) => variables).find((v) => v.type === 'handwritten');
    const store = createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils });
    store.loadStoreSnapshot(JSON.parse(photoVars.content));
    const asset = store.allRecords().find((r) => r.typeName === 'asset');
    expect(asset.props.w).toBe(1200);
    expect(asset.props.h).toBe(1600);
  });
});

describe('reading the pages', () => {
  it('one call per page, source photo, JPEG, strictly in page order, with progress', async () => {
    const pending = [];
    transcribeSketch.mockImplementation(({ variables }) => new Promise((resolve) => pending.push({ variables, resolve })));
    let n = 0;
    prepare = vi.fn(async () => ({ ...prepared(), base64: `${JPEG_1PX}${'A'.repeat(4 * (n += 1))}` }));
    renderPage();
    await addReady('one.jpg', 'two.jpg', 'three.jpg');
    // Reorder: page 3 to the top. The calls follow the tray, not the picking.
    fireEvent.click(screen.getByRole('button', { name: 'Move page 3 up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move page 2 up' }));
    fireEvent.click(screen.getByRole('button', { name: /read 3 pages/i }));

    await waitFor(() => expect(pending).toHaveLength(1));
    expect(screen.getByText('Reading page 1 of 3…')).toBeInTheDocument();
    // The next page is not asked for until this one has answered.
    expect(transcribeSketch).toHaveBeenCalledTimes(1);
    pending[0].resolve(reading('third photo'));
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(screen.getByText('Reading page 2 of 3…')).toBeInTheDocument();
    pending[1].resolve(reading('first photo'));
    await waitFor(() => expect(pending).toHaveLength(3));
    pending[2].resolve(reading('second photo'));

    const box = await screen.findByRole('textbox', { name: 'Transcript' });
    const sent = pending.map((p) => p.variables);
    expect(sent.every((v) => v.source === 'photo' && v.mediaType === 'image/jpeg')).toBe(true);
    // Picked 1,2,3 (base64 grows by page); the tray read 3,1,2.
    expect(sent.map((v) => v.image.length - JPEG_1PX.length)).toEqual([12, 4, 8]);
    expect(box).toHaveValue('--- page 1 ---\nthird photo\n\n--- page 2 ---\nfirst photo\n\n--- page 3 ---\nsecond photo');
    const strip = screen.getByRole('group', { name: 'The pages that were read' });
    expect(within(strip).getAllByRole('img').map((i) => i.getAttribute('alt'))).toEqual([
      'Page 1 as photographed', 'Page 2 as photographed', 'Page 3 as photographed',
    ]);
  });

  it('a failure stops the run, keeps what was read, and Try again carries on from that page', async () => {
    let n = 0;
    prepare = vi.fn(async () => ({ ...prepared(), base64: `${JPEG_1PX}${'A'.repeat(4 * (n += 1))}` }));
    transcribeSketch
      .mockResolvedValueOnce(reading('page one'))
      .mockRejectedValueOnce(Object.assign(new Error('cap'), {
        graphQLErrors: [{ message: 'cap', extensions: { details: [{ message: "That is today's 40 handwriting conversions used." }] } }],
      }))
      .mockResolvedValueOnce(reading('page two'));
    renderPage();
    await addReady('one.jpg', 'two.jpg');
    fireEvent.click(screen.getByRole('button', { name: /read 2 pages/i }));
    expect(await screen.findByText(/Page 2 of 2: That is today's 40 handwriting conversions used\. Pages 1–1 are read/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    const box = await screen.findByRole('textbox', { name: 'Transcript' });
    expect(transcribeSketch).toHaveBeenCalledTimes(3);
    // Page 1 was not read twice.
    expect(transcribeSketch.mock.calls.map(([{ variables }]) => variables.image.length - JPEG_1PX.length)).toEqual([4, 8, 8]);
    expect(box).toHaveValue('--- page 1 ---\npage one\n\n--- page 2 ---\npage two');
  });

  it('Back to pages keeps the corrected transcript when the pages have not changed', async () => {
    renderPage();
    await addReady('one.jpg');
    fireEvent.click(screen.getByRole('button', { name: /read the page/i }));
    const box = await screen.findByRole('textbox', { name: 'Transcript' });
    fireEvent.change(box, { target: { value: 'corrected' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back to pages' }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Transcript' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /read the page/i }));
    expect(await screen.findByRole('textbox', { name: 'Transcript' })).toHaveValue('corrected');
    expect(transcribeSketch).toHaveBeenCalledTimes(1);
  });
});

describe('the result: two new notes, photos first, nothing replaced', () => {
  it('Keep as plain text: a photo sketch note (a real tldraw snapshot), then a Markdown note linking to it', async () => {
    transcribeSketch.mockResolvedValueOnce(reading('milk\neggs')).mockResolvedValueOnce(reading('bread'));
    renderPage();
    await addReady('one.jpg', 'two.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'add tag' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Shopping' } });
    fireEvent.click(screen.getByRole('button', { name: /read 2 pages/i }));
    await screen.findByRole('textbox', { name: 'Transcript' });
    fireEvent.click(screen.getByRole('button', { name: 'Keep as plain text' }));

    await screen.findByText('opened note');
    expect(createNote).toHaveBeenCalledTimes(2);
    expect(updateNote).not.toHaveBeenCalled();
    const [photoVars, mdVars] = createNote.mock.calls.map(([{ variables }]) => variables);

    expect(photoVars).toMatchObject({ type: 'handwritten', title: 'Shopping', tags: ['house'] });
    const store = createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils });
    store.loadStoreSnapshot(JSON.parse(photoVars.content));
    const images = store.allRecords().filter((r) => r.typeName === 'shape' && r.type === 'image');
    expect(images).toHaveLength(2);
    expect(images.every((s) => s.isLocked)).toBe(true);

    expect(mdVars.type).toBe('markdown');
    expect(mdVars.tags).toEqual(['house']);
    expect(mdVars.title).toBe('From photos: Shopping');
    expect(mdVars.content.split('\n')[0]).toBe('From photos: [Shopping](/notes/photo-1)');
    expect(mdVars.content).toContain('--- page 1 ---  \nmilk  \neggs\n\n--- page 2 ---  \nbread');
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/photos as a sketch note, and the text as a new note/), { tone: 'success' });
  });

  it('Compose it: no Replace, Back to transcript, and the composed heading titles the new note', async () => {
    renderPage();
    await addReady('one.jpg');
    fireEvent.click(screen.getByRole('button', { name: /read the page/i }));
    const box = await screen.findByRole('textbox', { name: 'Transcript' });
    fireEvent.change(box, { target: { value: 'tiles\nlights' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compose it' }));
    await screen.findByRole('button', { name: /save as a new note/i });
    expect(composeNote).toHaveBeenCalledWith({ variables: { content: 'tiles\nlights' } });
    expect(screen.queryByRole('button', { name: /replace this note/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to transcript' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save as a new note/i }));
    await screen.findByText('opened note');
    const [photoVars, mdVars] = createNote.mock.calls.map(([{ variables }]) => variables);
    expect(photoVars.type).toBe('handwritten');
    expect(photoVars.title).toMatch(/^Photos · \d{1,2} [A-Z][a-z]{2} \d{4}$/);
    expect(mdVars.title).toBe('Kitchen plan');
    expect(mdVars.content.startsWith(`From photos: [${photoVars.title}](/notes/photo-1)\n\n# Kitchen plan`)).toBe(true);
    expect(updateNote).not.toHaveBeenCalled();
  });

  it('when only the text note fails, a retry reuses the photo note instead of making a second', async () => {
    createNote
      .mockImplementationOnce(async ({ variables }) => ({ data: { createNote: { id: 'photo-9', ...variables } } }))
      .mockRejectedValueOnce(new Error('network down'))
      .mockImplementationOnce(async ({ variables }) => ({ data: { createNote: { id: 'md-9', ...variables } } }));
    renderPage();
    await addReady('one.jpg');
    fireEvent.click(screen.getByRole('button', { name: /read the page/i }));
    await screen.findByRole('textbox', { name: 'Transcript' });
    fireEvent.click(screen.getByRole('button', { name: 'Keep as plain text' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/photos are saved as a sketch note, but the text note wasn't/), { tone: 'error' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep as plain text' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Keep as plain text' }));
    await screen.findByText('opened note');
    const types = createNote.mock.calls.map(([{ variables }]) => variables.type);
    expect(types).toEqual(['handwritten', 'markdown', 'markdown']);
    expect(createNote.mock.calls[2][0].variables.content).toMatch(/\(\/notes\/photo-9\)/);
  });

  it('refuses to create anything if the built snapshot is over the ceiling', async () => {
    const huge = 'x'.repeat(5_000_001);
    renderPage({ loadSnapshotBuilder: async () => ({ buildPhotoSketchSnapshot: () => huge }) });
    await addReady('one.jpg');
    fireEvent.click(screen.getByRole('button', { name: /read the page/i }));
    await screen.findByRole('textbox', { name: 'Transcript' });
    fireEvent.click(screen.getByRole('button', { name: 'Keep as plain text' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/too big for one note/), { tone: 'error' }));
    expect(createNote).not.toHaveBeenCalled();
  });
});
