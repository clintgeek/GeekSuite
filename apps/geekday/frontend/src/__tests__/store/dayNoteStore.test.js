import { describe, expect, it, vi } from 'vitest';
import { DayNoteStore, RETRY_DELAYS_MS, SKETCH_MAX_CHARS, pickDayNote } from '../../store/dayNoteStore.js';
import { CREATE_DAY_NOTE, FIND_DAY_NOTE, SAVE_DAY_NOTE } from '../../graphql/documents.js';

const DAY = '2026-11-20';
const INK = (n) => `{"store":{"shape:${n}":{"typeName":"shape"}}}`;

const conflictError = (serverNote) =>
  Object.assign(new Error('conflict'), { graphQLErrors: [{ extensions: { code: 'CONFLICT', serverNote } }] });

/** A fake Apollo client whose answers are queued per operation. */
function fakeClient({ notes = [] } = {}) {
  const calls = [];
  const queue = { create: [], save: [], find: [] };
  const next = (kind, fallback) => {
    const step = queue[kind].shift();
    if (!step) return Promise.resolve(fallback);
    return typeof step === 'function' ? step() : step instanceof Error ? Promise.reject(step) : Promise.resolve(step);
  };
  return {
    calls,
    queue,
    query: ({ query, variables }) => {
      expect(query).toBe(FIND_DAY_NOTE);
      calls.push({ op: 'find', variables });
      return next('find', { data: { notes } });
    },
    mutate: ({ mutation, variables }) => {
      if (mutation === CREATE_DAY_NOTE) {
        calls.push({ op: 'create', variables });
        return next('create', { data: { createNote: { id: 'n1', updatedAt: 'u1' } } });
      }
      expect(mutation).toBe(SAVE_DAY_NOTE);
      calls.push({ op: 'save', variables });
      return next('save', { data: { updateNote: { id: variables.id, updatedAt: `u${calls.length}` } } });
    },
  };
}

function makeStore(client) {
  const timers = [];
  const store = new DayNoteStore({
    client,
    dayKey: DAY,
    setTimer: (fn, ms) => {
      const timer = { fn, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      if (timer) timer.cleared = true;
    },
  });
  const fire = () => {
    const timer = timers.filter((t) => !t.cleared).pop();
    timer.cleared = true;
    timer.fn();
  };
  return { store, timers, fire };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('pickDayNote', () => {
  it('takes the oldest live note', () => {
    const picked = pickDayNote([
      { id: 'new', createdAt: '2026-11-20T10:00:00Z' },
      { id: 'old', createdAt: '2026-11-20T08:00:00Z' },
      { id: 'gone', createdAt: '2026-11-20T07:00:00Z', deletedAt: '2026-11-20T09:00:00Z' },
      { id: 'filed', createdAt: '2026-11-20T06:00:00Z', archived: true },
    ]);
    expect(picked.id).toBe('old');
    expect(pickDayNote([])).toBeNull();
  });
});

describe('DayNoteStore', () => {
  it('finds the day’s note by its exact day tag', async () => {
    const client = fakeClient({ notes: [{ id: 'n9', content: INK(1), updatedAt: 'u9', createdAt: '2026-11-20T08:00:00Z' }] });
    const { store } = makeStore(client);
    await store.load();
    expect(client.calls[0]).toEqual({ op: 'find', variables: { tag: 'daily/2026-11-20' } });
    expect(store.getState()).toMatchObject({ phase: 'ready', noteId: 'n9', content: INK(1), revision: 1 });
  });

  it('opens a blank page, creating nothing, when the day has no note', async () => {
    const client = fakeClient();
    const { store } = makeStore(client);
    await store.load();
    expect(store.getState()).toMatchObject({ phase: 'ready', noteId: null, content: null });
    expect(client.calls.map((c) => c.op)).toEqual(['find']);
  });

  it('creates an ordinary NoteGeek sketch on the first ink: tagged daily, titled with the date', async () => {
    const client = fakeClient();
    const { store } = makeStore(client);
    await store.load();
    store.write(INK(1));
    await settle();
    expect(client.calls[1]).toEqual({
      op: 'create',
      variables: { title: '2026-11-20 Friday', content: INK(1), tags: ['daily', 'daily/2026-11-20'] },
    });
    expect(store.getState()).toMatchObject({ save: 'saved', noteId: 'n1' });
    expect(store.hasUnsaved()).toBe(false);
  });

  it('updates the same note afterwards, conditional on the version it last saw', async () => {
    const client = fakeClient();
    const { store } = makeStore(client);
    await store.load();
    store.write(INK(1));
    await settle();
    store.write(INK(2));
    await settle();
    expect(client.calls[2]).toEqual({ op: 'save', variables: { id: 'n1', content: INK(2), baseUpdatedAt: 'u1' } });
    expect(client.calls.filter((c) => c.op === 'create')).toHaveLength(1);
  });

  it('sends one write at a time; ink drawn meanwhile waits and only the newest goes', async () => {
    const client = fakeClient({ notes: [{ id: 'n1', content: INK(0), updatedAt: 'u0', createdAt: '2026-11-20T08:00:00Z' }] });
    let release;
    client.queue.save.push(() => new Promise((resolve) => { release = () => resolve({ data: { updateNote: { id: 'n1', updatedAt: 'uA' } } }); }));
    const { store } = makeStore(client);
    await store.load();
    store.write(INK(1));
    store.write(INK(2));
    store.write(INK(3));
    expect(client.calls.filter((c) => c.op === 'save')).toHaveLength(1);
    release();
    await settle();
    const saves = client.calls.filter((c) => c.op === 'save');
    expect(saves.map((c) => c.variables.content)).toEqual([INK(1), INK(3)]);
    expect(saves[1].variables.baseUpdatedAt).toBe('uA');
  });

  it('keeps ink after a failed save, says so, and retries it (spec req 8)', async () => {
    const client = fakeClient({ notes: [{ id: 'n1', content: INK(0), updatedAt: 'u0', createdAt: '2026-11-20T08:00:00Z' }] });
    client.queue.save.push(new Error('network'), new Error('network'));
    const { store, timers, fire } = makeStore(client);
    await store.load();
    store.write(INK(1));
    await settle();
    expect(store.getState().save).toBe('error');
    expect(store.hasUnsaved()).toBe(true);
    expect(store.getState().content).toBe(INK(1));
    expect(timers.at(-1).ms).toBe(RETRY_DELAYS_MS[0]);

    fire(); // first retry fails too: wait longer
    await settle();
    expect(store.getState().save).toBe('error');
    expect(timers.at(-1).ms).toBe(RETRY_DELAYS_MS[1]);

    fire(); // second retry lands
    await settle();
    expect(store.getState().save).toBe('saved');
    expect(store.hasUnsaved()).toBe(false);
    expect(client.calls.filter((c) => c.op === 'save').map((c) => c.variables.content)).toEqual([INK(1), INK(1), INK(1)]);
  });

  it('retries with the newest ink, not the ink that failed', async () => {
    const client = fakeClient({ notes: [{ id: 'n1', content: INK(0), updatedAt: 'u0', createdAt: '2026-11-20T08:00:00Z' }] });
    client.queue.save.push(new Error('network'));
    const { store } = makeStore(client);
    await store.load();
    store.write(INK(1));
    await settle();
    store.write(INK(2)); // drawing again retries at once
    await settle();
    expect(client.calls.filter((c) => c.op === 'save').map((c) => c.variables.content)).toEqual([INK(1), INK(2)]);
    expect(store.getState().save).toBe('saved');
  });

  it('writes nothing over another device’s change, and lets the user keep this version', async () => {
    const client = fakeClient({ notes: [{ id: 'n1', content: INK(0), updatedAt: 'u0', createdAt: '2026-11-20T08:00:00Z' }] });
    client.queue.save.push(conflictError({ id: 'n1', content: INK(9), updatedAt: 'u9' }));
    const { store } = makeStore(client);
    await store.load();
    store.write(INK(1));
    await settle();
    expect(store.getState().save).toBe('conflict');
    expect(store.hasUnsaved()).toBe(true);

    store.resolveConflict('mine');
    await settle();
    expect(client.calls.at(-1)).toEqual({ op: 'save', variables: { id: 'n1', content: INK(1), baseUpdatedAt: 'u9' } });
    expect(store.getState().save).toBe('saved');
  });

  it('takes the other device’s version when asked, and tells the canvas to reload', async () => {
    const client = fakeClient({ notes: [{ id: 'n1', content: INK(0), updatedAt: 'u0', createdAt: '2026-11-20T08:00:00Z' }] });
    client.queue.save.push(conflictError({ id: 'n1', content: INK(9), updatedAt: 'u9' }));
    const { store } = makeStore(client);
    await store.load();
    const before = store.getState().revision;
    store.write(INK(1));
    await settle();
    store.resolveConflict('theirs');
    expect(store.getState()).toMatchObject({ save: 'saved', content: INK(9), revision: before + 1 });
    expect(store.hasUnsaved()).toBe(false);
    expect(client.calls.filter((c) => c.op === 'save')).toHaveLength(1);
  });

  it('does not bump the revision for its own saves, so the canvas is never reloaded under the pen', async () => {
    const client = fakeClient();
    const { store } = makeStore(client);
    await store.load();
    const revision = store.getState().revision;
    store.write(INK(1));
    await settle();
    expect(store.getState().revision).toBe(revision);
  });

  it('refuses a page over the gateway’s size limit without sending it', async () => {
    const client = fakeClient({ notes: [{ id: 'n1', content: INK(0), updatedAt: 'u0', createdAt: '2026-11-20T08:00:00Z' }] });
    const { store } = makeStore(client);
    await store.load();
    store.write('x'.repeat(SKETCH_MAX_CHARS + 1));
    await settle();
    expect(store.getState().save).toBe('tooLarge');
    expect(client.calls.filter((c) => c.op === 'save')).toHaveLength(0);
    store.write(INK(2)); // erased back under the limit
    await settle();
    expect(store.getState().save).toBe('saved');
  });

  it('reports a failed first load, and never replaces unsaved ink with a re-read', async () => {
    const client = fakeClient();
    client.queue.find.push(new Error('down'));
    const { store } = makeStore(client);
    await store.load();
    expect(store.getState().phase).toBe('loadError');

    await store.load();
    expect(store.getState().phase).toBe('ready');
    client.queue.create.push(new Error('network'));
    store.write(INK(1));
    await settle();
    const finds = client.calls.filter((c) => c.op === 'find').length;
    await store.load(); // unsaved ink: the server's copy is older
    expect(client.calls.filter((c) => c.op === 'find')).toHaveLength(finds);
    expect(store.getState().content).toBe(INK(1));
  });

  it('notifies subscribers', async () => {
    const { store } = makeStore(fakeClient());
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    await store.load();
    expect(listener).toHaveBeenCalled();
    stop();
  });

  describe('a page that cannot be loaded is never written over', () => {
    const STORED = '{"store":{"shape:1":'; // truncated
    const dayNote = (content = STORED) => ({ id: 'n9', content, updatedAt: 'u9', createdAt: '2026-11-20T08:00:00Z' });
    const writes = (client) => client.calls.filter((c) => c.op !== 'find');

    it('a failed fetch is a load error, not an empty day: ink is refused and nothing is created', async () => {
      const client = fakeClient();
      client.queue.find.push(new Error('Failed to fetch'));
      const { store } = makeStore(client);
      await store.load();
      expect(store.getState()).toMatchObject({ phase: 'loadError', noteId: null, content: null });
      store.write(INK(1));
      await settle();
      expect(writes(client)).toEqual([]);
      expect(store.hasUnsaved()).toBe(false);
    });

    it('an answer without a notes list is a load error too', async () => {
      const client = fakeClient();
      client.queue.find.push({ data: null });
      const { store } = makeStore(client);
      await store.load();
      expect(store.getState().phase).toBe('loadError');
      store.write(INK(1));
      await settle();
      expect(writes(client)).toEqual([]);
    });

    it('a page the canvas cannot draw is unreadable: a stroke sends no save', async () => {
      const client = fakeClient({ notes: [dayNote()] });
      const { store, timers } = makeStore(client);
      await store.load();
      store.unreadable(STORED);
      expect(store.getState()).toMatchObject({ phase: 'unreadable', noteId: 'n9', content: STORED });
      store.write(INK(1)); // the blank page plus a stroke
      store.retryNow();
      await settle();
      expect(writes(client)).toEqual([]);
      expect(timers).toEqual([]);
      expect(store.hasUnsaved()).toBe(false);
    });

    it('only the content on screen can be called unreadable', async () => {
      const client = fakeClient({ notes: [dayNote(INK(0))] });
      const { store } = makeStore(client);
      await store.load();
      store.unreadable('something else');
      expect(store.getState().phase).toBe('ready');
    });

    it('Try again reads the note again; once it opens, ink saves over it as usual', async () => {
      const client = fakeClient({ notes: [dayNote()] });
      const { store } = makeStore(client);
      await store.load();
      store.unreadable(STORED);
      client.queue.find.push({ data: { notes: [dayNote(INK(0))] } }); // repaired meanwhile (in NoteGeek)
      await store.load();
      expect(store.getState()).toMatchObject({ phase: 'ready', content: INK(0), revision: 2 });
      store.write(INK(1));
      await settle();
      expect(writes(client)).toEqual([{ op: 'save', variables: { id: 'n9', content: INK(1), baseUpdatedAt: 'u9' } }]);
    });

    it('Try again on a page that is still unreadable gives the same content back for the canvas to try', async () => {
      const client = fakeClient({ notes: [dayNote()] });
      const { store } = makeStore(client);
      await store.load();
      store.unreadable(STORED);
      await store.load();
      expect(store.getState()).toMatchObject({ phase: 'ready', content: STORED, revision: 2 });
      store.unreadable(STORED);
      expect(store.getState().phase).toBe('unreadable');
    });
  });
});
