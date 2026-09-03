/**
 * Toast context, in its own module so `GeekToastProvider.jsx` stays
 * components-only (React Fast Refresh) — same split as `shellContext.js`.
 */
import { createContext, useContext } from 'react';

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
