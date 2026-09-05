/**
 * GeekDialog smoke tests.
 *
 * Same constraints as `navigation.test.jsx` / `feedback.test.jsx`: the vitest
 * environment is `node`, so these render to static markup with
 * `react-dom/server` and assert on presence, order and the `data-geek-*`
 * hooks. No `ThemeProvider` wrapper is needed — none of the existing suites
 * in this package use one, and MUI's default theme supplies everything these
 * assertions touch (the `h3` typography variant, breakpoints, `divider`).
 *
 * What is locked here is the rule, not the look:
 *
 *   - `mode="full"` / `mode="window"` set `data-geek-dialog-mode` and pick the
 *     header-vs-DialogActions layout;
 *   - full mode orders close → title → primary and never renders
 *     `data-geek-dialog="actions"`;
 *   - window mode orders secondary before primary inside
 *     `data-geek-dialog="actions"`, and still carries the close hook;
 *   - full mode's header CSS carries `env(safe-area-inset-top)` and its body
 *     CSS carries `env(safe-area-inset-bottom)`;
 *   - `disableClose` removes the close hook entirely;
 *   - `aria-labelledby` on the root matches the title element's `id`;
 *   - `useGeekDialogFullScreen` is exported and safe to call under SSR
 *     (resolves `false`, same as any other `useMediaQuery` consumer here).
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Button from '@mui/material/Button';

import { GeekDialog, useGeekDialogFullScreen } from '../surfaces/GeekDialog.jsx';

/** Index of a `data-*` attribute (or any substring) in the markup, or -1. */
function at(markup, needle) {
  return markup.indexOf(needle);
}

function expectOrdered(markup, needles) {
  const positions = needles.map((needle) => at(markup, needle));
  positions.forEach((position, index) => {
    expect(position, `${needles[index]} missing from markup`).toBeGreaterThan(-1);
  });
  const sorted = [...positions].sort((a, b) => a - b);
  expect(positions, `expected order ${needles.join(' → ')}`).toEqual(sorted);
}

/** The `id="..."` attribute value of the element whose opening tag contains `needle`. */
function idFor(markup, needle) {
  const idx = markup.indexOf(needle);
  if (idx === -1) return null;
  const tagStart = markup.lastIndexOf('<', idx);
  const tagEnd = markup.indexOf('>', idx);
  const match = markup.slice(tagStart, tagEnd + 1).match(/\sid="([^"]*)"/);
  return match ? match[1] : null;
}

/** The inline `<style>` rule text for the element whose opening tag contains `needle`. */
function ruleFor(markup, needle) {
  const idx = markup.indexOf(needle);
  if (idx === -1) return '';
  const tagStart = markup.lastIndexOf('<', idx);
  const tagEnd = markup.indexOf('>', idx);
  const classMatch = markup.slice(tagStart, tagEnd + 1).match(/class="([^"]*)"/);
  const cls = classMatch ? classMatch[1].split(' ').find((c) => c.startsWith('css-')) : null;
  if (!cls) return '';
  const ruleIdx = markup.indexOf(`.${cls}{`);
  if (ruleIdx === -1) return '';
  return markup.slice(ruleIdx, markup.indexOf('}', ruleIdx) + 1);
}

function renderDialog(props) {
  return renderToStaticMarkup(
    <GeekDialog
      open
      keepMounted
      onClose={() => {}}
      title="Rename board"
      secondaryAction={<Button data-test-secondary>Cancel</Button>}
      primaryAction={<Button data-test-primary variant="contained">Save</Button>}
      {...props}
    >
      <div data-test-body>form fields</div>
    </GeekDialog>
  );
}

describe('GeekDialog — full mode', () => {
  const markup = renderDialog({ mode: 'full' });

  it('sets the mode attribute', () => {
    expect(markup).toContain('data-geek-dialog-mode="full"');
  });

  it('orders close → title → primary, with no DialogActions', () => {
    expectOrdered(markup, [
      'data-geek-dialog="close"',
      'data-geek-dialog="title"',
      'data-geek-dialog="primary"',
    ]);
    expect(markup).not.toContain('data-geek-dialog="actions"');
  });

  it('renders the body content and hook', () => {
    expect(markup).toContain('data-geek-dialog="body"');
    expect(markup).toContain('data-test-body');
  });

  it('drops secondaryAction unless keepSecondaryOnMobile is set', () => {
    expect(markup).not.toContain('data-test-secondary');
    expect(markup).not.toContain('data-geek-dialog="footer"');

    const withFooter = renderDialog({ mode: 'full', keepSecondaryOnMobile: true });
    expect(withFooter).toContain('data-geek-dialog="footer"');
    expect(withFooter).toContain('data-test-secondary');
  });

  it('carries safe-area insets on header and body', () => {
    expect(ruleFor(markup, 'data-geek-dialog="header"')).toContain('env(safe-area-inset-top)');
    expect(ruleFor(markup, 'data-geek-dialog="body"')).toContain('env(safe-area-inset-bottom)');
  });

  it('removes the close hook when disableClose is set', () => {
    const disabled = renderDialog({ mode: 'full', disableClose: true });
    expect(disabled).not.toContain('data-geek-dialog="close"');
  });

  it('matches aria-labelledby on the root to the title id', () => {
    const titleId = idFor(markup, 'data-geek-dialog="title"');
    expect(titleId).toBeTruthy();
    expect(markup).toContain(`aria-labelledby="${titleId}"`);
  });
});

describe('GeekDialog — window mode', () => {
  const markup = renderDialog({ mode: 'window' });

  it('sets the mode attribute', () => {
    expect(markup).toContain('data-geek-dialog-mode="window"');
  });

  it('orders secondary before primary inside DialogActions, and keeps the close hook', () => {
    expect(markup).toContain('data-geek-dialog="close"');
    expectOrdered(markup, [
      'data-geek-dialog="actions"',
    ]);
    const actionsIdx = markup.indexOf('data-geek-dialog="actions"');
    const tail = markup.slice(actionsIdx);
    const secondaryIdx = tail.indexOf('data-test-secondary');
    const primaryIdx = tail.indexOf('data-test-primary');
    expect(secondaryIdx).toBeGreaterThan(-1);
    expect(primaryIdx).toBeGreaterThan(-1);
    expect(secondaryIdx).toBeLessThan(primaryIdx);
  });

  it('renders the body content and hook', () => {
    expect(markup).toContain('data-geek-dialog="body"');
    expect(markup).toContain('data-test-body');
  });

  it('removes the close hook when disableClose is set', () => {
    const disabled = renderDialog({ mode: 'window', disableClose: true });
    expect(disabled).not.toContain('data-geek-dialog="close"');
  });

  it('matches aria-labelledby on the root to the title id', () => {
    const titleId = idFor(markup, 'data-geek-dialog="title"');
    expect(titleId).toBeTruthy();
    expect(markup).toContain(`aria-labelledby="${titleId}"`);
  });
});

describe('useGeekDialogFullScreen', () => {
  function Probe({ breakpoint }) {
    const full = useGeekDialogFullScreen(breakpoint);
    return <div data-test-probe data-full={String(full)} />;
  }

  it('is exported and renders under SSR, resolving false (no matchMedia)', () => {
    const markup = renderToStaticMarkup(<Probe />);
    expect(markup).toContain('data-test-probe');
    expect(markup).toContain('data-full="false"');
  });

  it('accepts an explicit breakpoint', () => {
    const markup = renderToStaticMarkup(<Probe breakpoint="md" />);
    expect(markup).toContain('data-full="false"');
  });
});
