/**
 * Primary-action registry tests (MOBILE_UI_PLAN.md §4b, first bullet).
 *
 * Two halves, because the environment here is `node`:
 *
 *   - the stack rule ("last registration wins; when it unregisters the
 *     previous one comes back; unmount clears it") is tested against
 *     `createPrimaryActionRegistry`, which is plain JS on purpose — there is
 *     no DOM renderer in this package, so an unmount cannot be simulated
 *     through React;
 *   - the wiring (a page registers → `GeekShell` renders a `GeekFab` with
 *     that label) is tested through `renderToStaticMarkup`. Effects never run
 *     under SSR, which is exactly why `useGeekPrimaryAction` also publishes
 *     through the shell's render-phase slot: the shell renders the FAB after
 *     `children`, so the page's registration is already in by then.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { GeekShell } from '../navigation/GeekShell.jsx';
import {
  createPrimaryActionRegistry,
  useGeekPrimaryAction,
} from '../navigation/primaryActionContext.js';

function Page(config) {
  useGeekPrimaryAction(config);
  return <div data-test-page />;
}

function renderShell(config) {
  return renderToStaticMarkup(
    <GeekShell>
      <Page {...config} />
    </GeekShell>
  );
}

describe('createPrimaryActionRegistry', () => {
  it('publishes the newest registration and nothing else', () => {
    const onChange = vi.fn();
    const registry = createPrimaryActionRegistry(onChange);
    const first = { label: 'One' };
    const second = { label: 'Two' };

    registry.register(first);
    expect(registry.current).toBe(first);
    registry.register(second);
    expect(registry.current).toBe(second);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(second);
  });

  it('restores the previous registration when the newest unmounts', () => {
    const registry = createPrimaryActionRegistry();
    const first = { label: 'One' };
    const unregisterFirst = registry.register(first);
    const unregisterSecond = registry.register({ label: 'Two' });

    unregisterSecond();
    expect(registry.current).toBe(first);

    unregisterFirst();
    expect(registry.current).toBeNull();
    expect(registry.size).toBe(0);
  });

  it('ignores a repeated unregister', () => {
    const onChange = vi.fn();
    const registry = createPrimaryActionRegistry(onChange);
    const unregister = registry.register({ label: 'One' });

    unregister();
    unregister();
    expect(onChange).toHaveBeenCalledTimes(2); // register, then clear — not three
    expect(registry.current).toBeNull();
  });
});

describe('useGeekPrimaryAction inside GeekShell', () => {
  it('renders the shell FAB with the registered label', () => {
    const markup = renderShell({ label: 'Log food', onClick: () => {} });
    expect(markup).toContain('data-test-page');
    expect(markup).toContain('data-geek-fab="icon"');
    expect(markup).toContain('aria-label="Log food"');
  });

  it('renders the FAB after the page content, so it is not inside the frame', () => {
    const markup = renderShell({ label: 'Log food', onClick: () => {} });
    expect(markup.indexOf('data-test-page')).toBeLessThan(markup.indexOf('data-geek-fab'));
  });

  it('renders nothing when the registration is hidden', () => {
    const markup = renderShell({ label: 'Log food', onClick: () => {}, hidden: true });
    expect(markup).toContain('data-test-page');
    expect(markup).not.toContain('data-geek-fab');
  });

  it('renders no FAB when no page registers', () => {
    const markup = renderToStaticMarkup(
      <GeekShell>
        <div data-test-page />
      </GeekShell>
    );
    expect(markup).not.toContain('data-geek-fab');
  });

  it('honours showOn: an always-on action drops the desktop hide rule', () => {
    const mobile = renderShell({ label: 'Log food', onClick: () => {} });
    expect(mobile).toContain('@media (min-width:900px)');

    const always = renderShell({ label: 'Log food', onClick: () => {}, showOn: 'always' });
    expect(always).toContain('aria-label="Log food"');
    expect(always).toContain('display:inline-flex');
  });

  it('is a no-op outside a shell', () => {
    const markup = renderToStaticMarkup(<Page label="Log food" onClick={() => {}} />);
    expect(markup).toContain('data-test-page');
    expect(markup).not.toContain('data-geek-fab');
  });
});
