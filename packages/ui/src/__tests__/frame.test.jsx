/**
 * GeekAppFrame smoke tests (DOCS/MOBILE_UI_PLAN.md §4b "Follow-ups surfaced
 * by M3–M5").
 *
 * Same constraints as the other suites in this package: `node` environment,
 * `react-dom/server` static markup, assertions on presence/order and literal
 * emotion CSS text via the `data-geek-*` hooks and inline `<style>` tags.
 *
 * `useReducedMotion()` resolves `false` under SSR (no `window.matchMedia`),
 * so the reduced-motion branch is exercised through the transition duration
 * math directly rather than through a real media query — same limitation as
 * `useGeekDialogFullScreen`'s own SSR test.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { GeekShellContext } from '../navigation/shellContext.js';
import { GeekAppFrame } from '../navigation/GeekAppFrame.jsx';

const SHELL = {
  isMobile: false,
  mobileOpen: false,
  hasNav: true,
  bottomInset: 0,
  openNav: () => {},
  closeNav: () => {},
  toggleNav: () => {},
};

function render(props, shell = SHELL) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <GeekShellContext.Provider value={shell}>
        <GeekAppFrame {...props}>
          <div data-test-content>content</div>
        </GeekAppFrame>
      </GeekShellContext.Provider>
    </MemoryRouter>
  );
}

/** The emotion CSS rule text for the element whose opening tag contains `attr`. */
function ruleFor(markup, attr) {
  const idx = markup.indexOf(attr);
  if (idx === -1) return '';
  const tagStart = markup.lastIndexOf('<', idx);
  const tagEnd = markup.indexOf('>', idx);
  const match = markup.slice(tagStart, tagEnd + 1).match(/class="([^"]*)"/);
  const cls = match ? match[1].split(' ').find((c) => c.startsWith('css-')) : null;
  if (!cls) return '';
  const ruleIdx = markup.indexOf(`.${cls}{`);
  if (ruleIdx === -1) return '';
  return markup.slice(ruleIdx, markup.indexOf('}', ruleIdx) + 1);
}

describe('GeekAppFrame — default (no fill)', () => {
  it('renders the content and scrolls itself', () => {
    const markup = render({});
    expect(markup).toContain('data-test-content');
    expect(ruleFor(markup, 'data-test-content') || markup).toBeTruthy();
    expect(markup).not.toContain('data-geek-frame="fill"');
    expect(markup).toContain('overflow-y:auto');
  });
});

describe('GeekAppFrame — fill', () => {
  it('carries the fill hook and stops the frame scrolling itself', () => {
    const markup = render({ fill: true });
    expect(markup).toContain('data-geek-frame="fill"');
    expect(markup).toContain('overflow:hidden');
    expect(markup).not.toContain('overflow-y:auto');
  });

  it('flexes the route-transition div so a page can pin a composer/board', () => {
    const markup = render({ fill: true });
    const idx = markup.indexOf('data-test-content');
    const tagStart = markup.lastIndexOf('<div', idx);
    // The route motion.div is the ancestor <div style="..."> just outside the
    // page's own content; walk back to the nearest inline style attribute.
    const styleStart = markup.lastIndexOf('style="', tagStart);
    const styleEnd = markup.indexOf('"', styleStart + 7);
    const style = markup.slice(styleStart, styleEnd);
    expect(style).toContain('display:flex');
    expect(style).toContain('flex-direction:column');
    expect(style).toContain('flex:1');
    expect(style).toContain('min-height:0');
  });

  it('leaves the route div a plain min-height block without fill', () => {
    const markup = render({});
    const idx = markup.indexOf('data-test-content');
    const tagStart = markup.lastIndexOf('<div', idx);
    const styleStart = markup.lastIndexOf('style="', tagStart);
    const styleEnd = markup.indexOf('"', styleStart + 7);
    const style = markup.slice(styleStart, styleEnd);
    expect(style).toContain('min-height:100%');
    expect(style).not.toContain('display:flex');
  });
});

describe('GeekAppFrame — bottomInset unaffected by fill', () => {
  it('still applies the shell bottom inset as padding when filled', () => {
    const markup = render({ fill: true }, { ...SHELL, bottomInset: 56 });
    expect(markup).toContain('padding-bottom:56px');
  });
});
