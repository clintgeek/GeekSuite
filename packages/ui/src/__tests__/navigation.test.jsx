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
 *   - a node `brand` gets the same 60px block sizing as the object form, and
 *     `brandSx` / `footerSx` merge last over `chromeSx` on their own band
 *   - the brand monogram carries its `data-geek-sidebar="monogram"` hook and
 *     `monogramSx`
 *   - the footer Settings row is `selected` from `activeId` alone (default id
 *     `'settings'`, or `settings.id`/`settings.to`, or an explicit
 *     `settings.selected`)
 *
 * `@mui/material`'s styled-engine has no DOM to insert into under this `node`
 * environment, so it renders each rule's `<style>` tag inline as part of the
 * static markup instead — that is what lets these tests assert on literal
 * CSS text (e.g. `toContain('height:42px')`) without `@emotion/server`.
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

/**
 * The class list of the element whose opening tag contains `attr`. MUI's own
 * stylesheet always emits a `.Mui-selected` rule for any `ListItemButton` —
 * selected or not — so a plain `markup.includes('Mui-selected')` proves
 * nothing; the class must be read off the element's own `class` attribute.
 */
function classesFor(markup, attr) {
  const idx = markup.indexOf(attr);
  if (idx === -1) return [];
  const tagStart = markup.lastIndexOf('<', idx);
  const tagEnd = markup.indexOf('>', idx);
  const match = markup.slice(tagStart, tagEnd + 1).match(/class="([^"]*)"/);
  return match ? match[1].split(' ') : [];
}

/** The emotion CSS rule text for the element whose opening tag contains `attr`. */
function ruleFor(markup, attr) {
  const cls = classesFor(markup, attr).find((c) => c.startsWith('css-'));
  if (!cls) return '';
  const idx = markup.indexOf(`.${cls}{`);
  if (idx === -1) return '';
  return markup.slice(idx, markup.indexOf('}', idx) + 1);
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

  it('gives a node brand the same 60px block sizing as the object form, with brandSx merged last over chromeSx', () => {
    const markup = render(
      <GeekSidebar
        brand={<div data-test-node-brand>Custom brand</div>}
        chromeSx={{ height: '999px' }}
        brandSx={{ height: '42px' }}
        items={[]}
      />
    );
    expect(markup).toContain('data-test-node-brand');
    // blockSx sizes it to topBarHeight before chromeSx/brandSx are spread on —
    // brandSx wins the override race, chromeSx's conflicting value never ships.
    expect(markup).toContain('height:42px');
    expect(markup).not.toContain('height:999px');
    expect(markup).toContain('flex-shrink:0');
  });

  it('merges footerSx onto the footer band, over chromeSx', () => {
    const markup = render(
      <GeekSidebar
        items={[]}
        chromeSx={{ paddingTop: '1px' }}
        footerSx={{ paddingTop: '13px' }}
        footer={{ settings: { to: '/settings' }, onSignOut: () => {} }}
      />
    );
    expect(markup).toContain('data-geek-sidebar="footer"');
    expect(markup).toContain('padding-top:13px');
    expect(markup).not.toContain('padding-top:1px');
  });

  it('exposes the monogram as a hook with monogramSx merged in last', () => {
    const markup = render(
      <GeekSidebar
        brand={{ monogram: 'FL', name: 'FlockGeek', monogramSx: { borderRadius: '3px' } }}
        items={[]}
      />
    );
    expect(markup).toContain('data-geek-sidebar="monogram"');
    expect(markup).toContain('border-radius:3px');
  });

  it('selects the footer Settings row from activeId only, since the sidebar has no router', () => {
    const settingsAttr = 'data-geek-nav-footer="settings"';

    const notSelected = render(
      <GeekSidebar
        items={[]}
        activeId="birds"
        footer={{ settings: { to: '/settings' }, onSignOut: () => {} }}
      />
    );
    expect(classesFor(notSelected, settingsAttr)).not.toContain('Mui-selected');

    // Default id ('settings') matches activeId.
    const byDefaultId = render(
      <GeekSidebar
        items={[]}
        activeId="settings"
        footer={{ settings: { to: '/settings' }, onSignOut: () => {} }}
      />
    );
    expect(classesFor(byDefaultId, settingsAttr)).toContain('Mui-selected');
    expect(byDefaultId).toContain('aria-current="page"');

    // Explicit settings.id matches activeId.
    const byExplicitId = render(
      <GeekSidebar
        items={[]}
        activeId="prefs"
        footer={{ settings: { to: '/other', id: 'prefs' }, onSignOut: () => {} }}
      />
    );
    expect(classesFor(byExplicitId, settingsAttr)).toContain('Mui-selected');

    // Explicit settings.selected overrides regardless of activeId.
    const byExplicitFlag = render(
      <GeekSidebar
        items={[]}
        activeId="birds"
        footer={{ settings: { to: '/settings', selected: true }, onSignOut: () => {} }}
      />
    );
    expect(classesFor(byExplicitFlag, settingsAttr)).toContain('Mui-selected');
  });

  it('renders the footer user chip as a link when `to` is given', () => {
    const markup = render(
      <GeekSidebar
        items={[]}
        footer={{ user: { name: 'Chef Crocker', to: '/account' }, onSignOut: () => {} }}
      />
    );
    const idx = markup.indexOf('data-geek-nav-footer="user"');
    expect(idx).toBeGreaterThan(-1);
    const tagStart = markup.lastIndexOf('<', idx);
    const tagName = markup.slice(tagStart + 1, markup.indexOf(' ', tagStart));
    expect(tagName).toBe('a');
    expect(markup).toContain('href="/account"');
  });

  it('renders the footer user chip as a plain box with no to/href/onClick', () => {
    const markup = render(
      <GeekSidebar items={[]} footer={{ user: { name: 'Chef Crocker' }, onSignOut: () => {} }} />
    );
    const idx = markup.indexOf('data-geek-nav-footer="user"');
    expect(idx).toBeGreaterThan(-1);
    const tagStart = markup.lastIndexOf('<', idx);
    const tagName = markup.slice(tagStart + 1, markup.indexOf(' ', tagStart));
    expect(tagName).toBe('div');
  });

  it('applies sectionLabelSx and a data hook to section captions', () => {
    const markup = render(
      <GeekSidebar
        sections={[{ label: 'Flock', items: [{ id: 'birds', label: 'Birds', to: '/birds' }] }]}
        sectionLabelSx={{ paddingBottom: '7px' }}
      />
    );
    expect(markup).toContain('data-geek-sidebar="section-label"');
    expect(markup).toContain('padding-bottom:7px');
  });

  it('suppresses a zero badge by default but renders it with badgeProps.showZero', () => {
    const suppressed = render(
      <GeekSidebar items={[{ id: 'birds', label: 'Birds', to: '/birds', badge: 0 }]} />
    );
    expect(suppressed).not.toContain('data-geek-sidebar="badge"');

    const shown = render(
      <GeekSidebar
        items={[
          { id: 'birds', label: 'Birds', to: '/birds', badge: 0, badgeProps: { showZero: true } },
        ]}
      />
    );
    expect(shown).toContain('data-geek-sidebar="badge"');
    expect(shown).toContain('>0<');
  });

  it('floats extras directly under the nav by default and lets extrasGrow take the remaining height', () => {
    const sections = [{ items: [{ id: 'a', label: 'A', onClick: () => {} }] }];
    const fixed = renderToStaticMarkup(
      <GeekSidebar sections={sections} extras={<div data-test-extras />} />
    );
    const grown = renderToStaticMarkup(
      <GeekSidebar sections={sections} extras={<div data-test-extras />} extrasGrow />
    );
    // One scroll body wraps sections + extras; default extras are content-sized.
    expect(fixed).toContain('data-geek-sidebar="body"');
    expect(ruleFor(fixed, 'data-geek-sidebar="extras"')).toContain('flex:0 0 auto');
    expect(fixed).not.toContain('max-height:40%');
    // With extrasGrow the extras box becomes the flex:1 scroll region.
    expect(ruleFor(grown, 'data-geek-sidebar="extras"')).toContain('flex:1');
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

  it('renders an Account row above Settings when onAccount is set, with accountLabel', () => {
    const markup = render(
      <GeekTopBar
        account={{
          name: 'Chef Crocker',
          onAccount: () => {},
          onSettings: () => {},
          onSignOut: () => {},
          accountLabel: 'My Account',
        }}
      />
    );
    expectOrdered(markup, ['data-geek-topbar-menu="account"', 'data-geek-topbar-menu="settings"']);
    expect(markup).toContain('My Account');
  });

  it('renders object-form extraItems as menu rows, and still renders raw nodes for back-compat', () => {
    const markup = render(
      <GeekTopBar
        account={{
          name: 'Chef Crocker',
          onSettings: () => {},
          onSignOut: () => {},
          extraItems: [
            { id: 'billing', label: 'Billing', onClick: () => {} },
            <div key="raw" data-test-raw-extra />,
          ],
        }}
      />
    );
    expect(markup).toContain('data-geek-topbar-menu="billing"');
    expect(markup).toContain('Billing');
    expect(markup).toContain('data-test-raw-extra');
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

describe('mobile grammar (DOCS/MOBILE_UI_PLAN.md §2)', () => {
  it('sizes the shell in dvh where supported, with vh as the fallback', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <GeekShell nav={<GeekSidebar appName="BookGeek" items={[]} />} topBar={<header data-test-topbar />}>
          <div data-test-content />
        </GeekShell>
      </MemoryRouter>
    );
    expect(markup).toContain('height:100vh');
    expect(markup).toContain('@supports (height: 100dvh)');
    expect(markup).toContain('height:100dvh');
    expect(markup).toContain('calc(100dvh - 60px)');
  });

  it('pads the bottom nav by the safe-area inset and merges labelSx onto the caption', () => {
    const markup = render(
      <GeekBottomNav
        items={[{ id: 'home', label: 'Home', to: '/' }]}
        activeId="home"
        labelSx={{ letterSpacing: '0.12em' }}
      />
    );
    expect(ruleFor(markup, 'data-geek-bottom-nav')).toContain('env(safe-area-inset-bottom, 0px)');
    expect(ruleFor(markup, 'data-geek-bottom-nav')).toContain('height:56px');
    expect(ruleFor(markup, 'data-geek-bottom-nav-label')).toContain('letter-spacing:0.12em');
  });

  it('pads the top bar by the top safe-area inset', () => {
    const markup = render(<GeekTopBar title="Library" />, MOBILE);
    expect(markup).toContain('env(safe-area-inset-top, 0px)');
  });
});

describe('GeekTopBar compact below the nav breakpoint', () => {
  const account = { name: 'Chef Crocker', onSignOut: () => {} };
  const bar = (
    <GeekTopBar
      title="Library"
      themeMode="dark"
      onThemeToggle={() => {}}
      currentApp="bookgeek"
      actions={[<button key="a" data-test-action="add" />, <button key="b" data-test-action="merge" />]}
      account={account}
    />
  );

  it('keeps every control on desktop', () => {
    const markup = render(bar, DESKTOP);
    expect(markup).toContain('data-geek-topbar="theme"');
    expect(markup).toContain('data-test-action="add"');
    expect(markup).toContain('data-test-action="merge"');
    expect(markup).not.toContain('data-geek-topbar-menu="theme"');
  });

  it('folds the theme toggle into the account menu and keeps one action on mobile', () => {
    const markup = render(bar, MOBILE);
    expect(markup).not.toContain('data-geek-topbar="theme"');
    expect(markup).toContain('data-geek-topbar-menu="theme"');
    expect(markup).toContain('Light mode');
    expect(markup).toContain('data-geek-topbar="switcher"');
    expect(markup).toContain('data-test-action="add"');
    expect(markup).not.toContain('data-test-action="merge"');
    expectOrdered(markup, [
      'data-geek-topbar="menu"',
      'data-geek-topbar="title"',
      'data-test-action="add"',
      'data-geek-topbar="switcher"',
      'data-geek-topbar="account"',
    ]);
  });

  it('honors mobileActions, including null for none', () => {
    const chosen = render(
      <GeekTopBar title="T" actions={<button data-test-action="add" />} mobileActions={<button data-test-action="search" />} />,
      MOBILE
    );
    expect(chosen).toContain('data-test-action="search"');
    expect(chosen).not.toContain('data-test-action="add"');
    const none = render(<GeekTopBar title="T" actions={<button data-test-action="add" />} mobileActions={null} />, MOBILE);
    expect(none).not.toContain('data-test-action="add"');
  });

  it('keeps the theme toggle visible on mobile when there is no account menu to fold into', () => {
    const markup = render(<GeekTopBar title="T" themeMode="light" onThemeToggle={() => {}} />, MOBILE);
    expect(markup).toContain('data-geek-topbar="theme"');
  });
});
