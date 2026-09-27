import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }));
import { useDeferredUpdate } from '../PWAUpdatePrompt';

function fakeDoc(state = 'visible') {
  const listeners = new Set();
  return {
    visibilityState: state,
    addEventListener: (_t, fn) => listeners.add(fn),
    removeEventListener: (_t, fn) => listeners.delete(fn),
    fire() { listeners.forEach((fn) => fn()); },
  };
}

function setup(state) {
  const doc = fakeDoc(state);
  const updateSW = vi.fn();
  let opts;
  const register = vi.fn((o) => { opts = o; return updateSW; });
  renderHook(() => useDeferredUpdate({ register, doc }));
  return { doc, updateSW, opts: () => opts };
}

describe('useDeferredUpdate: an update never reloads the page in front of you', () => {
  it('does NOT apply an update while the app is visible', () => {
    const { updateSW, opts } = setup('visible');
    opts().onNeedRefresh();
    expect(updateSW).not.toHaveBeenCalled();
  });

  it('applies it once the app is hidden', () => {
    const { doc, updateSW, opts } = setup('visible');
    opts().onNeedRefresh();
    doc.visibilityState = 'hidden';
    doc.fire();
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('applies straight away if the update arrives while already hidden', () => {
    const { updateSW, opts } = setup('hidden');
    opts().onNeedRefresh();
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('does nothing on hide when no update is waiting', () => {
    const { doc, updateSW } = setup('visible');
    doc.visibilityState = 'hidden';
    doc.fire();
    expect(updateSW).not.toHaveBeenCalled();
  });
});
