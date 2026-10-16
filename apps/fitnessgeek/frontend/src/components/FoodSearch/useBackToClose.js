import { useEffect, useRef } from 'react';

let nextSheet = 0;

/**
 * Android's back gesture closes the open sheet, not the page under it.
 *
 * Every app is an installed PWA used on a phone, where "back" is a swipe from
 * the edge. With nothing in history for the sheet, that swipe left the Food
 * Log with the add sheet still in mid-sentence (REVIEW_2026-10 P2).
 *
 * While `open`, the sheet owns one history entry (same URL, so the router sees
 * no navigation). Back pops it and `onClose` runs. Closing any other way —
 * Cancel, Log it, a clean describe — takes the entry back off, but only while
 * it is still on top: if the person navigated somewhere from inside the sheet,
 * going "back" would undo that navigation instead.
 *
 * Sheets nest (the serving sheet opens over the add sheet), so each entry
 * carries the whole stack of open sheets and a sheet closes only when its own
 * id is no longer in the state that back landed on.
 */
export function useBackToClose(open, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || typeof window === 'undefined' || !window.history?.pushState) return undefined;

    const id = `fg-sheet-${++nextSheet}`;
    const base = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
    const stack = Array.isArray(base.fgSheets) ? base.fgSheets : [];
    window.history.pushState({ ...base, fgSheets: [...stack, id] }, '');

    let poppedByBack = false;
    const onPop = (event) => {
      const sheets = event.state?.fgSheets;
      if (Array.isArray(sheets) && sheets.includes(id)) return;
      poppedByBack = true;
      onCloseRef.current?.();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      if (poppedByBack) return;
      const top = window.history.state?.fgSheets;
      if (Array.isArray(top) && top[top.length - 1] === id) window.history.back();
    };
  }, [open]);
}

export default useBackToClose;
