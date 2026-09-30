import { useCallback, useEffect, useRef, useState } from 'react';
import { beginPrintTitle, endPrintTitle, isPrintShortcut, runPrint } from '../utils/printNote';

/**
 * useNotePrint — Print / Save as PDF for the note on screen.
 *
 *   const { print, printing, rootRef } = useNotePrint({ title, prepare });
 *
 * `print` is what the ⋯ menu's "Print or save as PDF" calls. The hook also
 * takes Ctrl/Cmd+P while the note is open, so the shortcut runs the same
 * path (a sketch's image is exported first) instead of printing whatever the
 * print view last had; and it swaps the document title for the browser's own
 * menu Print too, which fires `beforeprint` without any of this code.
 *
 * `rootRef` goes on NotePrintView so the print waits for its images.
 */
export default function useNotePrint({ title, prepare, enabled = true } = {}) {
  const rootRef = useRef(null);
  const [printing, setPrinting] = useState(false);
  const busyRef = useRef(false);
  const titleRef = useRef(title);
  titleRef.current = title;
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;

  const print = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPrinting(true);
    try {
      await runPrint({
        title: titleRef.current,
        prepare: prepareRef.current,
        getRoot: () => rootRef.current,
      });
    } finally {
      busyRef.current = false;
      setPrinting(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (!isPrintShortcut(e)) return;
      e.preventDefault();
      print();
    };
    // Capture phase: the sketch canvas handles its own keys and must not
    // see this one first.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, print]);

  useEffect(() => {
    if (!enabled) return undefined;
    const before = () => beginPrintTitle(titleRef.current);
    const after = () => endPrintTitle();
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
      endPrintTitle();
    };
  }, [enabled]);

  return { print, printing, rootRef };
}
