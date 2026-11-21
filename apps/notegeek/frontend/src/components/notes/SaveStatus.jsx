import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, ButtonBase, Tooltip, useTheme, keyframes } from '@mui/material';
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined';
import ErrorOutline from '@mui/icons-material/ErrorOutline';
import { saveStampState } from '../../utils/saveStamp';
import { graphiteTokens, tapTarget44 } from '../../theme/tokens';
import useEditorChrome from '../../store/editorChromeStore';

/** On the page for a screen reader, not on the screen. */
const visuallyHidden = {
  position: 'absolute',
  // Strings, not numbers: in `sx` a bare 1 means 100%, which made this
  // "hidden" span a page wide and scrolled every editor sideways.
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * Is a box on the part of the page the person can see? That is the VISUAL
 * viewport: on a phone the keyboard covers the page rather than shrinking
 * it, and the browser pans to keep the caret in sight, so a head still
 * inside the layout viewport (all an IntersectionObserver measures) can be
 * off the top of the screen. `vv` is `window.visualViewport` (null: the
 * window is the screen). A box with no size has not been laid out (a test
 * DOM): call it seen, rather than say a failed save twice.
 */
export function onScreen(rect, vv = null) {
  if (!rect || (!rect.width && !rect.height)) return true;
  const top = vv ? vv.offsetTop || 0 : 0;
  const left = vv ? vv.offsetLeft || 0 : 0;
  const height = vv ? vv.height : (typeof window !== 'undefined' ? window.innerHeight : 0);
  const width = vv ? vv.width : (typeof window !== 'undefined' ? window.innerWidth : 0);
  if (!height || !width) return true;
  return rect.bottom > top && rect.top < top + height && rect.right > left && rect.left < left + width;
}

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`;

/** Re-render twice a minute so "saved · just now" ages honestly. */
function useAgingNow(lastSavedAt) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!lastSavedAt) return undefined;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, [lastSavedAt]);
  return now;
}

/**
 * SaveStatus — the editor's save state, QUIET.
 *
 * Small lowercase mono in secondary ink, under the title, beside the type:
 * "saved · 3m ago", "editing", "saving…". It is always there and always the
 * one `role="status"` on the page, so a screen reader hears every change
 * without focus moving. When a save has failed, `SaveAlert` in the header
 * is what the eye gets; this stamp still says "not saved" to a screen reader
 * but steps off the screen, so the page does not say it twice a line apart
 * (review 2026-11-18, #3).
 */
export function SaveStatus({ saving, error, empty, dirty, offline, lastSavedAt, sx }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const now = useAgingNow(lastSavedAt);
  const { tone, label, loud } = saveStampState({ saving, error, empty, dirty, offline, lastSavedAt, now });

  return (
    <Box
      component="span"
      role="status"
      aria-live="polite"
      data-save-state={tone}
      data-save-loud={loud ? 'true' : undefined}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: theme.typography.fontFamilyMono,
        wordSpacing: 'normal',
        fontSize: '0.75rem',
        lineHeight: 1.3,
        color: loud ? g.error : 'text.secondary',
        whiteSpace: 'nowrap',
        ...sx,
        ...(loud ? visuallyHidden : null),
      }}
    >
      {tone === 'saving' && (
        <Box
          component="span"
          aria-hidden
          sx={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            bgcolor: 'currentColor',
            animation: `${pulse} 1s ease-in-out infinite`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        />
      )}
      {label}
    </Box>
  );
}

/**
 * SaveAlert — the save state, LOUD, and only when it has to be: a failed
 * save, or unsaved work while offline. Error ink on its own tint, an icon,
 * and a Retry. Renders nothing when things are fine, so the header's prime
 * spot is empty on a good day.
 *
 * The detail (the gateway's message) is in the tooltip and was already
 * raised as a toast.
 *
 * `reportInView` (the header's copy): tells editorChromeStore whether this
 * pill is on screen, so the phone's docked copy appears only once it has
 * scrolled away. `compact` (the docked copy): the icon and Retry only — the
 * words are in the head and the toast — so the formatting tools keep the
 * phone's tool row.
 */
export function SaveAlert({ saving, error, empty, dirty, offline, lastSavedAt, onRetry, compact = false, reportInView = false, sx }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const { tone, label, loud } = saveStampState({ saving, error, empty, dirty, offline, lastSavedAt });
  const ref = useRef(null);
  const setAlertInView = useEditorChrome((s) => s.setAlertInView);
  // A layout effect, measured once at once: the store is right before the
  // first paint, so the docked copy never flashes up for a frame while an
  // observer's first callback is on its way. Then it follows the page: the
  // observer (scrolled out of the layout viewport), any scroll (a scroller
  // inside the page), and the visual viewport panning or resizing (the
  // phone's keyboard).
  useLayoutEffect(() => {
    if (!reportInView || !loud) return undefined;
    const el = ref.current;
    if (!el || typeof window === 'undefined') {
      setAlertInView(true);
      return () => setAlertInView(false);
    }
    const vv = window.visualViewport || null;
    let frame = 0;
    const measure = () => {
      frame = 0;
      setAlertInView(onScreen(el.getBoundingClientRect(), window.visualViewport || null));
    };
    const later = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    const IO = window.IntersectionObserver;
    const io = IO ? new IO((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      if (!entry.isIntersecting) setAlertInView(false);
      else setAlertInView(onScreen(entry.boundingClientRect || el.getBoundingClientRect(), window.visualViewport || null));
    }) : null;
    io?.observe(el);
    vv?.addEventListener?.('scroll', later);
    vv?.addEventListener?.('resize', later);
    document.addEventListener('scroll', later, { capture: true, passive: true });
    return () => {
      io?.disconnect();
      vv?.removeEventListener?.('scroll', later);
      vv?.removeEventListener?.('resize', later);
      document.removeEventListener('scroll', later, { capture: true });
      if (frame) window.cancelAnimationFrame(frame);
      setAlertInView(false);
    };
  }, [reportInView, loud, setAlertInView]);
  if (!loud) return null;

  const Icon = tone === 'offline' ? CloudOffOutlined : ErrorOutline;
  const pill = (
    <Box
      ref={ref}
      data-save-alert={tone}
      data-save-alert-compact={compact ? 'true' : undefined}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        minHeight: 32,
        pl: compact ? '8px' : '10px',
        pr: onRetry ? '2px' : (compact ? '8px' : '10px'),
        borderRadius: '999px',
        bgcolor: g.errorFill,
        color: g.error,
        fontSize: '0.8125rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        ...sx,
      }}
    >
      <Icon aria-hidden sx={{ fontSize: 16 }} />
      {compact
        ? <Box component="span" sx={visuallyHidden}>{label}</Box>
        : <span>{label}</span>}
      {onRetry && (
        <ButtonBase
          onClick={onRetry}
          disabled={saving}
          sx={{
            ...tapTarget44,
            px: '10px',
            borderRadius: '999px',
            fontSize: '0.8125rem',
            fontWeight: 650,
            color: g.error,
            textDecoration: 'underline',
            textUnderlineOffset: '3px',
            '&:hover': { textDecorationThickness: '2px' },
            '&:focus-visible': { outline: `2px solid ${g.error}`, outlineOffset: -4 },
          }}
        >
          Retry
        </ButtonBase>
      )}
    </Box>
  );

  if (typeof error === 'string' && error) {
    return <Tooltip title={error} arrow>{pill}</Tooltip>;
  }
  return pill;
}

export default SaveStatus;
