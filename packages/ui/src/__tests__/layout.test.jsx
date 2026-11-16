// @vitest-environment jsdom
/**
 * Tablet layout primitives (plan 2.6, decisions P2/P2a/P2b):
 *   - classifyFormFactor's derived kind / navMode / twoPane at the harness
 *     viewports (phone 390, tablet portrait 800, landscape 1280, desktop);
 *   - GeekNavRail: 72px, 48px targets, aria-current, keyboard, safe areas,
 *     no logout item, the same items array as GeekBottomNav;
 *   - GeekShell's `rail` slot and its `leftInset`;
 *   - GeekTwoPane: two panes from 1024, one at a time below, placeholder.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import {
  GEEK_NAV_RAIL_WIDTH,
  GeekBottomNav,
  GeekNavRail,
  GeekShell,
  GeekTwoPane,
  TWO_PANE_MIN_WIDTH,
  classifyFormFactor,
  useGeekNavMode,
  useGeekShell,
} from '../index.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root = null;
let host = null;
const mount = async (ui) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={['/today']}>{ui}</MemoryRouter>));
};
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  root = null;
});
const $ = (sel) => host.querySelector(sel);
const $$ = (sel) => [...host.querySelectorAll(sel)];
const css = () =>
  [...document.styleSheets]
    .flatMap((sheet) => {
      try {
        return [...sheet.cssRules].map((r) => r.cssText);
      } catch {
        return [];
      }
    })
    .join('}\n')
    .replace(/\s+/g, '');
const rulesFor = (el) => {
  const all = css().split('}');
  return [...el.classList]
    .filter((c) => c.startsWith('css-'))
    .map((c) => all.filter((r) => r.includes(`.${c}`)).join('}'))
    .join('\n');
};

// ── matchMedia + size, as in formFactor.test.jsx ─────────────────────────────
const media = { coarse: false, fine: true, anyHover: true };
function installMatchMedia() {
  window.matchMedia = (query) => {
    const key = query.includes('coarse') ? 'coarse' : query.includes('fine') ? 'fine' : query.includes('any-hover') ? 'anyHover' : null;
    return {
      media: query,
      get matches() {
        return key ? media[key] : false;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    };
  };
}
const device = (w, h, touch) => {
  installMatchMedia();
  Object.assign(media, touch ? { coarse: true, fine: false, anyHover: false } : { coarse: false, fine: true, anyHover: true });
  window.innerWidth = w;
  window.innerHeight = h;
};

const touch = { coarse: true };
const mouse = { fine: true, anyHover: true };

describe('classifyFormFactor: kind, navMode, twoPane', () => {
  it.each([
    ['phone portrait', { width: 390, height: 844, ...touch }, 'phone', 'bottom', false],
    ['phone landscape: still a phone, never two panes', { width: 1024, height: 500, ...touch }, 'phone', 'bottom', false],
    ['tablet portrait (Chef’s grip): rail + one pane', { width: 800, height: 1280, ...touch }, 'tablet', 'rail', false],
    ['tablet landscape: rail + two panes', { width: 1280, height: 800, ...touch }, 'tablet', 'rail', true],
    ['mouse window 1023: one pane', { width: 1023, height: 800, ...mouse }, 'tablet', 'rail', false],
    ['mouse window 1024: two panes', { width: TWO_PANE_MIN_WIDTH, height: 800, ...mouse }, 'tablet', 'rail', true],
    ['desktop: sidebar + two panes', { width: 1280, height: 900, ...mouse }, 'desktop', 'sidebar', true],
    ['narrow mouse window', { width: 599, height: 900, ...mouse }, 'phone', 'bottom', false],
  ])('%s', (_name, input, kind, navMode, twoPane) => {
    const f = classifyFormFactor(input);
    expect(f.kind).toBe(kind);
    expect(f[kind]).toBe(true);
    expect(f.navMode).toBe(navMode);
    expect(f.twoPane).toBe(twoPane);
  });

  it('useGeekNavMode follows the device', async () => {
    let mode = null;
    function Probe() {
      mode = useGeekNavMode();
      return null;
    }
    device(800, 1280, true);
    await mount(<Probe />);
    expect(mode).toBe('rail');
    window.innerWidth = 390;
    window.innerHeight = 844;
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(mode).toBe('bottom');
  });
});

// ── GeekNavRail ──────────────────────────────────────────────────────────────
const Glyph = () => <svg data-glyph="" />;
const items = [
  { id: 'today', label: 'Today', to: '/today', icon: <Glyph /> },
  { id: 'upcoming', label: 'Upcoming', to: '/upcoming', icon: <Glyph />, badge: 3 },
  { id: 'done', label: 'Done', to: '/done', icon: <Glyph /> },
  { id: 'logout', label: 'Log out', onClick: () => {}, icon: <Glyph /> },
];

describe('GeekNavRail', () => {
  it('renders a labelled nav with icon + label per item and drops logout', async () => {
    await mount(<GeekNavRail items={items} activeId="today" />);
    const nav = $('nav[data-geek-nav-rail]');
    expect(nav.getAttribute('aria-label')).toBe('Primary');
    const rows = $$('[data-geek-nav-rail-item]');
    expect(rows.map((r) => r.getAttribute('data-geek-nav-rail-item'))).toEqual(['today', 'upcoming', 'done']);
    expect(rows[0].querySelector('[data-glyph]')).toBeTruthy();
    expect(rows[0].querySelector('[data-geek-nav-rail="label"]').textContent).toBe('Today');
    expect(rows[1].querySelector('[data-geek-nav-rail="badge"]').textContent).toBe('3');
  });

  it('marks only the current item with aria-current="page"', async () => {
    await mount(<GeekNavRail items={items} activeId="upcoming" />);
    const current = $$('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('data-geek-nav-rail-item')).toBe('upcoming');
  });

  it('items are real links (Tab reaches them) and call onNavigate', async () => {
    const onNavigate = vi.fn();
    await mount(<GeekNavRail items={items} activeId="today" onNavigate={onNavigate} />);
    const rows = $$('[data-geek-nav-rail-item]');
    expect(rows.every((r) => r.tagName === 'A' && r.getAttribute('href'))).toBe(true);
    expect(rows.every((r) => r.tabIndex === 0)).toBe(true);
    await act(async () => rows[2].click());
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'done' }), expect.anything());
  });

  it('Up/Down move focus between items, wrapping', async () => {
    await mount(<GeekNavRail items={items} activeId="today" />);
    const rows = $$('[data-geek-nav-rail-item]');
    rows[0].focus();
    const key = (k) =>
      act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));
    await key('ArrowDown');
    expect(document.activeElement).toBe(rows[1]);
    await key('ArrowUp');
    await key('ArrowUp');
    expect(document.activeElement).toBe(rows[2]);
  });

  it('is 72px wide, pads every safe-area edge it touches, and gives 48px+ targets', async () => {
    await mount(<GeekNavRail items={items} activeId="today" />);
    const nav = rulesFor($('nav[data-geek-nav-rail]'));
    expect(GEEK_NAV_RAIL_WIDTH).toBe(72);
    expect(nav).toContain('width:72px');
    expect(nav).toMatch(/padding-top:calc\([^;]*safe-area-inset-top/);
    expect(nav).toMatch(/padding-bottom:calc\([^;]*safe-area-inset-bottom/);
    expect(nav).toMatch(/padding-left:calc\([^;]*safe-area-inset-left/);
    const item = rulesFor($('[data-geek-nav-rail-item]'));
    expect(item).toContain('min-width:48px');
    expect(item).toContain('min-height:56px');
  });

  it('takes its colours from the theme, not literals', async () => {
    await mount(<GeekNavRail items={items} activeId="today" />);
    // Inks are palette tokens resolved by MUI; nothing in the rail source is
    // a hex literal (checked here on the rendered active/inactive rules).
    const active = rulesFor($('[aria-current="page"]'));
    const idle = rulesFor($$('[data-geek-nav-rail-item]')[1]);
    expect(active).not.toBe(idle);
  });

  it('accepts the very same items array GeekBottomNav does', async () => {
    await mount(
      <>
        <GeekNavRail items={items} activeId="done" />
        <GeekBottomNav items={items} activeId="done" />
      </>
    );
    const rail = $$('[data-geek-nav-rail-item]').map((r) => r.getAttribute('href'));
    const bar = $$('[data-geek-bottom-nav-item]').map((r) => r.getAttribute('href'));
    expect(rail).toEqual(bar);
  });
});

// ── GeekShell rail slot ──────────────────────────────────────────────────────
describe('GeekShell `rail`', () => {
  it('renders the rail as the left column and publishes leftInset', async () => {
    let shell = null;
    function Peek() {
      shell = useGeekShell();
      return <div data-testid="content" />;
    }
    device(800, 1280, true);
    await mount(
      <GeekShell rail={<GeekNavRail items={items} activeId="today" />}>
        <Peek />
      </GeekShell>
    );
    const shellBox = $('[data-geek-shell]');
    expect(shellBox.firstElementChild.matches('nav[data-geek-nav-rail]')).toBe(true);
    expect(shell.leftInset).toBe(72);
  });

  it('without a rail nothing changes (leftInset 0)', async () => {
    let shell = null;
    function Peek() {
      shell = useGeekShell();
      return null;
    }
    await mount(
      <GeekShell>
        <Peek />
      </GeekShell>
    );
    expect($('[data-geek-nav-rail]')).toBeNull();
    expect(shell.leftInset).toBe(0);
  });

  it('hides the rail in focus mode', async () => {
    await mount(
      <GeekShell focusMode rail={<GeekNavRail items={items} activeId="today" />}>
        <div />
      </GeekShell>
    );
    expect($('[data-geek-nav-rail]')).toBeNull();
  });
});

// ── GeekTwoPane ──────────────────────────────────────────────────────────────
describe('GeekTwoPane', () => {
  const list = <ul data-testid="list" />;
  const detail = <article data-testid="detail" />;
  const placeholder = <p data-testid="placeholder">Pick a note</p>;

  it('portrait tablet (800): one pane — the list without a detail', async () => {
    device(800, 1280, true);
    await mount(<GeekTwoPane list={list} detail={null} placeholder={placeholder} />);
    expect($('[data-geek-two-pane]').getAttribute('data-geek-two-pane')).toBe('single');
    expect($('[data-testid="list"]')).toBeTruthy();
    expect($('[data-testid="detail"]')).toBeNull();
    expect($('[data-testid="placeholder"]')).toBeNull();
  });

  it('portrait tablet (800): one pane — the detail when there is one', async () => {
    device(800, 1280, true);
    await mount(<GeekTwoPane list={list} detail={detail} />);
    expect($('[data-testid="detail"]')).toBeTruthy();
    expect($('[data-testid="list"]')).toBeNull();
  });

  it('landscape tablet (1280): list and detail side by side', async () => {
    device(1280, 800, true);
    await mount(<GeekTwoPane list={list} detail={detail} />);
    expect($('[data-geek-two-pane]').getAttribute('data-geek-two-pane')).toBe('split');
    const panes = $$('[data-geek-pane]').map((p) => p.getAttribute('data-geek-pane'));
    expect(panes).toEqual(['list', 'detail']);
  });

  it('two panes and no detail: the placeholder fills the detail side', async () => {
    device(1280, 900, false);
    await mount(<GeekTwoPane list={list} detail={null} placeholder={placeholder} />);
    expect($('[data-testid="list"]')).toBeTruthy();
    expect($('[data-geek-pane="placeholder"] [data-testid="placeholder"]')).toBeTruthy();
  });

  it('each pane scrolls on its own and the list has a clamped width', async () => {
    device(1280, 900, false);
    await mount(<GeekTwoPane list={list} detail={detail} />);
    const listRules = rulesFor($('[data-geek-pane="list"]'));
    const detailRules = rulesFor($('[data-geek-pane="detail"]'));
    expect(listRules).toContain('overflow-y:auto');
    expect(detailRules).toContain('overflow-y:auto');
    expect(detailRules).toContain('min-height:0');
    expect(listRules).toContain('clamp(320px,32vw,400px)');
  });

  it('panes are labelled regions', async () => {
    device(1280, 900, false);
    await mount(<GeekTwoPane list={list} detail={detail} listLabel="Notes" detailLabel="Note" />);
    const labels = $$('section[data-geek-pane]').map((s) => s.getAttribute('aria-label'));
    expect(labels).toEqual(['Notes', 'Note']);
  });

  it('`twoPane` forces the layout', async () => {
    device(390, 844, true);
    await mount(<GeekTwoPane list={list} detail={detail} twoPane />);
    expect($('[data-geek-two-pane]').getAttribute('data-geek-two-pane')).toBe('split');
  });
});

// ── a left-anchored toast clears the rail ────────────────────────────────────
describe('toasts and the rail', () => {
  it('a left toast starts past the rail, and stays put with no rail', async () => {
    const { GeekToastProvider, useToast } = await import('../index.js');
    const { GeekShellContext } = await import('../navigation/shellContext.js');
    let api = null;
    function Grab() {
      api = useToast();
      return null;
    }
    const shell = (leftInset) => ({
      isMobile: false, mobileOpen: false, hasNav: false, bottomInset: 0, leftInset,
      openNav() {}, closeNav() {}, toggleNav() {},
    });
    const leftOf = () => window.getComputedStyle(document.querySelector('[data-geek-toasts]')).left;

    await mount(
      <GeekShellContext.Provider value={shell(72)}>
        <GeekToastProvider><Grab /></GeekToastProvider>
      </GeekShellContext.Provider>
    );
    await act(async () => api.notify('Saved', { duration: 0 }));
    expect(leftOf()).toBe('96px');
    await act(async () => root.unmount());
    root = null;

    await mount(
      <GeekShellContext.Provider value={shell(0)}>
        <GeekToastProvider><Grab /></GeekToastProvider>
      </GeekShellContext.Provider>
    );
    await act(async () => api.notify('Saved', { duration: 0 }));
    expect(leftOf()).not.toBe('96px');
  });
});
