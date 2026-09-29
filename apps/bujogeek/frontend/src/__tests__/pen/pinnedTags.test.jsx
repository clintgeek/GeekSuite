/**
 * Pinned tags live in appPreferences.bujogeek.pinnedTags, written as a
 * PARTIAL update (the PATCH merges; nothing else in the bag is sent).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

const update = vi.fn(() => Promise.resolve({}));
let stored = {};
vi.mock('@geeksuite/user', () => ({
  useAppPreferences: (app) => ({ preferences: app === 'bujogeek' ? stored : {}, updateAppPreferences: update, loaded: true, loading: false }),
}));

const { default: usePinnedTags, normalizePinned } = await import('../../hooks/usePinnedTags');

function probe() {
  const ref = { current: null };
  const P = () => { ref.current = usePinnedTags(); return null; };
  render(<P />);
  return ref;
}

beforeEach(() => { update.mockClear(); stored = { aiReviewDraft: true }; });

describe('usePinnedTags', () => {
  it('reads nothing pinned as an empty list', () => {
    expect(probe().current.pinned).toEqual([]);
  });

  it('reads what is stored, tidied', () => {
    stored = { pinnedTags: ['work', '#Work', ' home ', ''] };
    expect(probe().current.pinned).toEqual(['work', 'home']);
  });

  it('pins by writing ONLY pinnedTags', async () => {
    const ref = probe();
    await act(async () => { await ref.current.toggle('work'); });
    expect(update).toHaveBeenCalledWith({ pinnedTags: ['work'] });
    expect(Object.keys(update.mock.calls[0][0])).toEqual(['pinnedTags']);
  });

  it('unpins, case-insensitively', async () => {
    stored = { pinnedTags: ['Work', 'home'] };
    const ref = probe();
    await act(async () => { await ref.current.toggle('work'); });
    expect(update).toHaveBeenCalledWith({ pinnedTags: ['home'] });
  });
});

describe('normalizePinned', () => {
  it('drops junk and caps the list', () => {
    expect(normalizePinned('work')).toEqual([]);
    expect(normalizePinned(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(12);
  });
});
