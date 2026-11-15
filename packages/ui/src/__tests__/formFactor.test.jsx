// @vitest-environment jsdom
/**
 * useFormFactor (review 4.2): pointer first, size second. The rule lives in
 * classifyFormFactor's JSDoc; these lock it at the sizes the harness shoots
 * (390x844 phone, 800x1280 / 1280x800 Android tablet, 1280x900 desktop) and
 * check the hook follows matchMedia and resize changes.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

import { classifyFormFactor, geekMedia, useFormFactor } from '../index.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const kind = (f) => (f.phone ? 'phone' : f.tablet ? 'tablet' : f.desktop ? 'desktop' : 'none');

describe('classifyFormFactor', () => {
  const touch = { coarse: true, fine: false, anyHover: false };
  const mouse = { coarse: false, fine: true, anyHover: true };
  it.each([
    ['phone portrait', { width: 390, height: 844, ...touch }, 'phone'],
    ['phone landscape stays a phone', { width: 844, height: 390, ...touch }, 'phone'],
    ['tablet portrait', { width: 800, height: 1280, ...touch }, 'tablet'],
    ['tablet landscape (wider than the old 900 breakpoint)', { width: 1280, height: 800, ...touch }, 'tablet'],
    ['big touch screen is never desktop', { width: 1920, height: 1080, ...touch }, 'tablet'],
    ['narrow mouse window', { width: 500, height: 900, ...mouse }, 'phone'],
    ['mid mouse window', { width: 900, height: 800, ...mouse }, 'tablet'],
    ['1199 mouse window', { width: 1199, height: 800, ...mouse }, 'tablet'],
    ['desktop', { width: 1280, height: 900, ...mouse }, 'desktop'],
    ['short wide mouse window is still desktop', { width: 1280, height: 500, ...mouse }, 'desktop'],
    ['no pointer reported counts as fine', { width: 1280, height: 900 }, 'desktop'],
  ])('%s', (_name, input, expected) => {
    const f = classifyFormFactor(input);
    expect(kind(f)).toBe(expected);
    expect([f.phone, f.tablet, f.desktop].filter(Boolean)).toHaveLength(1);
  });

  it('reports landscape and passes the pointer facts through', () => {
    const f = classifyFormFactor({ width: 1280, height: 800, coarse: true, anyHover: true });
    expect(f).toMatchObject({ landscape: true, coarse: true, fine: false, anyHover: true, width: 1280, height: 800 });
  });

  it('exports pointer media queries for sizing by input', () => {
    expect(geekMedia.coarse).toBe('@media (pointer: coarse)');
    expect(geekMedia.anyHover).toBe('@media (any-hover: hover)');
  });
});

// ── the hook, with matchMedia mocked ───────────────────────────────────────
const media = { coarse: false, fine: true, anyHover: true };
const mqListeners = new Set();
function installMatchMedia() {
  window.matchMedia = (query) => {
    const key = query.includes('coarse') ? 'coarse' : query.includes('fine') ? 'fine' : query.includes('any-hover') ? 'anyHover' : null;
    return {
      media: query,
      get matches() {
        return key ? media[key] : false;
      },
      addEventListener: (_t, fn) => mqListeners.add(fn),
      removeEventListener: (_t, fn) => mqListeners.delete(fn),
    };
  };
}
const setSize = (w, h) => {
  window.innerWidth = w;
  window.innerHeight = h;
};

let root = null;
let host = null;
let last = null;
function Probe() {
  last = useFormFactor();
  return null;
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  root = null;
});

describe('useFormFactor', () => {
  it('reads pointer and size, and follows rotation and pointer changes', async () => {
    installMatchMedia();
    Object.assign(media, { coarse: true, fine: false, anyHover: false });
    setSize(800, 1280);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<Probe />));
    expect(kind(last)).toBe('tablet');
    expect(last.landscape).toBe(false);
    expect(last.coarse).toBe(true);

    // Rotate.
    setSize(1280, 800);
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(kind(last)).toBe('tablet');
    expect(last.landscape).toBe(true);
    expect(last.width).toBe(1280);

    // A trackpad cover goes on: primary pointer turns fine, so 1280 is desktop.
    Object.assign(media, { coarse: false, fine: true, anyHover: true });
    await act(async () => {
      for (const fn of [...mqListeners]) fn({ matches: true });
    });
    expect(kind(last)).toBe('desktop');
    expect(last.anyHover).toBe(true);

    // Shrink the window to a phone width.
    setSize(390, 844);
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(kind(last)).toBe('phone');
  });

  it('keeps the same object between renders when nothing changed', async () => {
    installMatchMedia();
    setSize(1280, 900);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<Probe />));
    const first = last;
    await act(async () => root.render(<Probe />));
    expect(last).toBe(first);
  });

  it('server render answers fine-pointer desktop, like useMediaQuery does', () => {
    let seen = null;
    function S() {
      seen = useFormFactor();
      return null;
    }
    renderToStaticMarkup(<S />);
    expect(kind(seen)).toBe('desktop');
  });
});
