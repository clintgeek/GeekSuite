// @vitest-environment jsdom
/**
 * GeekUpdateIndicator: "Updating…" only while a NEW worker installs over an
 * existing one, and gone again if that install fails. A fake
 * navigator.serviceWorker stands in for the browser's.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { GeekUpdateIndicator } from '../feedback/GeekUpdateIndicator.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class Emitter {
  constructor() { this.handlers = {}; }
  addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.handlers[type] = (this.handlers[type] || []).filter((h) => h !== fn); }
  emit(type) { for (const fn of this.handlers[type] || []) fn(); }
}

function fakeServiceWorker({ controller = {}, installing = null, active = null } = {}) {
  const registration = new Emitter();
  registration.installing = installing;
  registration.waiting = null;
  registration.active = active;
  const sw = new Emitter();
  return Object.assign(sw, { controller, registration, getRegistration: () => Promise.resolve(registration) });
}
function worker() {
  const w = new Emitter();
  w.state = 'installing';
  return w;
}

let root;
let container;
async function mount(sw) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<GeekUpdateIndicator serviceWorker={sw} />); });
}
const shown = () => Boolean(container.querySelector('[data-testid="geek-update-indicator"]'));

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('GeekUpdateIndicator', () => {
  it('shows nothing when no update is in flight', async () => {
    await mount(fakeServiceWorker());
    expect(shown()).toBe(false);
  });

  it('shows "Updating…" when a new worker starts installing over the current one', async () => {
    const sw = fakeServiceWorker();
    await mount(sw);
    sw.registration.installing = worker();
    await act(async () => sw.registration.emit('updatefound'));
    expect(shown()).toBe(true);
    expect(container.textContent).toContain('Updating to the latest version…');
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('catches an update that began before it mounted', async () => {
    await mount(fakeServiceWorker({ installing: worker() }));
    expect(shown()).toBe(true);
  });

  it('catches a fast update already taking over when it mounted', async () => {
    await mount(fakeServiceWorker({ active: { state: 'activating' } }));
    expect(shown()).toBe(true);
  });

  it('shows on the takeover itself — the reload follows it', async () => {
    const sw = fakeServiceWorker();
    await mount(sw);
    await act(async () => sw.emit('controllerchange'));
    expect(shown()).toBe(true);
  });

  it('stays silent on a first-ever install — no controller, no reload coming', async () => {
    const sw = fakeServiceWorker({ controller: null, installing: worker() });
    await mount(sw);
    expect(shown()).toBe(false);
  });

  it('goes away if the install fails, so a broken deploy never leaves it stuck', async () => {
    const w = worker();
    await mount(fakeServiceWorker({ installing: w }));
    expect(shown()).toBe(true);
    w.state = 'redundant';
    await act(async () => w.emit('statechange'));
    expect(shown()).toBe(false);
  });
});
