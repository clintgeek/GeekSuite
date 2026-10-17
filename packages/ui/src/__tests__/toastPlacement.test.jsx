// @vitest-environment jsdom
/**
 * Where a toast lands, and whether it can be reached (FitnessGeek d-fixes,
 * 2026-10-17; the harness found all three on a phone):
 *
 *   - while a dialog is open, the stack lives inside the dialog's focus-trapped
 *     content, never under the modal's `aria-hidden` — a screen reader
 *     couldn't reach the toast's Undo, and Tab couldn't either;
 *   - it moves back out to the page when the dialog closes;
 *   - a sticky footer registered with `useGeekToastClearance` pushes the stack
 *     above it — the ten-second toast used to cover a sheet's Done;
 *   - the stack is one flex column.
 *
 * The side-by-side layout itself is proven in the browser (harness scene
 * 40a measures the boxes); jsdom can only check what the stack asks for.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import Dialog from '@mui/material/Dialog';
import { GeekToastProvider } from '../feedback/GeekToastProvider.jsx';
import { activeModalHost, useGeekToastClearance, useToast } from '../feedback/toastContext.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let container;
let api;

function Grab() {
  api = useToast();
  return null;
}

/** A footer whose top sits `fromBottom` px above the bottom of the window. */
function Footer({ fromBottom }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.getBoundingClientRect = () => ({
      top: window.innerHeight - fromBottom, bottom: window.innerHeight, height: fromBottom, left: 0, right: 390, width: 390, x: 0, y: window.innerHeight - fromBottom,
    });
  }, [fromBottom]);
  // The measuring ref is set before the hook's effect runs (child effects first).
  useGeekToastClearance(ref, true);
  return <div ref={ref} data-test-footer />;
}

async function mount(ui) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<GeekToastProvider><Grab />{ui}</GeekToastProvider>); });
}

const toast = () => document.querySelector('[data-geek-toast]');
const bottomOf = (el) => window.getComputedStyle(el).bottom;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  document.body.innerHTML = '';
});

describe('a toast while a dialog is open', () => {
  it('renders inside the dialog, not under its aria-hidden', async () => {
    await mount(<Dialog open onClose={() => {}}><button type="button">Inside</button></Dialog>);
    await act(async () => { api.notify('Added to lunch ✓', { action: <button type="button">Undo</button> }); });
    const el = toast();
    expect(el).toBeTruthy();
    expect(el.closest('[aria-hidden="true"]')).toBeNull();
    expect(el.closest('.MuiDialog-root')).toBeTruthy();
    // Inside the focus trap's root, so Tab can reach Undo.
    expect(el.closest('.MuiDialog-container')).toBeTruthy();
  });

  it('goes back to the page once the dialog is gone', async () => {
    function Page({ open }) {
      return <Dialog open={open} onClose={() => {}} transitionDuration={0}><p>Sheet</p></Dialog>;
    }
    await mount(<Page open />);
    await act(async () => { api.notify('Saved', { duration: 0 }); });
    expect(toast().closest('.MuiDialog-root')).toBeTruthy();
    await act(async () => { root.render(<GeekToastProvider><Grab /><Page open={false} /></GeekToastProvider>); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(toast()).toBeTruthy();
    expect(toast().closest('.MuiDialog-root')).toBeNull();
    expect(toast().closest('[aria-hidden="true"]')).toBeNull();
  });

  it('a menu or popover is never the host', () => {
    const popover = document.createElement('div');
    popover.className = 'MuiPopover-root MuiModal-root';
    document.body.appendChild(popover);
    expect(activeModalHost(document)).toBeNull();
  });
});

describe('a registered footer', () => {
  it('lifts the stack above it', async () => {
    await mount(<Footer fromBottom={96} />);
    await act(async () => { api.notify('Added to lunch ✓'); });
    const bar = document.querySelector('[data-geek-toasts]');
    // 96 px of footer, plus an 8 px gap above it.
    expect(bottomOf(bar)).toBe('104px');
  });

  it('without one, the stack keeps its usual place', async () => {
    await mount(null);
    await act(async () => { api.notify('Added to lunch ✓'); });
    const bar = document.querySelector('[data-geek-toasts]');
    expect(bottomOf(bar)).not.toBe('104px');
  });
});

describe('the stack', () => {
  it('is one column, never a row', async () => {
    await mount(null);
    await act(async () => { api.notify('One'); api.notify('Two'); });
    const stack = document.querySelectorAll('[data-geek-toast]')[0].parentElement;
    expect(window.getComputedStyle(stack).flexDirection).toBe('column');
    expect(document.querySelectorAll('[data-geek-toast]')).toHaveLength(2);
  });
});

describe('a dialog on its way out', () => {
  it('is not a host: a toast arriving as it closes lands on the page', async () => {
    function Page({ open }) {
      return <Dialog open={open} onClose={() => {}} transitionDuration={10000}><p>Sheet</p></Dialog>;
    }
    await mount(<Page open />);
    await act(async () => { root.render(<GeekToastProvider><Grab /><Page open={false} /></GeekToastProvider>); });
    // Still mounted, fading out.
    expect(document.querySelector('.MuiDialog-root')).toBeTruthy();
    await act(async () => { api.notify('Added to lunch ✓', { duration: 0 }); });
    expect(toast()).toBeTruthy();
    expect(toast().closest('.MuiDialog-root')).toBeNull();
  });
});
