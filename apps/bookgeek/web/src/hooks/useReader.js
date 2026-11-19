/**
 * The EPUB reader (epub.js) for the open book: `ReaderModal`'s state, and the
 * effect that opens `GET /api/books/:id/download/epub` into its container.
 * Moved out of App.jsx unchanged; it lives with the detail route because the
 * reader only ever opens from the detail sheet's Read button.
 *
 * Where you are (review 2026-11-18 #1): the book reopens at the place this
 * reader left it ON THIS DEVICE (utils/readerPosition.js — no server sync,
 * S-D3), and epub.js's locations are generated (or loaded from the device
 * cache) after the first page is up, so the percentage is the book's, not
 * the chapter's. The table of contents comes from the book's navigation.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import ePub from "epubjs";
import { useThemeMode } from "@geeksuite/user";
import { API_BASE } from "../utils/bookDisplay";
import { loadReaderPrefs, saveReaderPrefs } from "../utils/readerPrefs";
import { READER_PALETTES } from "../utils/readerPalette";
import {
  flattenToc,
  loadCachedLocations,
  loadReaderPosition,
  saveCachedLocations,
  saveReaderPosition,
} from "../utils/readerPosition";

const READER_TEXT_SELECTORS =
  "body, p, div, span, h1, h2, h3, h4, h5, h6, li, blockquote, pre, code, em, strong, a, small, label, input, textarea, select, table, td, th, dd, dt, figcaption, section, article, main, aside, nav, header, footer, hr";

/** epub.js characters per location: its own default, a fair "page". */
const LOCATION_CHARS = 1600;

function epubTheme(p) {
  return {
    [READER_TEXT_SELECTORS]: {
      color: `${p.ink} !important`,
      "background-color": "transparent !important",
    },
    "body": {
      "background-color": `${p.page} !important`,
    },
    "a, a:link, a:visited, a:hover, a:active": {
      color: `${p.link} !important`,
    },
  };
}

export function useReader(selectedBook, { readerId = null } = {}) {
  const { theme: suiteThemeMode } = useThemeMode();
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerError, setReaderError] = useState(null);
  // Remembered on this device (utils/readerPrefs.js); the suite's mode until
  // the reader has been flipped once.
  const [readerTheme, setReaderTheme] = useState(
    () => loadReaderPrefs().theme || (suiteThemeMode === "light" ? "light" : "dark")
  );
  // A callback ref: the effect below runs when the container node exists,
  // whenever the reader's (portalled) Dialog attaches it. `.current` is kept
  // for callers that read it.
  const [containerNode, setContainerNode] = useState(null);
  const readerContainerRef = useCallback((node) => {
    readerContainerRef.current = node;
    setContainerNode(node);
  }, []);
  const readerBookRef = useRef(null);
  const readerRenditionRef = useRef(null);
  const [readerToc, setReaderToc] = useState([]);
  const [locationsReady, setLocationsReady] = useState(false);
  const bookId = selectedBook?.id || selectedBook?._id;
  const readerIdRef = useRef(readerId);
  readerIdRef.current = readerId;

  useEffect(() => {
    if (!readerOpen || !bookId || !containerNode) {
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

        const rendition = book.renderTo(containerNode, {
          width: "100%",
          height: "100%",
        });
        readerRenditionRef.current = rendition;

        if (rendition.themes) {
          rendition.themes.register("light", epubTheme(READER_PALETTES.light));
          rendition.themes.register("dark", epubTheme(READER_PALETTES.dark));
        }

        // Every page turn is remembered on this device, for this reader.
        if (typeof rendition.on === "function") {
          // epub.js's iframe carries no title; a frame needs one (axe frame-title).
          rendition.on("rendered", () => {
            try {
              containerNode.querySelectorAll("iframe").forEach((frame) => {
                if (!frame.title) frame.title = `${selectedBook?.title || "Book"}, the page`;
              });
            } catch {
              // ignore
            }
          });
          rendition.on("relocated", (location) => {
            const cfi = location?.start?.cfi;
            if (!cancelled && cfi) saveReaderPosition(readerIdRef.current, bookId, cfi);
          });
        }

        const saved = loadReaderPosition(readerIdRef.current, bookId);
        if (saved) {
          try {
            await rendition.display(saved);
          } catch {
            // A position from an older copy of the file: start at the cover.
            await rendition.display();
          }
        } else {
          await rendition.display();
        }

        if (rendition.themes?.select) {
          rendition.themes.select(readerTheme);
        }
        // The remembered font size: ReaderModal's stepper only reaches a
        // rendition that already exists, and this one did not until now.
        const { fontPct } = loadReaderPrefs();
        if (fontPct && rendition.themes?.fontSize) {
          rendition.themes.fontSize(`${ fontPct }%`);
        }

        // Contents, then locations — both after the first page is up, so the
        // book opens as fast as it did.
        try {
          const nav = await book.loaded?.navigation;
          if (!cancelled) setReaderToc(flattenToc(nav?.toc));
        } catch {
          // no navigation document: no Contents button
        }
        await prepareLocations(book);
      } catch (err) {
        if (!cancelled) {
          setReaderError(err?.message || "Failed to load EPUB for this book.");
        }
      }
    }

    async function prepareLocations(book) {
      const locations = book.locations;
      if (!locations) return;
      try {
        const cached = loadCachedLocations(bookId);
        if (cached) {
          locations.load(cached);
        } else {
          await book.ready;
          if (cancelled) return;
          await locations.generate(LOCATION_CHARS);
          if (cancelled) return;
          saveCachedLocations(bookId, locations.save());
        }
        if (!cancelled && (locations.length?.() ?? 0) > 0) setLocationsReady(true);
      } catch {
        // No locations: the reader still shows the chapter, just no percentage.
      }
    }

    setReaderToc([]);
    setLocationsReady(false);
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
    // Re-opened only when the reader opens, its container mounts, or the book changes — not on every
    // cache update of the same book, and not on a theme flip (the effect
    // below re-themes the live rendition).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerOpen, bookId, containerNode]);

  useEffect(() => {
    if (readerRenditionRef.current?.themes?.select) {
      readerRenditionRef.current.themes.select(readerTheme);
    }
  }, [readerTheme]);

  // Remember a theme the reader chose (not the suite default it started on).
  const firstThemeRef = useRef(true);
  useEffect(() => {
    if (firstThemeRef.current) {
      firstThemeRef.current = false;
      return;
    }
    saveReaderPrefs({ theme: readerTheme });
  }, [readerTheme]);

  /** Jump to a Contents entry (an href inside the book). */
  const goToHref = useCallback((href) => {
    const rendition = readerRenditionRef.current;
    if (!rendition?.display || !href) return;
    try {
      const pending = rendition.display(href);
      pending?.catch?.(() => {});
    } catch {
      // a broken TOC link: stay where you are
    }
  }, []);

  return {
    readerOpen,
    setReaderOpen,
    readerError,
    setReaderError,
    readerTheme,
    setReaderTheme,
    readerContainerRef,
    readerRenditionRef,
    readerToc,
    locationsReady,
    goToHref,
  };
}
