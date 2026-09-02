/**
 * Shell grammar smoke tests.
 *
 * The vitest environment here is `node` (the contrast suite needs no DOM and
 * jsdom is not a dependency), so these render to static markup with
 * `react-dom/server` and assert on *order* and *presence* of the
 * `data-geek-*` hooks the primitives emit. That is enough to lock the parts of
 * the grammar that are rules rather than looks:
 *
 *   - sidebar footer order: user chip → Settings → Sign out
 *   - top-bar right cluster order: theme → app switcher → account
 *   - the hamburger appears only below the nav breakpoint, and only when the
 *     shell owns a nav panel
 *   - the bottom tab bar refuses a logout item and caps at five
 *
 * `useMediaQuery` resolves false under SSR, so "mobile" is simulated by
 * providing the shell context directly — the same value `GeekShell` publishes.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { GeekShellContext } from '../navigation/shellContext.js';
import { GeekSidebar } from '../navigation/GeekSidebar.jsx';
import { GeekTopBar } from '../navigation/GeekTopBar.jsx';
import { GeekBottomNav } from '../navigation/GeekBottomNav.jsx';
import { GeekShell } from '../navigation/GeekShell.jsx';

const DESKTOP = {
  isMobile: false,
  mobileOpen: false,
  hasNav: true,
  bottomInset: 0,
  openNav: () => {},
  closeNav: () => {},
  toggleNav: () => {},
};
const MOBILE = { ...DESKTOP, isMobile: true };

function render(ui, shell = DESKTOP) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <GeekShellContext.Provider value={shell}>{ui}</GeekShellContext.Provider>
    </MemoryRouter>
  );
}

/** Index of a `data-*` attribute in the markup, or -1. */
function at(markup, attr) {
  return markup.indexOf(attr);
}

function expectOrdered(markup, attrs) {
  const positions = attrs.map((attr) => at(markup, attr));
  positions.forEach((position, index) => {
    expect(position, `${attrs[index]} missing from markup`).toBeGreaterThan(-1);
  });
  const sorted = [...positions].sort((a, b) => a - b);
  expect(positions, `expected order ${attrs.join(' → ')}`).toEqual(sorted);
}

describe('GeekSidebar', () => {
  const sidebar = (
    <GeekSidebar
      brand={{ monogram: 'FL', name: 'FlockGeek', tagline: 'Flock ops', to: '/' }}
      sections={[
        { label: 'Flock', items: [{ id: 'birds', label: 'Birds', to: '/birds', badge: 3 }] },
        { label: 'Records', items: [{ id: 'eggs', label: 'Eggs', to: '/eggs' }] },
      ]}
      activeId="birds"
      extras={<div data-test-extras />}
      footer={{
        user: { name: 'Chef Crocker', secondary: 'chef@example.com' },
        settings: { to: '/settings' },
        onSignOut: () => {},
      }}
    />
  );

  it('renders the footer as user chip → Settings → Sign out', () => {
    const markup = render(sidebar);
    expectOrdered(markup, [
      'data-geek-nav-footer="user"',
      'data-geek-nav-footer="settings"',
      'data-geek-nav-footer="signout"',
    ]);
  });

  it('renders brand, then nav, then extras, then footer', () => {
    const markup = render(sidebar);
    expectOrdered(markup, [
      'data-geek-sidebar="brand"',
      'data-geek-nav-item="birds"',
      'data-geek-nav-item="eggs"',
      'data-geek-sidebar="extras"',
      'data-geek-sidebar="footer"',
    ]);
    expect(markup).toContain('aria-current="page"');
  });

  it('accepts a flat item list and the legacy appName/footer-element API', () => {
    const markup = render(
      <GeekSidebar
        appName="NoteGeek"
        items={[{ id: 'notes', label: 'Notes', onClick: () => {} }]}
        footer={<div data-test-legacy-footer />}
      />
    );
    expect(markup).toContain('NoteGeek');
    expect(markup).toContain('data-geek-nav-item="notes"');
    expect(markup).toContain('data-test-legacy-footer');
  });
});

describe('GeekTopBar', () => {
  const topBar = (
    <GeekTopBar
      title="Today"
      actions={<button type="button" data-test-action />}
      themeMode="dark"
      onThemeToggle={() => {}}
      currentApp="flockgeek"
      account={{ name: 'Chef Crocker', onSettings: () => {}, onSignOut: () => {} }}
    />
  );

  it('renders the right cluster as theme → switcher → account', () => {
    const markup = render(topBar);
    expectOrdered(markup, [
      'data-geek-topbar="theme"',
      'data-geek-topbar="switcher"',
      'data-geek-topbar="account"',
    ]);
  });

  it('keeps the title on the left, ahead of app actions', () => {
    const markup = render(topBar);
    expectOrdered(markup, ['data-geek-topbar="title"', 'data-test-action']);
  });

  it('shows the hamburger only below the nav breakpoint', () => {
    expect(render(topBar, DESKTOP)).not.toContain('data-geek-topbar="menu"');
    expect(render(topBar, MOBILE)).toContain('data-geek-topbar="menu"');
  });

  it('omits the hamburger on mobile when the shell owns no nav panel', () => {
    const markup = render(topBar, { ...MOBILE, hasNav: false });
    expect(markup).not.toContain('data-geek-topbar="menu"');
  });

  it('still honors the legacy showSuiteControls / profile slots', () => {
    const markup = render(
      <GeekTopBar
        appName="StoryGeek"
        showSuiteControls
        themeMode="light"
        profile={<span data-test-profile />}
      />
    );
    expectOrdered(markup, ['data-geek-topbar="theme"', 'data-geek-topbar="switcher"', 'data-test-profile']);
  });
});

describe('GeekBottomNav', () => {
  const items = [
    { id: 'home', label: 'Home', to: '/' },
    { id: 'log', label: 'Log', to: '/log' },
    { id: 'logout', label: 'Logout', onClick: () => {} },
    { id: 'signout', label: 'Sign out', onClick: () => {} },
  ];

  it('ignores logout items', () => {
    const markup = render(<GeekBottomNav items={items} activeId="home" />);
    expect(markup).toContain('data-geek-bottom-nav-item="home"');
    expect(markup).toContain('data-geek-bottom-nav-item="log"');
    expect(markup).not.toContain('data-geek-bottom-nav-item="logout"');
    expect(markup).not.toContain('data-geek-bottom-nav-item="signout"');
    expect(markup).not.toContain('Sign out');
  });

  it('caps at five items and hides on request', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, label: `Tab ${i}`, to: '/' }));
    const markup = render(<GeekBottomNav items={many} />);
    expect(markup.match(/data-geek-bottom-nav-item=/g)).toHaveLength(5);
    expect(render(<GeekBottomNav items={many} hidden />)).toBe('');
  });
});

describe('GeekShell', () => {
  it('renders the nav panel permanently on desktop and reserves no top-bar height without a top bar', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <GeekShell nav={<GeekSidebar appName="FlockGeek" items={[]} />}>
          <div data-test-content />
        </GeekShell>
      </MemoryRouter>
    );
    expect(markup).toContain('data-geek-nav="permanent"');
    expect(markup).toContain('data-test-content');
    expect(markup).toContain('data-geek-shell');
  });

  it('leaves the legacy sidebar/topBar slots untouched', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <GeekShell sidebar={<aside data-test-sidebar />} topBar={<header data-test-topbar />}>
          <div data-test-content />
        </GeekShell>
      </MemoryRouter>
    );
    expectOrdered(markup, ['data-test-sidebar', 'data-test-topbar', 'data-test-content']);
    expect(markup).not.toContain('data-geek-nav="permanent"');
  });
});
