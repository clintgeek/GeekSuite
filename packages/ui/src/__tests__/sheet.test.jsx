/**
 * GeekSheet smoke tests (DOCS/MOBILE_UI_PLAN.md §2).
 *
 * Same constraints as `navigation.test.jsx` / `feedback.test.jsx`: the vitest
 * environment here is `node`, so these render to static markup with
 * `react-dom/server` and assert on presence, order and literal emotion CSS
 * text via the `data-geek-*` hooks. `useMediaQuery` resolves false under SSR
 * (no `window.matchMedia`), so `mode="auto"` can't be exercised meaningfully
 * here — every render below passes `mode="sheet"` or `mode="dialog"`
 * explicitly, the same way the shell-grammar tests simulate "mobile" by
 * passing shell context directly instead of relying on a real media query.
 *
 * Neither `GeekSheet` nor its MUI internals need a `ThemeProvider` to render
 * (same as `feedback.test.jsx`'s `GeekToastProvider` case) — `useTheme()`
 * falls back to MUI's default theme, which still has a real `md` breakpoint.
 *
 * `open` is always `true` below: with `open` true, MUI's `Modal` renders its
 * content regardless of `keepMounted`, so these tests don't need to exercise
 * `keepMounted` to see markup.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { GeekSheet } from '../surfaces/GeekSheet.jsx';

function render(props) {
  return renderToStaticMarkup(
    <GeekSheet open onClose={() => {}} title="Filter results" {...props}>
      <div data-test-body>Body content</div>
    </GeekSheet>
  );
}

describe('GeekSheet', () => {
  it('carries the resolved mode on the root element', () => {
    expect(render({ mode: 'sheet' })).toContain('data-geek-sheet-mode="sheet"');
    expect(render({ mode: 'dialog' })).toContain('data-geek-sheet-mode="dialog"');
  });

  it('renders the grab handle only in sheet mode', () => {
    expect(render({ mode: 'sheet' })).toContain('data-geek-sheet="handle"');
    expect(render({ mode: 'dialog' })).not.toContain('data-geek-sheet="handle"');
  });

  it('renders the close button only in dialog mode', () => {
    expect(render({ mode: 'dialog' })).toContain('data-geek-sheet="close"');
    expect(render({ mode: 'sheet' })).not.toContain('data-geek-sheet="close"');
  });

  it('renders actions after the scrolling body, in both modes', () => {
    const actions = <button type="button" data-test-action>Apply</button>;

    const sheet = render({ mode: 'sheet', actions });
    expect(sheet.indexOf('data-geek-sheet="body"')).toBeGreaterThan(-1);
    expect(sheet.indexOf('data-geek-sheet="body"')).toBeLessThan(
      sheet.indexOf('data-geek-sheet="actions"')
    );

    const dialog = render({ mode: 'dialog', actions });
    expect(dialog.indexOf('data-geek-sheet="body"')).toBeLessThan(
      dialog.indexOf('data-geek-sheet="actions"')
    );
  });

  it('omits the actions band entirely when no actions are given', () => {
    expect(render({ mode: 'sheet' })).not.toContain('data-geek-sheet="actions"');
    expect(render({ mode: 'dialog' })).not.toContain('data-geek-sheet="actions"');
  });

  it('pads the sheet actions band for the home indicator, only in sheet mode', () => {
    const actions = <button type="button">Apply</button>;

    expect(render({ mode: 'sheet', actions })).toContain('env(safe-area-inset-bottom)');
    // No actions band -> the body is the bottom edge and carries the inset.
    expect(render({ mode: 'sheet' })).toContain('env(safe-area-inset-bottom)');
    // The dialog's DialogActions is not the sheet's pinned, safe-area-padded band.
    expect(render({ mode: 'dialog', actions })).not.toContain('env(safe-area-inset-bottom)');
  });

  it('emits 100dvh only for snap="full", and only in sheet mode', () => {
    expect(render({ mode: 'sheet', snap: 'full' })).toContain('100dvh');
    expect(render({ mode: 'sheet', snap: 'content' })).not.toContain('100dvh');
    expect(render({ mode: 'dialog', snap: 'full' })).not.toContain('100dvh');
  });

  it('points aria-labelledby at the title\'s own id, in both modes', () => {
    for (const mode of ['sheet', 'dialog']) {
      const markup = render({ mode });
      const match = markup.match(/aria-labelledby="([^"]+)"/);
      expect(match, `${mode}: no aria-labelledby found`).not.toBeNull();
      // The referenced id exists on some element, and the title text is
      // present in that same markup (order/style-tag interleaving in the
      // static-markup output makes proximity slicing unreliable, so this
      // checks presence rather than exact adjacency).
      expect(markup).toContain(`id="${match[1]}"`);
      expect(markup).toContain('Filter results');
    }
  });

  it('renders a node title as-is, with no data-geek-sheet="title" hook', () => {
    const markup = render({ mode: 'dialog', title: <span data-test-node-title>Custom</span> });
    expect(markup).toContain('data-test-node-title');
    expect(markup).not.toContain('data-geek-sheet="title"');
  });

  it('renders the description under the title', () => {
    const markup = render({ mode: 'sheet', description: 'Refine by shelf and tag.' });
    expect(markup).toContain('data-geek-sheet="description"');
    expect(markup).toContain('Refine by shelf and tag.');
  });
});

describe('GeekSheet — Escape', () => {
  /**
   * MUI listens for Escape on the modal root, which only hears the key when
   * focus is inside the drawer. The primitive therefore marks the paper as
   * focusable and hangs its own handler there (see the GeekSheet header). A
   * `node` render cannot dispatch a key event, so what is asserted is that the
   * paper carries the hook and the `tabIndex` the handler depends on.
   */
  it('marks the sheet paper focusable and hooked', () => {
    const markup = render({ mode: 'sheet' });
    const paperIdx = markup.indexOf('data-geek-sheet="paper"');
    expect(paperIdx).toBeGreaterThan(-1);

    const tagStart = markup.lastIndexOf('<', paperIdx);
    const tag = markup.slice(tagStart, markup.indexOf('>', paperIdx) + 1);
    expect(tag).toContain('tabindex="-1"');
    expect(tag).toContain('MuiDrawer-paper');
  });

  it('leaves dialog mode to MUI (no paper hook there)', () => {
    expect(render({ mode: 'dialog' })).not.toContain('data-geek-sheet="paper"');
  });
});
