import { useRef, useState, useEffect } from 'react';
import useNotePrint from '../../hooks/useNotePrint';
import { revokeImage } from './useSketchConvert';

/**
 * Print / Save as PDF preparation for the note editor: a sketch's canvas is
 * exported to images right before the print dialog opens.
 */
export function useSketchPrint({ isHandwritten, sketchApiRef, title }) {
  // ── Print / Save as PDF (DOCS/CONTEXT.md §8) ──────────────────────────
  //
  // NotePrintView is the paper copy; the ⋯ menu and Ctrl/Cmd+P both go
  // through `printNote`. Only a sketch needs preparing: its canvas is
  // exported to images (one per photographed page) right before the dialog
  // opens, so the drawing printed is the drawing on screen.
  const [printSketch, setPrintSketch] = useState({ images: null, error: null });
  const revokePrintImages = (images) => images?.forEach((img) => revokeImage(img.url));
  const preparePrint = async () => {
    if (!isHandwritten) return;
    const api = sketchApiRef.current;
    if (!api?.exportForPrint) {
      setPrintSketch((prev) => {
        revokePrintImages(prev.images);
        return { images: null, error: 'The sketch was still loading, so the drawing is not on this page. Try again in a moment.' };
      });
      return;
    }
    let next;
    try {
      const pages = await api.exportForPrint();
      next = {
        images: pages.map((p) => ({ url: URL.createObjectURL(p.blob), width: p.width, height: p.height })),
        error: null,
      };
    } catch (err) {
      next = {
        images: null,
        error: err?.code === 'empty' ? 'This sketch is empty.' : `The drawing could not be exported (${err?.message || 'export failed'}).`,
      };
    }
    setPrintSketch((prev) => {
      revokePrintImages(prev.images);
      return next;
    });
  };
  const { print: handlePrint, printing: isPrinting, rootRef: printRootRef } = useNotePrint({
    title,
    prepare: preparePrint,
  });
  const printImagesRef = useRef(null);
  printImagesRef.current = printSketch.images;
  // Unmount only.
  useEffect(() => () => revokePrintImages(printImagesRef.current), []);

  return { printSketch, handlePrint, isPrinting, printRootRef };
}
