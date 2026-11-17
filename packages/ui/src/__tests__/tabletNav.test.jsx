// @vitest-environment jsdom
/**
 * One items array → the right navigation per device (tablet baseline "Fix
 * first" 1, plan P2a), and GeekShell not fighting it at 800 px.
 *
 * The matchMedia here reads the query (helpers/viewport.js), so MUI's
 * `md` breakpoint (`isMobile` in GeekShell and GeekTopBar) and the pointer
 * queries behind `useFormFactor` answer for the SAME viewport — the harness
 * sizes: 390x844 phone, 800x1280 and 1280x800 touch tablet, 1440x900 desktop.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { GeekBottomNav, GeekNavRail, GeekShell, GeekSidebar, GeekTopBar, useGeekNavSlots, useGeekShell } from '../index.js';
import { ThemeProvider, decomposeColor } from '@mui/material/styles';
import { createGeekSuiteTheme } from '../createGeekSuiteTheme.js';
import { railCurrentInk } from '../navigation/sidebarInk.js';
import { VIEWPORTS, setViewport } from './helpers/viewport.js';

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
// The temporary drawer portals to <body>, so look in the whole document.
const $ = (sel) => document.querySelector(sel);

const items = [
  { id: 'today', label: 'Today', icon: <span />, to: '/today' },
  { id: 'upcoming', label: 'Upcoming', icon: <span />, to: '/upcoming' },
  { id: 'done', label: 'Done', icon: <span />, to: '/done' },
];

let seenMode = null;
let seenShell = null;
function Peek() {
  seenShell = useGeekShell();
  return <div data-testid="page" />;
}
function App({ phoneDrawer = false, navMode, hidden }) {
  const { navMode: mode, ...slots } = useGeekNavSlots({ items, activeId: 'today', phoneDrawer, navMode, hidden });
  seenMode = mode;
  return (
    <GeekShell {...slots} topBar={<GeekTopBar title="Todo" />}>
      <Peek />
    </GeekShell>
  );
}

const chrome = () => ({
  rail: Boolean($('nav[data-geek-nav-rail]')),
  bottom: Boolean($('[data-geek-bottom-nav]')),
  sidebar: $('[data-geek-nav]')?.getAttribute('data-geek-nav') ?? null,
  hamburger: Boolean($('[data-geek-topbar="menu"]')),
});

describe('useGeekNavSlots + GeekShell at the harness viewports', () => {
  it('390x844 phone: bottom bar only — no rail, no sidebar, no hamburger', async () => {
    setViewport(VIEWPORTS.phone);
    await mount(<App />);
    expect(seenMode).toBe('bottom');
    expect(chrome()).toEqual({ rail: false, bottom: true, sidebar: null, hamburger: false });
    expect(seenShell.bottomInset).toBe(56);
  });

  it('390x844 phone with phoneDrawer: bottom bar plus the hamburger drawer', async () => {
    setViewport(VIEWPORTS.phone);
    await mount(<App phoneDrawer />);
    expect(chrome()).toEqual({ rail: false, bottom: true, sidebar: 'temporary', hamburger: true });
  });

  it('800x1280 portrait tablet: the rail — no hamburger, no bottom bar, no sidebar', async () => {
    setViewport(VIEWPORTS.tabletPortrait);
    await mount(<App phoneDrawer />);
    expect(seenMode).toBe('rail');
    // The md breakpoint still calls 800 "mobile"; the rail must win anyway.
    expect(seenShell.isMobile).toBe(true);
    expect(chrome()).toEqual({ rail: true, bottom: false, sidebar: null, hamburger: false });
    expect(seenShell.leftInset).toBe(72);
    expect(seenShell.bottomInset).toBe(0);
    expect($('[data-geek-nav-rail-item="today"]').getAttribute('aria-current')).toBe('page');
  });

  it('1280x800 landscape touch tablet: still the rail', async () => {
    setViewport(VIEWPORTS.tabletLandscape);
    await mount(<App />);
    expect(seenMode).toBe('rail');
    expect(chrome()).toEqual({ rail: true, bottom: false, sidebar: null, hamburger: false });
  });

  it('1440x900 desktop: the permanent sidebar — no rail, no bottom bar, no hamburger', async () => {
    setViewport(VIEWPORTS.desktop);
    await mount(<App />);
    expect(seenMode).toBe('sidebar');
    expect(chrome()).toEqual({ rail: false, bottom: false, sidebar: 'permanent', hamburger: false });
    expect($('[data-geek-nav="permanent"] [data-geek-sidebar-item="today"], [data-geek-nav="permanent"] a[href="/today"]')).not.toBeNull();
  });

  it('the same items reach every surface', async () => {
    const hrefs = async (vp, sel) => {
      setViewport(vp);
      await mount(<App />);
      const out = [...document.querySelectorAll(sel)].map((a) => a.getAttribute('href'));
      await act(async () => root.unmount());
      host.remove();
      root = null;
      return out;
    };
    const rail = await hrefs(VIEWPORTS.tabletPortrait, '[data-geek-nav-rail-item]');
    const bar = await hrefs(VIEWPORTS.phone, '[data-geek-bottom-nav-item]');
    const side = await hrefs(VIEWPORTS.desktop, '[data-geek-nav="permanent"] a[href]');
    expect(rail).toEqual(['/today', '/upcoming', '/done']);
    expect(bar).toEqual(rail);
    expect(side).toEqual(rail);
  });

  it('`navMode` forces a surface and `hidden` draws none', async () => {
    setViewport(VIEWPORTS.desktop);
    await mount(<App navMode="rail" />);
    expect(chrome().rail).toBe(true);
    expect(chrome().sidebar).toBe(null);
    await act(async () => root.render(<MemoryRouter><App hidden /></MemoryRouter>));
    expect(chrome()).toEqual({ rail: false, bottom: false, sidebar: null, hamburger: false });
  });
});

describe('GeekShell: a rail is the primary navigation while it shows', () => {
  const everything = (props) => (
    <GeekShell
      nav={<GeekSidebar items={items} activeId="today" />}
      rail={<GeekNavRail items={items} activeId="today" />}
      bottomNav={<GeekBottomNav items={items} activeId="today" />}
      topBar={<GeekTopBar title="Todo" />}
      {...props}
    >
      <Peek />
    </GeekShell>
  );

  it('800x1280 with nav + rail + bottomNav all passed: only the rail — no drawer, hamburger or tab bar', async () => {
    setViewport(VIEWPORTS.tabletPortrait);
    await mount(everything());
    expect(chrome()).toEqual({ rail: true, bottom: false, sidebar: null, hamburger: false });
    expect(seenShell.hasNav).toBe(false);
    expect(seenShell.bottomInset).toBe(0);
  });

  it('1440x900 with nav + rail: the rail replaces the permanent sidebar', async () => {
    setViewport(VIEWPORTS.desktop);
    await mount(everything({ bottomNav: null }));
    expect(chrome()).toEqual({ rail: true, bottom: false, sidebar: null, hamburger: false });
  });

  it('without a rail, 800 px keeps today’s behaviour: drawer, hamburger and tab bar', async () => {
    setViewport(VIEWPORTS.tabletPortrait);
    await mount(everything({ rail: undefined }));
    expect(chrome()).toEqual({ rail: false, bottom: true, sidebar: 'temporary', hamburger: true });
  });

  it('in focus mode the rail hides and nav/bottomNav follow focus mode as before', async () => {
    setViewport(VIEWPORTS.tabletPortrait);
    await mount(everything({ focusMode: true }));
    expect(chrome()).toEqual({ rail: false, bottom: false, sidebar: null, hamburger: false });
    expect(seenShell.hasNav).toBe(true);
  });
});

describe("GeekNavRail's current item is painted the measured ink", () => {
  // The suite default in dark: the accent alone is 3.67:1 on the paper (2026-11-16).
  it('the current label is railCurrentInk, not the bare accent, where the accent falls short', async () => {
    const theme = createGeekSuiteTheme({ mode: 'dark' });
    const ink = railCurrentInk(theme);
    expect(ink).not.toBe(theme.palette.primary.main);
    await mount(
      <ThemeProvider theme={theme}>
        <GeekNavRail items={items} activeId="today" />
      </ThemeProvider>
    );
    const rgb = (c) => decomposeColor(c).values.slice(0, 3).map(Math.round).join(',');
    const painted = window.getComputedStyle($('[data-geek-nav-rail-item="today"]')).color;
    expect(rgb(painted)).toBe(rgb(ink));
    expect(rgb(painted)).not.toBe(rgb(theme.palette.primary.main));
  });
});
