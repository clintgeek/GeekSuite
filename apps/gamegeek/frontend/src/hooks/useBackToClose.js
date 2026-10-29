import { useEffect, useRef } from 'react';

let nextLayer = 0;

/**
 * Android's back gesture closes the open overlay (the media viewer), not the
 * page under it. Same contract as FitnessGeek's useBackToClose, kept in this
 * app rather than a shared package.
 *
 * While `open`, the overlay owns one history entry (same URL, so the router
 * sees no navigation). Back pops it and `onClose` runs. Closing any other way
 * takes the entry back off — but only while it is still on top.
 */
export function useBackToClose(open, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || typeof window === 'undefined' || !window.history?.pushState) return undefined;

    const id = `gg-layer-${++nextLayer}`;
    const base = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
    const stack = Array.isArray(base.ggLayers) ? base.ggLayers : [];
    window.history.pushState({ ...base, ggLayers: [...stack, id] }, '');

    let poppedByBack = false;
    const onPop = (event) => {
      const layers = event.state?.ggLayers;
      if (Array.isArray(layers) && layers.includes(id)) return;
      poppedByBack = true;
      onCloseRef.current?.();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      if (poppedByBack) return;
      const top = window.history.state?.ggLayers;
      if (Array.isArray(top) && top[top.length - 1] === id) window.history.back();
    };
  }, [open]);
}

export default useBackToClose;
