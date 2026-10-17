/**
 * Toast context, in its own module so `GeekToastProvider.jsx` stays
 * components-only (React Fast Refresh) — same split as `shellContext.js`.
 */
import { createContext, useContext, useEffect } from 'react';

const notMounted = () => {
  if (typeof console !== 'undefined') {
    console.warn('[geeksuite/ui] useToast() called outside a <GeekToastProvider>; message dropped.');
  }
  return null;
};

/**
 * A provider-less fallback rather than a throw: a toast is a courtesy, and a
 * missing provider should not take down the tree that was trying to say
 * "saved". Mount `GeekToastProvider` and the calls start landing.
 */
export const TOAST_FALLBACK = {
  notify: notMounted,
  dismiss: () => {},
};

export const GeekToastContext = createContext(TOAST_FALLBACK);

/**
 * @returns {{notify: (message: React.ReactNode, options?: {
 *   tone?: 'info'|'success'|'warning'|'error',
 *   action?: React.ReactNode,
 *   duration?: number,
 * }) => (number|null), dismiss: (id?: number) => void}}
 */
export function useToast() {
  return useContext(GeekToastContext);
}

/**
 * Where toasts may not sit. A sticky footer inside a sheet (a "Done" ribbon,
 * a Save bar) registers itself here and the stack rises above it, so a
 * ten-second toast never covers the button the person is reaching for.
 * Separate from `GeekToastContext` so `useToast()`'s value stays exactly
 * `{ notify, dismiss }`. Outside a provider it does nothing.
 */
export const GeekToastClearanceContext = createContext({
  register: () => () => {},
  remeasure: () => {},
});

/**
 * Keep toasts above `ref`'s element while `active`. The clearance is how far
 * the element's top sits above the bottom of the window, measured again on
 * resize, scroll, its own size changes and the end of its entrance
 * animation — so a ribbon that slides in, or a keyboard that opens, is
 * followed rather than guessed.
 *
 * @param {{ current: Element | null }} ref
 * @param {boolean} [active=true]
 */
export function useGeekToastClearance(ref, active = true) {
  const { register, remeasure } = useContext(GeekToastClearanceContext);
  useEffect(() => {
    const el = ref?.current;
    if (!active || !el || typeof window === 'undefined') return undefined;
    const measure = () => {
      if (!el.isConnected) return 0;
      const rect = el.getBoundingClientRect();
      if (!rect.height) return 0;
      return Math.max(0, Math.min(window.innerHeight, window.innerHeight - rect.top));
    };
    const unregister = register(measure);
    let frame = null;
    const later = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        remeasure();
      });
    };
    window.addEventListener('resize', later);
    window.addEventListener('scroll', later, true);
    window.visualViewport?.addEventListener?.('resize', later);
    el.addEventListener('animationend', later);
    el.addEventListener('transitionend', later);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(later) : null;
    observer?.observe(el);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', later);
      window.removeEventListener('scroll', later, true);
      window.visualViewport?.removeEventListener?.('resize', later);
      el.removeEventListener('animationend', later);
      el.removeEventListener('transitionend', later);
      observer?.disconnect();
      unregister();
    };
  }, [ref, active, register, remeasure]);
}

/**
 * A modal on its way out: its transition has started (Fade takes the
 * container to opacity 0, Slide moves a drawer's paper off screen). A toast
 * put inside it would fade or slide away with it and then jump to the page.
 */
const isLeaving = (el) => {
  const style = el?.style;
  if (!style) return false;
  return style.opacity === '0' || style.visibility === 'hidden' || (style.transform !== '' && style.transform !== 'none');
};

/** The focus trap's root inside an MUI modal: the element after its start sentinel. */
export const trapRootOf = (modal) => {
  const start = Array.from(modal.children).find((el) => el.getAttribute('data-testid') === 'sentinelStart');
  return start?.nextElementSibling || modal;
};

export const openModals = (doc) =>
  Array.from(doc.body.children).filter(
    (el) =>
      el.classList?.contains('MuiModal-root') &&
      !el.classList.contains('MuiModal-hidden') &&
      !el.classList.contains('MuiPopover-root') &&
      el.getAttribute('aria-hidden') !== 'true'
  );

/**
 * The open modal a toast should live in, or null. MUI portals every modal to
 * `<body>`; the topmost open one that isn't itself aria-hidden (a modal under
 * another modal is) and isn't closing wins. Inside it, the focus trap's root
 * — the dialog's container, a drawer's paper — is where the stack goes, so
 * Tab reaches it and nothing hides it.
 */
export function activeModalHost(doc = typeof document === 'undefined' ? null : document) {
  if (!doc?.body) return null;
  const top = openModals(doc).pop();
  if (!top) return null;
  const root = trapRootOf(top);
  return isLeaving(root) ? null : root;
}
