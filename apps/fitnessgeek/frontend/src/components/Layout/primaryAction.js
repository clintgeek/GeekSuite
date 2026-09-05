/**
 * Primary action registry — the page names its one thumb-zone action, the
 * shell renders it.
 *
 * `GeekFab` has to be a sibling of `GeekAppFrame` (the frame wraps every page
 * in a framer-motion element, which fades — and, the moment it animates
 * anything but opacity, re-parents — a `position: fixed` child). The page,
 * though, is the only place that knows what the action *is* and owns the
 * dialog it opens. So the page registers; `ModernLayout` mounts.
 *
 * `onClick` and `icon` are held in refs, so a page may pass a fresh arrow
 * function on every render without re-registering (and without the
 * setState-in-effect loop that would follow). Only the primitives — label,
 * `showOn`, `enabled` — are effect dependencies.
 *
 * No JSX here on purpose: `ModernLayout` renders the Provider, so this module
 * exports no component and Fast Refresh stays happy.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export const PrimaryActionContext = createContext(null);

/** Shell-side: the state object to hand to `PrimaryActionContext.Provider`. */
export function usePrimaryActionState() {
  const [action, setAction] = useState(null);
  return useMemo(() => ({ action, setAction }), [action]);
}

/** The registered action, for the shell. `null` when no page registered one. */
export function usePrimaryAction() {
  return useContext(PrimaryActionContext)?.action ?? null;
}

/**
 * Register this page's primary action for the duration of its mount.
 *
 * @param {object} config
 * @param {string} config.label required; the FAB's accessible name.
 * @param {import('react').ReactNode} [config.icon]
 * @param {() => void} config.onClick
 * @param {'mobile'|'always'} [config.showOn='mobile']
 * @param {boolean} [config.enabled=true] register nothing when false.
 */
export function useRegisterPrimaryAction({
  label,
  icon,
  onClick,
  showOn = 'mobile',
  enabled = true,
}) {
  const ctx = useContext(PrimaryActionContext);
  const setAction = ctx?.setAction;

  const onClickRef = useRef(onClick);
  const iconRef = useRef(icon);
  onClickRef.current = onClick;
  iconRef.current = icon;

  const handleClick = useCallback((event) => onClickRef.current?.(event), []);

  useEffect(() => {
    if (!setAction) return undefined;
    if (!enabled) {
      setAction(null);
      return undefined;
    }
    setAction({ label, showOn, icon: iconRef.current, onClick: handleClick });
    return () => setAction(null);
  }, [setAction, label, showOn, enabled, handleClick]);
}
