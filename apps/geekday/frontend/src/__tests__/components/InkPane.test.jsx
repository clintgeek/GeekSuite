// A day page whose stored sketch cannot be drawn must never be written over
// (SUITE_TODO §1, GeekDay: "a corrupt page snapshot opens as a blank page").
// The real store, a fake gateway, and a stand-in canvas that fails on a bad body.
import React, { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import InkPane, { UNREADABLE_TEXT, UNREADABLE_TITLE } from '../../components/InkPane.jsx';
import { DayNoteStore } from '../../store/dayNoteStore.js';
import { renderDay } from '../helpers.jsx';

vi.mock('../../ink/index.js', () => ({
  InkCanvas: function FakeCanvas({ content, onChange, onLoadError }) {
    useEffect(() => {
      if (content && !content.startsWith('{"store"')) onLoadError?.(content, new Error('Not a tldraw snapshot'));
    }, [content, onLoadError]);
    return (
      <button type="button" data-testid="fake-stroke" onClick={() => onChange?.('{"store":{"shape:new":{}}}')}>
        stroke
      </button>
    );
  },
}));

const BROKEN = '{not json'; // what a mangled body looks like to the canvas
const GOOD = '{"store":{"shape:old":{}}}';
const note = (content) => ({ id: 'n9', content, updatedAt: 'u9', createdAt: '2026-11-20T08:00:00Z' });

function setup(finds) {
  const calls = [];
  const client = {
    query: () => {
      calls.push('find');
      const next = finds.shift();
      return next instanceof Error ? Promise.reject(next) : Promise.resolve({ data: { notes: next } });
    },
    mutate: ({ variables }) => {
      calls.push({ save: variables });
      return Promise.resolve({ data: { updateNote: { id: variables.id, updatedAt: 'u10' }, createNote: { id: 'n1', updatedAt: 'u1' } } });
    },
  };
  const store = new DayNoteStore({ client, dayKey: '2026-11-20', setTimer: () => null, clearTimer: () => {} });
  function Pane() {
    const state = React.useSyncExternalStore(store.subscribe, store.getState);
    return <InkPane dayLabel="Friday" state={state} store={store} />;
  }
  renderDay(<Pane />);
  return { store, calls, saves: () => calls.filter((c) => c !== 'find') };
}

describe('InkPane: a page that cannot be loaded', () => {
  it('shows a load error, not a blank page, and offers Try again and NoteGeek', async () => {
    const { store } = setup([[note(BROKEN)]]);
    await act(() => store.load());
    expect(await screen.findByTestId('ink-unreadable')).toBeInTheDocument();
    expect(screen.getByText(UNREADABLE_TITLE)).toBeInTheDocument();
    expect(screen.getByText(UNREADABLE_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByTestId('ink-unreadable-notegeek')).toHaveAttribute('href', 'https://notegeek.clintgeek.com/notes/n9');
    expect(screen.queryByTestId('fake-stroke')).toBe(null);
    expect(store.getState().phase).toBe('unreadable');
  });

  it('a change that reaches the store anyway sends no save', async () => {
    const { store, saves } = setup([[note(BROKEN)]]);
    await act(() => store.load());
    await screen.findByTestId('ink-unreadable');
    act(() => store.write('{"store":{"shape:new":{}}}'));
    store.retryNow();
    await Promise.resolve();
    expect(saves()).toEqual([]);
  });

  it('a failed fetch shows its own load error and the page cannot be written', async () => {
    const { store, saves } = setup([new Error('Failed to fetch')]);
    await act(() => store.load());
    expect(await screen.findByTestId('ink-load-error')).toBeInTheDocument();
    expect(screen.queryByTestId('fake-stroke')).toBe(null);
    act(() => store.write(GOOD));
    expect(saves()).toEqual([]);
  });

  it('Try again reads the page again; once it opens, a stroke saves as usual', async () => {
    const { store, calls, saves } = setup([[note(BROKEN)], [note(GOOD)]]);
    await act(() => store.load());
    const tryAgain = await screen.findByRole('button', { name: 'Try again' });
    await act(async () => { fireEvent.click(tryAgain); });
    const stroke = await screen.findByTestId('fake-stroke');
    await act(async () => { fireEvent.click(stroke); });
    expect(calls.filter((c) => c === 'find')).toHaveLength(2);
    expect(saves()).toEqual([{ save: { id: 'n9', content: '{"store":{"shape:new":{}}}', baseUpdatedAt: 'u9' } }]);
  });
});
