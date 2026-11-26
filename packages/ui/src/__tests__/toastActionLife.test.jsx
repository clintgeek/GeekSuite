// @vitest-environment jsdom
/**
 * A toast that offers Undo is the only way back from what it reports, so it
 * stays twice as long as a plain one (suite UX review, 2026-11-18: four
 * seconds was too short to read it and reach it with a thumb). A caller's own
 * `duration`, and a provider given its own `duration`, still win.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  GEEK_TOAST_ACTION_DURATION,
  GEEK_TOAST_DURATION,
  GeekToastProvider,
} from '../feedback/GeekToastProvider.jsx';
import { useToast } from '../feedback/toastContext.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let container;
let api;

function Grab() {
  api = useToast();
  return null;
}

function mount(props = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <GeekToastProvider {...props}>
        <Grab />
      </GeekToastProvider>
    );
  });
}

const shown = (text) => document.body.textContent.includes(text);
const tick = (ms) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('how long a toast stays', () => {
  it('keeps a toast with an action for the longer life', () => {
    mount();
    act(() => { api.notify('Note deleted', { action: <button type="button">Undo</button> }); });
    tick(GEEK_TOAST_DURATION + 500);
    expect(shown('Note deleted')).toBe(true);
    tick(GEEK_TOAST_ACTION_DURATION - GEEK_TOAST_DURATION);
    expect(shown('Note deleted')).toBe(false);
  });

  it('still clears a plain toast after the short life', () => {
    mount();
    act(() => { api.notify('Saved') ; });
    tick(GEEK_TOAST_DURATION + 500);
    expect(shown('Saved')).toBe(false);
  });

  it('lets the caller set its own life for an action toast', () => {
    mount();
    act(() => { api.notify('Gone', { duration: 1000, action: <button type="button">Undo</button> }); });
    tick(1500);
    expect(shown('Gone')).toBe(false);
  });

  it('never gives an action toast less than the action life, whatever the provider duration', () => {
    mount({ duration: 1000 });
    act(() => { api.notify('Gone', { action: <button type="button">Undo</button> }); });
    tick(1500);
    expect(shown('Gone')).toBe(true);
    tick(7000);
    expect(shown('Gone')).toBe(false);
  });

  it('follows a provider duration longer than the action life', () => {
    mount({ duration: 12000 });
    act(() => { api.notify('Gone', { action: <button type="button">Undo</button> }); });
    tick(9000);
    expect(shown('Gone')).toBe(true);
    tick(4000);
    expect(shown('Gone')).toBe(false);
  });
});
