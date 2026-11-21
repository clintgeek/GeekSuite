/**
 * BookGeek in-browser EPUB reader — true full-screen surface (MOBILE_UI_PLAN §3.3).
 *
 * The epub.js rendition is mounted by hooks/useReader.js — it owns
 * `readerContainerRef` / `readerRenditionRef` — so both refs are threaded in
 * as props and only the chrome lives here: page-turn strips, an auto-hiding
 * top/bottom chrome, Contents, a font-size stepper and a reader theme toggle,
 * and a progress rail driven by epub.js's `relocated` event.
 *
 * Review 2026-11-18 (#1, #2, #3):
 *   - Back closes the reader only (`useBackToClose`): the book sheet under it
 *     is a route, and Back used to pop that too.
 *   - Using the chrome keeps it up: any tap or focus inside it restarts the
 *     auto-hide timer, and it stays while Contents is open.
 *   - The page-turn strips are the outer quarters only. The middle of the page
 *     belongs to the book — links, footnotes, selecting text — and a plain tap
 *     there toggles the chrome through epub.js's own click event.
 *   - Position is the book's: a percentage from generated locations and the
 *     chapter's title, not "Page 3 of 9" inside a chapter.
 *   - The bars are the bookstore's signboard; the page pair is the shop's
 *     paper and its after-hours floor (utils/readerPalette.js), independent of
 *     the app's own light/dark mode so dark-mode readers can read on paper.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, ButtonBase, Dialog, IconButton, Typography, alpha } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import TocIcon from "@mui/icons-material/Toc";
import { GeekSheet, useBackToClose } from "@geeksuite/ui";
import { FONT_MAX, FONT_MIN, FONT_STEP, loadReaderPrefs, saveReaderPrefs } from "../utils/readerPrefs";
import { readerPalette } from "../utils/readerPalette";
import { chapterForHref } from "../utils/readerPosition";
import { SERIF_FONT, WOOD } from "../theme/theme";

const SWIPE_THRESHOLD = 48;
export const AUTO_HIDE_MS = 2500;
const RELOCATE_POLL_MS = 250;
const RELOCATE_POLL_TIMEOUT_MS = 4000;
/** The page-turn strips: the outer quarter on each side. */
const TURN_STRIP = "25%";
/** The progress rail's amber, per page (the app's `progress` tone). */
const RAIL = { light: "#A34E0B", dark: "#F2A73B" };

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}

/** True when a click inside the book was meant for the book, not the chrome. */
function clickBelongsToBook(event) {
  try {
    const target = event?.target;
    if (target?.closest?.("a, button, input, select, textarea, label, [role='button'], [role='link']")) return true;
    const selection = event?.view?.getSelection?.() || target?.ownerDocument?.getSelection?.();
    if (selection && String(selection).trim()) return true;
  } catch {
    // a detached node: treat it as a plain tap
  }
  return false;
}

export default function ReaderModal({
  readerContainerRef,
  readerError,
  readerRenditionRef,
  readerTheme,
  selectedBook,
  setReaderError,
  setReaderOpen,
  setReaderTheme,
  readerToc = [],
  locationsReady = false,
  goToHref,
}) {
  const reducedMotion = usePrefersReducedMotion();
  const mode = readerTheme === "light" ? "light" : "dark";
  const palette = readerPalette(mode);
  const sign = palette.sign;

  const [chromeVisible, setChromeVisible] = useState(true);
  // Bumped by every touch of the chrome, so the auto-hide timer starts over.
  const [chromeKick, setChromeKick] = useState(0);
  const [contentsOpen, setContentsOpen] = useState(false);
  // Keyboard focus inside the chrome holds it up: a control must not fade
  // out from under a visible focus ring.
  const [chromeHeld, setChromeHeld] = useState(false);
  // Remembered on this device (utils/readerPrefs.js).
  const [fontPct, setFontPct] = useState(() => loadReaderPrefs().fontPct || 100);
  const [progressAvailable, setProgressAvailable] = useState(false);
  const [progressPct, setProgressPct] = useState(null);
  const [currentHref, setCurrentHref] = useState(null);
  // True once epub.js has put a page on screen. Until then a middle tap has
  // nothing to land on (the iframe is what toggles the chrome), so the chrome
  // stays up: an EPUB that never opens must not fade away its own Close.
  const [bookRendered, setBookRendered] = useState(false);
  const lastCfiRef = useRef(null);

  const touchStartRef = useRef(null);

  const handleClose = useCallback(() => {
    setReaderOpen(false);
    setReaderError(null);
  }, [setReaderOpen, setReaderError]);

  // Back closes the reader and leaves the book sheet open (review #2).
  useBackToClose(true, handleClose);

  const goPrev = useCallback(() => {
    if (readerRenditionRef.current?.prev) {
      readerRenditionRef.current.prev();
    }
  }, [readerRenditionRef]);

  const goNext = useCallback(() => {
    if (readerRenditionRef.current?.next) {
      readerRenditionRef.current.next();
    }
  }, [readerRenditionRef]);

  const toggleChrome = useCallback(() => {
    setChromeVisible((v) => !v);
    setChromeKick((k) => k + 1);
  }, []);

  /** Any use of the chrome: keep it up and start the timer over. */
  const pokeChrome = useCallback(() => {
    setChromeVisible(true);
    setChromeKick((k) => k + 1);
  }, []);

  const toggleReaderTheme = useCallback(() => {
    setReaderTheme((t) => (t === "dark" ? "light" : "dark"));
  }, [setReaderTheme]);

  const decreaseFont = useCallback(() => {
    setFontPct((v) => {
      const next = Math.max(FONT_MIN, v - FONT_STEP);
      saveReaderPrefs({ fontPct: next });
      return next;
    });
  }, []);

  const increaseFont = useCallback(() => {
    setFontPct((v) => {
      const next = Math.min(FONT_MAX, v + FONT_STEP);
      saveReaderPrefs({ fontPct: next });
      return next;
    });
  }, []);

  // Auto-hide: the chrome hides itself 2.5s after it was last shown or used,
  // and never while Contents is open over it, keyboard focus is inside it,
  // the book has failed (the error is in the bottom bar, Close in the top
  // one) or the book has not drawn its first page yet.
  const chromePinned = contentsOpen || chromeHeld || Boolean(readerError) || !bookRendered;
  useEffect(() => {
    if (readerError) setChromeVisible(true);
  }, [readerError]);
  useEffect(() => {
    if (!chromeVisible || chromePinned) return undefined;
    const id = setTimeout(() => setChromeVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(id);
  }, [chromeVisible, chromeKick, chromePinned]);

  // Font-size stepper → epub.js. Guarded: the rendition may not exist yet
  // (still loading) or the fixture may error before one is created. The
  // opening size is applied by hooks/useReader.js before the first page; a
  // change here reflows the text under epub.js's pixel scroll offset, so the
  // page you were on is displayed again by its CFI.
  const appliedFontRef = useRef(fontPct);
  useEffect(() => {
    if (appliedFontRef.current === fontPct) return;
    appliedFontRef.current = fontPct;
    const rendition = readerRenditionRef.current;
    try {
      const cfi = rendition?.location?.start?.cfi;
      rendition?.themes?.fontSize?.(`${fontPct}%`);
      if (cfi && typeof rendition.display === "function") {
        rendition.display(cfi)?.catch?.(() => {});
      }
    } catch {
      // ignore — rendition not ready / API unavailable
    }
  }, [fontPct, readerRenditionRef]);

  const applyLocation = useCallback((location) => {
    try {
      const start = location?.start;
      if (start?.cfi) lastCfiRef.current = start.cfi;
      // epub.js only knows the book's percentage once its locations exist
      // (hooks/useReader.js generates them after the first page).
      const locations = readerRenditionRef.current?.book?.locations;
      const located = (locations?.length?.() ?? 0) > 0;
      let pct = start?.percentage;
      if (located && typeof pct !== "number" && start?.cfi) {
        pct = locations.percentageFromCfi?.(start.cfi);
      }
      setProgressPct(located && typeof pct === "number" && Number.isFinite(pct) ? Math.round(pct * 100) : null);
      setCurrentHref(start?.href || null);
    } catch {
      // ignore malformed location payloads
    }
  }, [readerRenditionRef]);

  // The latest handlers, for epub.js listeners bound once per rendition.
  const handlersRef = useRef({});
  handlersRef.current = { goPrev, goNext, toggleChrome, handleClose, applyLocation };

  // epub.js's rendition is created asynchronously by hooks/useReader.js (and
  // may never appear if the EPUB fails to load). Poll briefly for it, then
  // listen for page turns, and for taps, swipes and keys inside the book's
  // own iframe (which never reach this document).
  useEffect(() => {
    let cancelled = false;
    let pollId = null;
    let giveUpId = null;
    let detach = null;

    function attach(rendition) {
      if (!rendition || typeof rendition.on !== "function") {
        setProgressAvailable(false);
        return;
      }
      setProgressAvailable(true);
      let touchStart = null;
      const listeners = {
        rendered: () => setBookRendered(true),
        relocated: (location) => {
          setBookRendered(true);
          handlersRef.current.applyLocation(location);
        },
        click: (event) => {
          if (!clickBelongsToBook(event)) handlersRef.current.toggleChrome();
        },
        touchstart: (event) => {
          const t = event?.changedTouches?.[0];
          touchStart = t ? { x: t.clientX, y: t.clientY } : null;
        },
        touchend: (event) => {
          const t = event?.changedTouches?.[0];
          const start = touchStart;
          touchStart = null;
          if (!start || !t) return;
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
            if (dx > 0) handlersRef.current.goPrev();
            else handlersRef.current.goNext();
          }
        },
        keydown: (event) => {
          if (event?.key === "ArrowLeft") handlersRef.current.goPrev();
          else if (event?.key === "ArrowRight") handlersRef.current.goNext();
          else if (event?.key === "Escape") handlersRef.current.handleClose();
        },
      };
      Object.entries(listeners).forEach(([name, fn]) => rendition.on(name, fn));
      detach = () => {
        Object.entries(listeners).forEach(([name, fn]) => {
          try {
            rendition.off?.(name, fn);
          } catch {
            // ignore
          }
        });
      };
      try {
        if (rendition.location) {
          // Already drawn before we got here.
          if (rendition.location.start) setBookRendered(true);
          handlersRef.current.applyLocation(rendition.location);
        }
      } catch {
        // ignore
      }
    }

    if (readerRenditionRef.current) {
      attach(readerRenditionRef.current);
    } else {
      pollId = setInterval(() => {
        if (cancelled) return;
        if (readerRenditionRef.current) {
          clearInterval(pollId);
          pollId = null;
          attach(readerRenditionRef.current);
        }
      }, RELOCATE_POLL_MS);
      giveUpId = setTimeout(() => {
        if (!cancelled && !readerRenditionRef.current) {
          // Giving up has to stop the poll too: without this the 250ms
          // interval kept spinning for as long as an unopenable EPUB stayed
          // on screen.
          if (pollId) {
            clearInterval(pollId);
            pollId = null;
          }
          setProgressAvailable(false);
        }
      }, RELOCATE_POLL_TIMEOUT_MS);
    }

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (giveUpId) clearTimeout(giveUpId);
      if (detach) detach();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBook?.id, selectedBook?._id]);

  // Locations arrive after the first page: re-read where we are so the rail
  // and the percentage fill in without waiting for a page turn.
  useEffect(() => {
    if (!locationsReady) return;
    try {
      const rendition = readerRenditionRef.current;
      const current = rendition?.currentLocation?.();
      if (current?.start) applyLocation(current);
      else if (lastCfiRef.current) applyLocation({ start: { cfi: lastCfiRef.current, href: currentHref } });
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationsReady]);

  const handleKeyDown = useCallback(
    (e) => {
      // React bubbles keys through portals: a key pressed in the Contents
      // sheet (portalled out of this Dialog) is not a key for the page.
      if (!e.currentTarget?.contains?.(e.target)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "Escape") {
        handleClose();
      }
    },
    [goPrev, goNext, handleClose]
  );

  const handleTouchStart = useCallback((e) => {
    const t = e.changedTouches?.[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      const t = e.changedTouches?.[0];
      if (!start || !t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) goPrev();
        else goNext();
      }
    },
    [goPrev, goNext]
  );

  const title = selectedBook?.title || "Untitled";
  const author =
    Array.isArray(selectedBook?.authors) && selectedBook.authors.length > 0
      ? selectedBook.authors.join(", ")
      : null;
  const chapter = chapterForHref(readerToc, currentHref);
  const showPct = progressAvailable && progressPct != null;
  const positionLabel = [showPct ? `${progressPct}%` : null, chapter].filter(Boolean).join(" · ");

  const chromeTransition = reducedMotion ? "none" : "opacity 180ms ease";
  const chromeSx = {
    opacity: chromeVisible ? 1 : 0,
    pointerEvents: chromeVisible ? "auto" : "none",
    transition: chromeTransition,
  };
  // Touching the chrome keeps it up (the stepper used to fade under the thumb).
  const chromeHandlers = {
    onPointerDownCapture: pokeChrome,
    onClickCapture: pokeChrome,
    onFocusCapture: (event) => {
      pokeChrome();
      try {
        if (event.target?.matches?.(":focus-visible")) setChromeHeld(true);
      } catch {
        // no :focus-visible support: the timer alone governs
      }
    },
    onBlurCapture: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setChromeHeld(false);
    },
  };

  const signButtonSx = {
    width: 44,
    height: 44,
    flexShrink: 0,
    color: sign.ink,
    borderRadius: "6px",
    "&:hover": { bgcolor: alpha(sign.ink, 0.12) },
    "&.Mui-disabled": { color: alpha(sign.ink, 0.38) },
    "&.Mui-focusVisible": { outline: `2px solid ${sign.ink}`, outlineOffset: -2 },
  };
  const wood = WOOD[mode];

  return (
    // Portalled like any modal, after the book sheet, so the reader is the
    // top modal: inside the app root it sat under the sheet's aria-hidden
    // and was invisible to screen readers (harness 2026-11-18). The epub.js
    // effect waits for the container node itself (a callback ref in
    // hooks/useReader.js), so the portal's one-tick delay no longer loses it.
    <Dialog
      fullScreen
      open
      onClose={handleClose}
      onKeyDown={handleKeyDown}
      aria-label={`Reading ${title}`}
      data-testid="book-reader"
      sx={{ zIndex: (t) => t.zIndex.modal + 10 }}
      PaperProps={{
        sx: {
          bgcolor: palette.page,
          color: palette.ink,
          height: "100vh",
          "@supports (height: 100dvh)": { height: "100dvh" },
          overflow: "hidden",
        },
      }}
    >
      <Box
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        sx={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          bgcolor: palette.page,
          color: palette.ink,
        }}
      >
        {/* epub.js mounts its iframe here — must fill the surface. */}
        {/* Between the bars, so the bars never sit over the first and last
            lines of a page. */}
        <Box
          ref={readerContainerRef}
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "calc(60px + env(safe-area-inset-top))",
            bottom: "calc(40px + env(safe-area-inset-bottom))",
          }}
        />

        {/* Page-turn strips: the outer quarters. The middle is the book's. */}
        <ButtonBase
          aria-label="Previous page"
          onClick={bookRendered ? goPrev : pokeChrome}
          disableRipple
          sx={{ position: "absolute", top: 0, bottom: 0, left: 0, width: TURN_STRIP, zIndex: 1 }}
        />
        <ButtonBase
          aria-label="Next page"
          onClick={bookRendered ? goNext : pokeChrome}
          disableRipple
          sx={{ position: "absolute", top: 0, bottom: 0, right: 0, width: TURN_STRIP, zIndex: 1 }}
        />

        {/* Top chrome: the signboard. */}
        <Box
          data-reader-chrome="top"
          {...chromeHandlers}
          sx={{
            ...chromeSx,
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 2,
            paddingTop: "env(safe-area-inset-top)",
            minHeight: 60,
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            bgcolor: sign.board,
            color: sign.ink,
            borderBottom: `3px solid ${sign.edge}`,
            boxShadow: "0 2px 6px rgba(20, 12, 4, 0.25)",
          }}
        >
          <IconButton aria-label="Close" onClick={handleClose} sx={signButtonSx}>
            <CloseIcon fontSize="small" />
          </IconButton>

          <Box sx={{ minWidth: 0, flex: 1, textAlign: "center", overflow: "hidden" }}>
            <Typography
              component="h2"
              noWrap
              sx={{ fontFamily: SERIF_FONT, fontWeight: 400, fontSize: 18, color: sign.ink, lineHeight: 1.2 }}
            >
              {title}
            </Typography>
            {author && (
              <Typography variant="caption" noWrap sx={{ display: "block", color: sign.inkSoft }}>
                {author}
              </Typography>
            )}
          </Box>

          {readerToc.length > 0 ? (
            <IconButton
              aria-label="Contents"
              aria-haspopup="dialog"
              onClick={() => setContentsOpen(true)}
              sx={signButtonSx}
            >
              <TocIcon fontSize="small" />
            </IconButton>
          ) : null}
          <IconButton
            aria-label="Decrease font size"
            onClick={decreaseFont}
            disabled={fontPct <= FONT_MIN}
            sx={signButtonSx}
          >
            <Typography component="span" sx={{ fontSize: 14, fontWeight: 600, color: "inherit" }}>
              A−
            </Typography>
          </IconButton>
          <IconButton
            aria-label="Increase font size"
            onClick={increaseFont}
            disabled={fontPct >= FONT_MAX}
            sx={signButtonSx}
          >
            <Typography component="span" sx={{ fontSize: 18, fontWeight: 600, color: "inherit" }}>
              A+
            </Typography>
          </IconButton>
          <IconButton aria-label="Toggle reader theme" onClick={toggleReaderTheme} sx={signButtonSx}>
            {mode === "dark" ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
          </IconButton>
        </Box>

        {/* Bottom chrome: where you are in the book, over a shelf edge. */}
        <Box
          data-reader-chrome="bottom"
          {...chromeHandlers}
          sx={{
            ...chromeSx,
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 2,
            paddingBottom: "env(safe-area-inset-bottom)",
            bgcolor: alpha(palette.page, 0.94),
            borderTop: `3px solid ${wood.front}`,
          }}
        >
          {progressAvailable && (
            <Box
              role="progressbar"
              aria-label="Position in the book"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPct ?? undefined}
              sx={{ height: 3, bgcolor: alpha(RAIL[mode], 0.22) }}
            >
              <Box
                data-testid="reader-progress-fill"
                sx={{
                  height: "100%",
                  width: `${progressPct != null ? progressPct : 0}%`,
                  bgcolor: RAIL[mode],
                  transition: chromeTransition,
                }}
              />
            </Box>
          )}
          <Box sx={{ px: 2, py: 1, minHeight: 36, display: "flex", alignItems: "center" }}>
            <Typography
              variant="caption"
              noWrap
              data-testid="reader-position"
              // A failed book is announced; the position is not (it changes every page).
              role={readerError ? "alert" : undefined}
              sx={{
                color: readerError ? (mode === "dark" ? "#F59A9A" : "#B02A2A") : palette.ink,
                flex: 1,
                minWidth: 0,
                textAlign: "center",
              }}
            >
              {readerError || positionLabel}
            </Typography>
          </Box>
        </Box>
      </Box>

      <GeekSheet
        open={contentsOpen}
        onClose={() => setContentsOpen(false)}
        title="Contents"
        maxWidth="xs"
        // Above the reader, which sits at modal + 10 without a portal.
        drawerProps={{ sx: { zIndex: (t) => t.zIndex.modal + 20 } }}
        dialogProps={{ sx: { zIndex: (t) => t.zIndex.modal + 20 } }}
      >
        <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0 }}>
          {readerToc.map((item) => {
            const current = item.label === chapter;
            return (
              <Box component="li" key={item.id}>
                <ButtonBase
                  aria-current={current ? "location" : undefined}
                  onClick={() => {
                    setContentsOpen(false);
                    goToHref?.(item.href);
                  }}
                  sx={{
                    width: "100%",
                    minHeight: 44,
                    justifyContent: "flex-start",
                    textAlign: "left",
                    pl: 1 + item.depth * 2,
                    pr: 1,
                    borderRadius: "6px",
                    typography: "body2",
                    fontWeight: current ? 700 : 400,
                    color: current ? "primary.main" : "text.primary",
                    borderLeft: current ? (t) => `3px solid ${t.palette.primary.main}` : "3px solid transparent",
                    "&:hover": { bgcolor: "action.hover" },
                    "&.Mui-focusVisible": { outline: (t) => `2px solid ${t.palette.primary.main}` },
                  }}
                >
                  {item.label}
                </ButtonBase>
              </Box>
            );
          })}
        </Box>
      </GeekSheet>
    </Dialog>
  );
}
