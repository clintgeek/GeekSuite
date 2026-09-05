/**
 * GeekFab smoke tests (MOBILE_UI_PLAN.md §2 "New primitives").
 *
 * Same constraints as `navigation.test.jsx`: `node` environment, so these
 * render to static markup with `react-dom/server` and assert on the
 * `data-geek-*` hook and literal emotion CSS text rather than computed
 * styles or a real viewport. `useMediaQuery`/actual breakpoint matching
 * never runs under SSR, so "mobile-only" is proven by asserting the *rule
 * text* a real browser would apply (a `@media (min-width:900px)` block that
 * sets `display:none`), not by simulating a viewport width.
 *
 * No `ThemeProvider` here, matching `navigation.test.jsx` — the primitives
 * read `theme.shadows`/`theme.zIndex`/`theme.transitions` off MUI's default
 * theme (`useTheme()`'s SSR fallback), so the assertions below hold with or
 * without a wrapping `ThemeProvider`.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { GeekShellContext } from '../navigation/shellContext.js';
import { GeekFab } from '../surfaces/GeekFab.jsx';
import { FocusModeProvider } from '../focus/index.js';

const SHELL = {
  isMobile: false,
  mobileOpen: false,
  hasNav: false,
  bottomInset: 0,
  openNav: () => {},
  closeNav: () => {},
  toggleNav: () => {},
};

function render(ui, shell = SHELL) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <GeekShellContext.Provider value={shell}>{ui}</GeekShellContext.Provider>
    </MemoryRouter>
  );
}

describe('GeekFab', () => {
  it('renders the root hook as "icon" by default, with the label as aria-label', () => {
    const markup = render(<GeekFab label="Add book" />);
    expect(markup).toContain('data-geek-fab="icon"');
    expect(markup).toContain('aria-label="Add book"');
  });

  it('insets above the shell bottom nav and honors the safe area', () => {
    const markup = render(<GeekFab label="Add book" />, { ...SHELL, bottomInset: 56 });
    expect(markup).toContain('56px');
    expect(markup).toContain('env(safe-area-inset-bottom)');
    // The literal formula from the spec: 16px pad + shell inset + safe area.
    expect(markup).toContain('calc(16px + 56px + env(safe-area-inset-bottom))');
  });

  it('an explicit bottomInset overrides the shell value', () => {
    const markup = render(
      <GeekFab label="Add book" bottomInset={80} />,
      { ...SHELL, bottomInset: 56 }
    );
    expect(markup).toContain('calc(16px + 80px + env(safe-area-inset-bottom))');
  });

  it('hides at the nav breakpoint by default, but not with showOn="always"', () => {
    const mobileOnly = render(<GeekFab label="Add book" />);
    expect(mobileOnly).toContain('@media (min-width:900px)');
    // The hiding rule specifically, not just any 900px media query.
    expect(mobileOnly).toMatch(/@media \(min-width:900px\)\{\.[\w-]+\{display:none;?\}/);

    const always = render(<GeekFab label="Add book" showOn="always" />);
    expect(always).not.toContain('@media (min-width:900px)');
  });

  it('renders the label text and the "extended" hook when extended', () => {
    const markup = render(<GeekFab label="Add book" extended />);
    expect(markup).toContain('data-geek-fab="extended"');
    expect(markup).toContain('Add book');
  });

  it('renders nothing when hidden', () => {
    expect(render(<GeekFab label="Add book" hidden />)).toBe('');
  });

  it('renders nothing when focus mode is forced on via FocusModeProvider', () => {
    // FocusModeProvider takes a `defaultFocusMode` initial value (there is no
    // separate "forced" prop); with no `storageKey` and no `window` under
    // this `node` environment, the initializer can't read localStorage, so
    // `defaultFocusMode` is exactly what `focusMode` resolves to for this render.
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <GeekShellContext.Provider value={SHELL}>
          <FocusModeProvider defaultFocusMode>
            <GeekFab label="Add book" />
          </FocusModeProvider>
        </GeekShellContext.Provider>
      </MemoryRouter>
    );
    expect(markup).toBe('');
  });
});
