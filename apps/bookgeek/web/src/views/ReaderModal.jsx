/**
 * BookGeek in-browser EPUB reader — true full-screen surface (MOBILE_UI_PLAN §3.3).
 *
 * The epub.js rendition is still mounted by the effect in `App` — it owns
 * `readerContainerRef` / `readerRenditionRef` — so both refs are threaded in
 * as props and only the chrome lives here: tap zones for paging, an
 * auto-hiding top/bottom chrome, a font-size stepper and a reader theme
 * toggle, and a progress rail driven by epub.js's `relocated` event.
 *
 * Reader surface colors are intentionally NOT theme tokens — the reader has
 * its own dark/light "page" pair (independent of the app's light/dark mode)
 * so a reader in dark mode can still read a book on a warm paper page.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Dialog, IconButton, Typography, ButtonBase, alpha } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";

// The reader's own page/ink pair — separate from the app's theme, per the
// mobile plan: "dark: #0f172a page / #e2e8f0 ink; light: #f6f1e7 (warm
// paper) / #1f2937 ink; follow readerTheme".
const READER_PALETTES = {
  dark: { page: "#0f172a", ink: "#e2e8f0" },
  light: { page: "#f6f1e7", ink: "#1f2937" },
};

const FONT_MIN = 90;
const FONT_MAX = 160;
const FONT_STEP = 10;
const SWIPE_THRESHOLD = 48;
const AUTO_HIDE_MS = 2500;
const RELOCATE_POLL_MS = 250;
const RELOCATE_POLL_TIMEOUT_MS = 4000;

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

export default function ReaderModal({
  readerContainerRef,
  readerError,
  readerRenditionRef,
  readerTheme,
  selectedBook,
  setReaderError,
  setReaderOpen,
  setReaderTheme,
}) {
  const theme = useTheme();
  const reducedMotion = usePrefersReducedMotion();
  const palette = READER_PALETTES[readerTheme] || READER_PALETTES.dark;

  const [chromeVisible, setChromeVisible] = useState(true);
  const [fontPct, setFontPct] = useState(100);
  const [progressAvailable, setProgressAvailable] = useState(false);
  const [progressPct, setProgressPct] = useState(null);
  const [locationLabel, setLocationLabel] = useState(null);

  const touchStartRef = useRef(null);

  const handleClose = useCallback(() => {
    setReaderOpen(false);
    setReaderError(null);
  }, [setReaderOpen, setReaderError]);

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
  }, []);

  const toggleReaderTheme = useCallback(() => {
    setReaderTheme((t) => (t === "dark" ? "light" : "dark"));
  }, [setReaderTheme]);

  const decreaseFont = useCallback(() => {
    setFontPct((v) => Math.max(FONT_MIN, v - FONT_STEP));
  }, []);

  const increaseFont = useCallback(() => {
    setFontPct((v) => Math.min(FONT_MAX, v + FONT_STEP));
  }, []);

  // Auto-hide: chrome shows on open (and whenever a center tap reveals it
  // again), hides itself 2.5s later. Cleared on unmount / re-trigger.
  useEffect(() => {
    if (!chromeVisible) return undefined;
    const id = setTimeout(() => setChromeVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(id);
  }, [chromeVisible]);

  // Font-size stepper → epub.js. Guarded: the rendition may not exist yet
  // (still loading) or the fixture may error before one is created.
  useEffect(() => {
    try {
      readerRenditionRef.current?.themes?.fontSize?.(`${fontPct}%`);
    } catch {
      // ignore — rendition not ready / API unavailable
    }
  }, [fontPct, readerRenditionRef]);

  // Progress rail: epub.js exposes `relocated` on the rendition, but the
  // rendition is created asynchronously by the effect in App.jsx (and may
  // never appear at all if the EPUB fails to load). Poll briefly for it,
  // then listen for page turns; if it never shows up, leave the rail hidden.
  useEffect(() => {
    let cancelled = false;
    let pollId = null;
    let giveUpId = null;
    let detach = null;

    function applyLocation(location) {
      try {
        const pct = location?.start?.percentage;
        if (typeof pct === "number" && Number.isFinite(pct)) {
          setProgressPct(Math.round(pct * 100));
        } else {
          setProgressPct(null);
        }
        const displayed = location?.start?.displayed;
        if (displayed && displayed.page != null && displayed.total != null) {
          setLocationLabel(`Page ${displayed.page} of ${displayed.total}`);
        } else if (location?.start?.href) {
          setLocationLabel(location.start.href);
        } else {
          setLocationLabel(null);
        }
      } catch {
        // ignore malformed location payloads
      }
    }

    function attach(rendition) {
      if (!rendition || typeof rendition.on !== "function") {
        setProgressAvailable(false);
        return;
      }
      setProgressAvailable(true);
      const handleRelocated = (location) => applyLocation(location);
      rendition.on("relocated", handleRelocated);
      detach = () => {
        try {
          rendition.off?.("relocated", handleRelocated);
        } catch {
          // ignore
        }
      };
      try {
        if (rendition.location) applyLocation(rendition.location);
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

  const handleKeyDown = useCallback(
    (e) => {
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

  const chromeTransition = reducedMotion ? "none" : "opacity 180ms ease";
  const chromeSx = {
    opacity: chromeVisible ? 1 : 0,
    pointerEvents: chromeVisible ? "auto" : "none",
    transition: chromeTransition,
  };

  const hairline = alpha(palette.ink, 0.14);

  return (
    // `disablePortal`: the epub.js effect in App.jsx (which this file cannot
    // edit) mounts synchronously on `readerOpen` with a one-shot guard —
    // `if (!readerContainerRef.current) return;`, never retried. MUI's
    // default Modal portal resolves its mount node one tick after the first
    // commit, so the container ref is still null the instant that effect's
    // dependencies fire and the load never starts. Rendering inline keeps the
    // ref's DOM node — and thus the ref — attached in the very same commit.
    // `zIndex` compensates for skipping the portal (which would otherwise
    // place us after the book-detail dialog's own portalled backdrop in the
    // DOM, and lose a z-index tie to it).
    <Dialog
      fullScreen
      open
      disablePortal
      onClose={handleClose}
      onKeyDown={handleKeyDown}
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
        <Box ref={readerContainerRef} sx={{ position: "absolute", inset: 0 }} />

        {/* Tap zones */}
        <ButtonBase
          aria-label="Previous page"
          onClick={goPrev}
          disableRipple
          sx={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "33.34%", zIndex: 1 }}
        />
        <ButtonBase
          aria-label="Toggle controls"
          onClick={toggleChrome}
          disableRipple
          sx={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "33.34%",
            width: "33.32%",
            zIndex: 1,
          }}
        />
        <ButtonBase
          aria-label="Next page"
          onClick={goNext}
          disableRipple
          sx={{ position: "absolute", top: 0, bottom: 0, right: 0, width: "33.34%", zIndex: 1 }}
        />

        {/* Top chrome */}
        <Box
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
            gap: 1,
            px: 1,
            bgcolor: alpha(palette.page, 0.72),
            backdropFilter: "blur(10px)",
            borderBottom: `1px solid ${hairline}`,
          }}
        >
          <IconButton
            aria-label="Close"
            onClick={handleClose}
            sx={{ width: 44, height: 44, color: palette.ink, flexShrink: 0 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>

          <Box sx={{ minWidth: 0, flex: 1, textAlign: "center", overflow: "hidden" }}>
            <Typography
              variant="body1"
              noWrap
              sx={{ fontWeight: 500, color: palette.ink, lineHeight: 1.2 }}
            >
              {title}
            </Typography>
            {author && (
              <Typography
                variant="caption"
                noWrap
                sx={{ display: "block", color: alpha(palette.ink, 0.7) }}
              >
                {author}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, flexShrink: 0 }}>
            <IconButton
              aria-label="Decrease font size"
              onClick={decreaseFont}
              disabled={fontPct <= FONT_MIN}
              sx={{ width: 44, height: 44, color: palette.ink }}
            >
              <Typography component="span" sx={{ fontSize: 14, fontWeight: 600 }}>
                A−
              </Typography>
            </IconButton>
            <IconButton
              aria-label="Increase font size"
              onClick={increaseFont}
              disabled={fontPct >= FONT_MAX}
              sx={{ width: 44, height: 44, color: palette.ink }}
            >
              <Typography component="span" sx={{ fontSize: 18, fontWeight: 600 }}>
                A+
              </Typography>
            </IconButton>
            <IconButton
              aria-label="Toggle reader theme"
              onClick={toggleReaderTheme}
              sx={{ width: 44, height: 44, color: palette.ink }}
            >
              {readerTheme === "dark" ? (
                <Brightness7Icon fontSize="small" />
              ) : (
                <Brightness4Icon fontSize="small" />
              )}
            </IconButton>
          </Box>
        </Box>

        {/* Bottom chrome */}
        <Box
          sx={{
            ...chromeSx,
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 2,
            paddingBottom: "env(safe-area-inset-bottom)",
            bgcolor: alpha(palette.page, 0.72),
            backdropFilter: "blur(10px)",
            borderTop: `1px solid ${hairline}`,
          }}
        >
          {progressAvailable && (
            <Box sx={{ height: 2, bgcolor: alpha(theme.palette.progress.main, 0.25) }}>
              <Box
                sx={{
                  height: "100%",
                  width: `${progressPct != null ? progressPct : 0}%`,
                  bgcolor: theme.palette.progress.main,
                  transition: chromeTransition,
                }}
              />
            </Box>
          )}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              px: 2,
              py: 1,
            }}
          >
            <Typography
              variant="caption"
              noWrap
              sx={{
                color: readerError ? theme.palette.error.main : alpha(palette.ink, 0.7),
                flex: 1,
                minWidth: 0,
              }}
            >
              {readerError || locationLabel || ""}
            </Typography>
            {progressAvailable && progressPct != null && (
              <Typography
                variant="caption"
                sx={{ fontFamily: '"Roboto Mono", monospace', color: palette.ink, flexShrink: 0 }}
              >
                {progressPct}%
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
}
