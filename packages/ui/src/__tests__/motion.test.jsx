/**
 * `useReducedMotion` smoke test (DOCS/MOBILE_UI_PLAN.md §2 "Motion" / §4b).
 *
 * Same SSR limitation as `useGeekDialogFullScreen`'s own test: `node` has no
 * `window.matchMedia`, so `useMediaQuery` resolves `false` regardless of the
 * query string. What's locked here is the contract that matters at this
 * layer — the helper is exported, callable outside any provider, and safe
 * under SSR — not the real media-query branch, which needs a browser.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { useReducedMotion } from '../motion.js';

function Probe() {
  const reduced = useReducedMotion();
  return <div data-test-probe data-reduced={String(reduced)} />;
}

describe('useReducedMotion', () => {
  it('is exported and resolves false under SSR (no matchMedia)', () => {
    const markup = renderToStaticMarkup(<Probe />);
    expect(markup).toContain('data-test-probe');
    expect(markup).toContain('data-reduced="false"');
  });
});
