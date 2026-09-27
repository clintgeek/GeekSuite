import { describe, it, expect } from 'vitest';
import { saveStampState } from '../../utils/saveStamp';

const NOW = new Date('2026-09-26T20:00:00Z');

describe('saveStampState', () => {
  it('orders saving > error > empty > dirty > saved > draft', () => {
    const all = { saving: true, error: 'x', empty: true, dirty: true, lastSavedAt: NOW, now: NOW };
    expect(saveStampState(all).tone).toBe('saving');
    expect(saveStampState({ ...all, saving: false }).tone).toBe('error');
    expect(saveStampState({ ...all, saving: false, error: null }).tone).toBe('empty');
    expect(saveStampState({ ...all, saving: false, error: null, empty: false }).tone).toBe('dirty');
    expect(saveStampState({ lastSavedAt: NOW, now: NOW }).tone).toBe('saved');
    expect(saveStampState({}).tone).toBe('draft');
  });

  it('labels each state', () => {
    expect(saveStampState({ saving: true }).label).toBe('Saving…');
    expect(saveStampState({ error: 'boom' }).label).toBe('Not saved');
    expect(saveStampState({ empty: true }).label).toBe('Nothing to save');
    expect(saveStampState({ dirty: true }).label).toBe('Unsaved');
    expect(saveStampState({}).label).toBe('Draft');
  });

  it('ages the saved time against the given clock', () => {
    expect(saveStampState({ lastSavedAt: NOW, now: NOW }).label).toBe('Saved · just now');
    const tenMin = new Date(NOW.getTime() + 10 * 60000);
    expect(saveStampState({ lastSavedAt: NOW, now: tenMin }).label).toBe('Saved · 10m ago');
  });
});
