/**
 * The EPUB reader (epub.js) for the open book: `ReaderModal`'s state, and the
 * effect that opens `GET /api/books/:id/download/epub` into its container.
 * Moved out of App.jsx unchanged; it lives with the detail route because the
 * reader only ever opens from the detail sheet's Read button.
 */
import { useEffect, useRef, useState } from "react";
import ePub from "epubjs";
import { useThemeMode } from "@geeksuite/user";
import { API_BASE } from "../utils/bookDisplay";

const READER_TEXT_SELECTORS =
  "body, p, div, span, h1, h2, h3, h4, h5, h6, li, blockquote, pre, code, em, strong, a, small, label, input, textarea, select, table, td, th, dd, dt, figcaption, section, article, main, aside, nav, header, footer, hr";

export function useReader(selectedBook) {
  const { theme: suiteThemeMode } = useThemeMode();
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerError, setReaderError] = useState(null);
  const [readerTheme, setReaderTheme] = useState(suiteThemeMode === "light" ? "light" : "dark");
  const readerContainerRef = useRef(null);
  const readerBookRef = useRef(null);
  const readerRenditionRef = useRef(null);
  const bookId = selectedBook?.id || selectedBook?._id;

  useEffect(() => {
    if (!readerOpen || !bookId || !readerContainerRef.current) {
      return undefined;
    }

    let cancelled = false;

    async function loadEpub() {
      try {
        setReaderError(null);

        const hasEpub =
          Array.isArray(selectedBook.files) &&
          selectedBook.files.some((file) => {
            const fmt = String(file.format || "").toLowerCase();
            if (fmt === "epub") return true;
            const path = String(file.path || "");
            const ext = path.includes(".") ? path.split(".").pop().toLowerCase() : "";
            return ext === "epub";
          });

        if (!hasEpub) {
          setReaderError("No EPUB format available for this book.");
          return;
        }

        const url = `${ API_BASE }/books/${ bookId }/download/epub`;
        const book = ePub(url, { openAs: "epub" });
        readerBookRef.current = book;
        // epub.js never rejects `book.opened` on a failed open — it only emits
        // `openFailed` — so without this the `display()` below hangs forever
        // and the reader shows a blank page with no error.
        book.on("openFailed", (openErr) => {
          if (!cancelled) {
            setReaderError(openErr?.message || "Could not open this EPUB.");
          }
        });

        const rendition = book.renderTo(readerContainerRef.current, {
          width: "100%",
          height: "100%",
        });
        readerRenditionRef.current = rendition;

        if (rendition.themes) {
          rendition.themes.register("light", {
            [READER_TEXT_SELECTORS]: {
              color: "#1f2937 !important",
              "background-color": "transparent !important",
            },
            "body": {
              "background-color": "#f6f1e7 !important",
            },
            "a, a:link, a:visited, a:hover, a:active": {
              color: "#2563eb !important",
            },
          });

          rendition.themes.register("dark", {
            [READER_TEXT_SELECTORS]: {
              color: "#e2e8f0 !important",
              "background-color": "transparent !important",
            },
            "body": {
              "background-color": "#0f172a !important",
            },
            "a, a:link, a:visited, a:hover, a:active": {
              color: "#60a5fa !important",
            },
          });
        }

        await rendition.display();

        if (rendition.themes?.select) {
          rendition.themes.select(readerTheme);
        }
      } catch (err) {
        if (!cancelled) {
          setReaderError(err?.message || "Failed to load EPUB for this book.");
        }
      }
    }

    loadEpub();

    return () => {
      cancelled = true;
      if (readerRenditionRef.current && typeof readerRenditionRef.current.destroy === "function") {
        try {
          readerRenditionRef.current.destroy();
        } catch {
          // ignore
        }
      }
      readerRenditionRef.current = null;

      if (readerBookRef.current && typeof readerBookRef.current.destroy === "function") {
        try {
          readerBookRef.current.destroy();
        } catch {
          // ignore
        }
      }
      readerBookRef.current = null;
    };
    // Re-opened only when the reader opens or the book changes — not on every
    // cache update of the same book, and not on a theme flip (the effect
    // below re-themes the live rendition).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerOpen, bookId]);

  useEffect(() => {
    if (readerRenditionRef.current?.themes?.select) {
      readerRenditionRef.current.themes.select(readerTheme);
    }
  }, [readerTheme]);

  return {
    readerOpen,
    setReaderOpen,
    readerError,
    setReaderError,
    readerTheme,
    setReaderTheme,
    readerContainerRef,
    readerRenditionRef,
  };
}
