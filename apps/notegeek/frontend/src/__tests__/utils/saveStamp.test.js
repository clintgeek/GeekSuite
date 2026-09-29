import { describe, it, expect } from 'vitest';
import { saveStampState } from '../../utils/saveStamp';

const NOW = new Date('2026-09-26T20:00:00Z');

describe('saveStampState', () => {
  it('orders saving > offline > error > empty > dirty > saved > draft', () => {
    const all = { saving: true, offline: true, error: 'x', empty: true, dirty: true, lastSavedAt: NOW, now: NOW };
    expect(saveStampState(all).tone).toBe('saving');
    expect(saveStampState({ ...all, saving: false }).tone).toBe('offline');
    expect(saveStampState({ ...all, saving: false, offline: false }).tone).toBe('error');
    expect(saveStampState({ ...all, saving: false, offline: false, error: null }).tone).toBe('empty');
    expect(saveStampState({ ...all, saving: false, offline: false, error: null, empty: false }).tone).toBe('dirty');
    expect(saveStampState({ lastSavedAt: NOW, now: NOW }).tone).toBe('saved');
    expect(saveStampState({}).tone).toBe('draft');
  });

  it('labels each state in lowercase', () => {
    expect(saveStampState({ saving: true }).label).toBe('saving…');
    expect(saveStampState({ error: 'boom' }).label).toBe('not saved');
    expect(saveStampState({ offline: true, dirty: true }).label).toBe('offline · not saved');
    expect(saveStampState({ empty: true }).label).toBe('nothing to save');
    expect(saveStampState({ dirty: true }).label).toBe('editing');
    expect(saveStampState({}).label).toBe('draft');
  });

  it('is loud only when a save failed or unsaved work is stuck offline', () => {
    expect(saveStampState({ error: 'boom' }).loud).toBe(true);
    expect(saveStampState({ offline: true, dirty: true }).loud).toBe(true);
    expect(saveStampState({ offline: true, error: 'boom' }).loud).toBe(true);
    expect(saveStampState({ saving: true }).loud).toBe(false);
    expect(saveStampState({ dirty: true }).loud).toBe(false);
    expect(saveStampState({ lastSavedAt: NOW, now: NOW }).loud).toBe(false);
    expect(saveStampState({}).loud).toBe(false);
  });

  it('stays quiet offline when nothing is unsaved', () => {
    const s = saveStampState({ offline: true, lastSavedAt: NOW, now: NOW });
    expect(s.tone).toBe('saved');
    expect(s.loud).toBe(false);
  });

  it('ages the saved time against the given clock', () => {
    expect(saveStampState({ lastSavedAt: NOW, now: NOW }).label).toBe('saved · just now');
    const tenMin = new Date(NOW.getTime() + 10 * 60000);
    expect(saveStampState({ lastSavedAt: NOW, now: tenMin }).label).toBe('saved · 10m ago');
  });
});
