/**
 * Primary-action registry — the page names its one thumb-zone action, the
 * shell renders it.
 *
 * `GeekFab` has to be a sibling of `GeekAppFrame` (the frame wraps every page
 * in a framer-motion element, and an animating element becomes the containing
 * block for its `position: fixed` children, so a FAB inside it is positioned
 * against the page and fades with it). The page, though, is the only place
 * that knows what the action *is* and owns the dialog it opens. So the page
 * registers with `useGeekPrimaryAction()`; `GeekShell` mounts the FAB.
 *
 * Promoted from fitnessgeek's local copy (MOBILE_UI_PLAN.md §4b) so the next
 * app pass gets it for free. Two things carried over from that version:
 *
 *   - `onClick` and `icon` live in refs, so a page may pass a fresh arrow
 *     function and a fresh element on every render without re-registering
 *     (and without the setState-in-effect loop that would follow). Only
 *     `label`, `showOn` and `hidden` are effect dependencies.
 *   - Registration lasts for the mount. Unmount clears it.
 *
 * One thing is new: registrations are a *stack*, not a single slot. Only one
 * page is expected to register at a time, but a route that renders two
 * registrants (a page plus a mounted panel) used to leave the FAB empty when
 * the second unmounted. Last registration wins; when it unregisters, the
 * previous one — if still mounted — comes back.
 *
 * SSR note: this package's tests render with `renderToStaticMarkup`, where
 * effects never run, so an effect-only registry would always render no FAB.
 * When there is no `document`, the hook publishes through a render-phase slot
 * instead (`ssrRef`), which the shell reads from inside a *component* rendered
 * after `children` — React walks a component's body when it reaches it, so by
 * then the page's render (and its write to the slot) has happened. Reading the
 * slot in `GeekShell`'s own body would be too early. In a browser the slot is
 * never written and the effect path is the only path.
 *
 * No JSX here on purpose: `GeekShell` renders the Provider, so this module
 * exports no component and Fast Refresh stays happy.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * The stack behind the registry, as a plain object so the "last wins, previous
 * returns" rule is testable without a DOM.
 *
 * @param {(action: object|null) => void} onChange called only when the
 *   effective (top-of-stack) action actually changes.
 */
export function createPrimaryActionRegistry(onChange = () => {}) {
  const stack = [];
  let current = null;

  const sync = () => {
    const next = stack.length ? stack[stack.length - 1] : null;
    if (next === current) return;
    current = next;
    onChange(current);
  };

  return {
    /** @returns {() => void} unregister. Safe to call twice. */
    register(entry) {
      stack.push(entry);
      sync();
      return () => {
        const index = stack.indexOf(entry);
        if (index === -1) return;
        stack.splice(index, 1);
        sync();
      };
    },
    get current() {
      return current;
    },
    get size() {
      return stack.length;
    },
  };
}

/**
 * Shell-side plumbing: `{ register, ssrRef }`. Deliberately free of the
 * current action so the context value never changes identity — a value that
 * changed on every registration would re-run every registrant's effect, which
 * unregisters, which changes the value again.
 */
export const GeekPrimaryActionContext = createContext(null);

/**
 * Shell-side state. `GeekShell` calls this, renders `value` as the context and
 * `action` as a `GeekFab`. Apps do not call it (they get it from `GeekShell`);
 * it is exported for a shell an app builds itself.
 *
 * @returns {{action: object|null, ssrRef: object,
 *   value: {register: Function, ssrRef: object}}}
 */
export function useGeekPrimaryActionState() {
  const [action, setAction] = useState(null);
  const ssrRef = useRef(null);
  const registryRef = useRef(null);
  if (registryRef.current === null) {
    registryRef.current = createPrimaryActionRegistry(setAction);
  }
  const registry = registryRef.current;
  const value = useMemo(() => ({ register: registry.register, ssrRef }), [registry]);

  return { action, ssrRef, value };
}

/**
 * Register this page's primary action for the duration of its mount. The
 * shell renders it as a `GeekFab` in the thumb zone.
 *
 * Outside a `GeekShell` this is a no-op, so a page can be rendered standalone
 * (a test, a storybook route) without guarding the call.
 *
 * @param {object} config
 * @param {string} config.label required; the FAB's accessible name (and its
 *   visible text when the shell renders it extended).
 * @param {import('react').ReactNode} [config.icon] defaults to `GeekFab`'s "+".
 * @param {(event: object) => void} [config.onClick]
 * @param {'mobile'|'always'} [config.showOn='mobile']
 * @param {boolean} [config.hidden=false] register nothing — for a page whose
 *   action is conditional (empty state, read-only mode).
 */
export function useGeekPrimaryAction({ label, icon, onClick, showOn = 'mobile', hidden = false }) {
  const ctx = useContext(GeekPrimaryActionContext);
  const register = ctx?.register;

  const onClickRef = useRef(onClick);
  const iconRef = useRef(icon);
  onClickRef.current = onClick;
  iconRef.current = icon;

  const handleClick = useCallback((event) => onClickRef.current?.(event), []);

  // Render-phase publish, SSR only. See the file header.
  if (ctx && typeof document === 'undefined') {
    ctx.ssrRef.current = hidden ? null : { label, showOn, icon, onClick: handleClick };
  }

  useEffect(() => {
    if (!register || hidden) return undefined;
    return register({ label, showOn, icon: iconRef.current, onClick: handleClick });
  }, [register, label, showOn, hidden, handleClick]);
}
