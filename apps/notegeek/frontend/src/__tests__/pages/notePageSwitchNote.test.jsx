import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { Routes, Route, Link, useParams } from 'react-router-dom';
import { renderWithProviders } from '../testUtils';

/**
 * Tablet wave 2026-11-16: two panes put the list beside the note, so going
 * straight from one note to another (/notes/a -> /notes/b) is now the common
 * path, not only a [[link]] away. A sketch or mind map opens in the editor
 * on /notes/:id, and the editor's unsaved-edit protection is its unmount
 * flush (save + device draft). It must run for note a when b opens — so b
 * has to be a NEW editor, not the same one re-seeded.
 */

const { state, log } = vi.hoisted(() => ({ state: { notes: {} }, log: [] }));

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: (_q, opts) => ({ refetch: vi.fn(), data: { note: state.notes[opts?.variables?.id] }, loading: false }),
  };
});
vi.mock('../../store/authStore', () => {
  const store = { isAuthenticated: true };
  const useStore = (selector) => (selector ? selector(store) : store);
  useStore.getState = () => store;
  return { default: useStore };
});
vi.mock('../../components/NoteViewer', () => ({ default: () => <div>the viewer</div> }));
// The editor, reduced to its lifecycle: which note it mounted for, and the
// unmount flush (NoteEditorPage's `useEffect(() => () => flush…, [])`).
vi.mock('../../pages/NoteEditorPage', () => ({
  default: function EditorStub() {
    const { id } = useParams();
    useEffect(() => {
      log.push(`mount ${id}`);
      return () => log.push(`flush ${id}`);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only, like the real flush
    }, []);
    return <div>editor for {id}</div>;
  },
}));

import NotePage from '../../pages/NotePage';

const sketch = (id) => ({ id, title: id, content: '{}', type: 'handwritten', tags: [], updatedAt: '2026-11-01T00:00:00.000Z' });

beforeEach(() => {
  log.length = 0;
  state.notes = { a: sketch('a'), b: sketch('b') };
});

function renderAt(path) {
  return renderWithProviders(
    <>
      <Link to="/notes/b">open b</Link>
      <Routes><Route path="/notes/:id" element={<NotePage />} /></Routes>
    </>,
    { route: path },
  );
}

describe('NotePage — switching straight to another note', () => {
  it('unmounts note a\'s editor (its flush runs) and mounts a fresh one for b', async () => {
    renderAt('/notes/a');
    expect(screen.getByText('editor for a')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('link', { name: 'open b' })));
    expect(screen.getByText('editor for b')).toBeInTheDocument();
    expect(log).toEqual(['mount a', 'flush a', 'mount b']);
  });
});
