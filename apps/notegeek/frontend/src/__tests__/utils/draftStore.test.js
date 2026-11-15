import { describe, it, expect, beforeEach } from 'vitest';
import { saveDraft, getDraft, clearDraft, clearDraftIfSaved, draftKeyFor, __resetDraftsForTests } from '../../utils/draftStore';

// jsdom has no IndexedDB, so this exercises the in-memory fallback — the same
// API the editor uses; the IndexedDB path is the same calls on a real store.
describe('draftStore (review 1.2)', () => {
  beforeEach(() => __resetDraftsForTests());

  it('keeps and returns a draft by key, stamped with the device time', async () => {
    await saveDraft(draftKeyFor('n1'), { content: 'a', title: 't' });
    const d = await getDraft('note:n1');
    expect(d).toMatchObject({ key: 'note:n1', content: 'a', title: 't' });
    expect(typeof d.savedAt).toBe('number');
  });

  it('a new note has its own key per history entry', () => {
    expect(draftKeyFor(null, 'abc')).toBe('new:abc');
    expect(draftKeyFor('n1', 'abc')).toBe('note:n1');
  });

  it('clearDraftIfSaved leaves a newer draft alone', async () => {
    await saveDraft('note:n1', { content: 'typed after the save', title: '' });
    await clearDraftIfSaved('note:n1', { content: 'what was saved', title: '' });
    expect(await getDraft('note:n1')).not.toBeNull();
    await clearDraftIfSaved('note:n1', { content: 'typed after the save', title: '' });
    expect(await getDraft('note:n1')).toBeNull();
  });

  it('clearDraft forgets it', async () => {
    await saveDraft('note:n1', { content: 'x' });
    await clearDraft('note:n1');
    expect(await getDraft('note:n1')).toBeNull();
  });
});
