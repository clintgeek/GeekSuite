// @vitest-environment jsdom
/**
 * GeekLoadError + geekLoadStatus (plan 2.5): a failed load is never drawn as
 * "empty", and it offers a Retry with a real 44px target.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { GeekLoadError, geekLoadStatus } from '../index.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root = null;
let host = null;
const mount = async (ui) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(ui));
};
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  root = null;
});
const $ = (sel) => host.querySelector(sel);
// Emotion may insert with insertRule (no textContent), so read the CSSOM.
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
/** The CSS rule text for an element's emotion class. */
const rulesFor = (el) => {
  const all = css();
  return [...el.classList]
    .filter((c) => c.startsWith('css-'))
    .map((c) => all.split('}').filter((r) => r.includes(`.${c}`)).join('}'))
    .join('\n');
};

describe('geekLoadStatus', () => {
  it.each([
    ['failed with nothing loaded is an error, not empty', { error: new Error('x'), data: [] }, 'error'],
    ['failed before any data is an error', { error: new Error('x'), data: undefined }, 'error'],
    ['loaded and nothing there is empty', { data: [] }, 'empty'],
    ['still loading with nothing yet', { loading: true }, 'loading'],
    ['error wins over loading when there is nothing to show', { loading: true, error: 'x' }, 'error'],
    ['rows on screen stay on screen when a refetch fails', { error: new Error('x'), data: [1] }, 'ready'],
    ['a connection object with nodes', { data: { nodes: [{ id: 1 }] } }, 'ready'],
    ['a connection object with no edges is empty', { data: { edges: [] } }, 'empty'],
    ['a plain object counts as data', { data: { id: 1 } }, 'ready'],
  ])('%s', (_name, input, expected) => {
    expect(geekLoadStatus(input)).toBe(expected);
  });

  it('takes a custom isEmpty', () => {
    expect(geekLoadStatus({ data: { total: 0 }, isEmpty: (d) => !d?.total })).toBe('empty');
  });
});

describe('GeekLoadError', () => {
  it('says what failed, is announced, and offers Retry', async () => {
    const onRetry = vi.fn();
    await mount(<GeekLoadError what="your notes" error={new Error('Network down')} onRetry={onRetry} />);
    const root$ = $('[data-geek-load-error]');
    expect(root$.getAttribute('role')).toBe('alert');
    expect(root$.textContent).toContain("Couldn't load your notes");
    expect(root$.textContent).toContain('Network down');
    const retry = $('[data-geek-load-error="retry"]');
    expect(retry.textContent).toBe('Retry');
    await act(async () => retry.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('is not the empty state', async () => {
    await mount(<GeekLoadError what="your list" onRetry={() => {}} />);
    expect($('[data-geek-error-state]')).toBeTruthy();
    expect(host.textContent).not.toMatch(/no .* yet|nothing here/i);
  });

  it('gives Retry a 44x44 minimum target', async () => {
    await mount(<GeekLoadError onRetry={() => {}} />);
    const rules = rulesFor($('[data-geek-load-error="retry"]'));
    expect(rules).toMatch(/min-height:44px/);
    expect(rules).toMatch(/min-width:44px/);
  });

  it('a promise from onRetry disables the button until it settles', async () => {
    let resolve;
    const onRetry = vi.fn(() => new Promise((r) => { resolve = r; }));
    await mount(<GeekLoadError onRetry={onRetry} />);
    const retry = () => $('[data-geek-load-error="retry"]');
    await act(async () => retry().click());
    expect(retry().disabled).toBe(true);
    expect(retry().textContent).toBe('Retrying…');
    await act(async () => retry().click());
    expect(onRetry).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    expect(retry().disabled).toBe(false);
    expect(retry().textContent).toBe('Retry');
  });

  it('`retrying` from the caller shows progress', async () => {
    await mount(<GeekLoadError onRetry={() => {}} retrying />);
    expect($('[data-geek-load-error="retry"]').disabled).toBe(true);
  });

  it('says so when the browser is offline', async () => {
    const spy = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      await mount(<GeekLoadError what="your list" onRetry={() => {}} />);
      expect(host.textContent).toMatch(/offline/i);
    } finally {
      spy.mockRestore();
    }
  });

  it('takes its defaults from the app theme (theme.components.GeekLoadError)', async () => {
    const theme = createTheme({
      components: { GeekLoadError: { defaultProps: { retryLabel: 'Try once more', retryVariant: 'contained' } } },
    });
    await mount(
      <ThemeProvider theme={theme}>
        <GeekLoadError onRetry={() => {}} />
      </ThemeProvider>
    );
    const retry = $('[data-geek-load-error="retry"]');
    expect(retry.textContent).toBe('Try once more');
    expect(retry.className).toContain('MuiButton-contained');
  });

  it('never shows a stack', async () => {
    const err = new Error('Boom');
    err.stack = 'Error: Boom\n    at secret (file.js:1:1)';
    await mount(<GeekLoadError error={err} onRetry={() => {}} />);
    expect(host.textContent).not.toContain('secret');
  });
});
