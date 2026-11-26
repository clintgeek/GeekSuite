import React, { memo, useContext, useEffect, useRef, useState } from 'react';
import { getApolloContext } from '@apollo/client';
import { NOTE_THUMB_CONTENT } from '../../graphql/queries';
import { Box, useTheme, alpha } from '@mui/material';
import { cachedGeometry, sketchGeometry, thumbnailKey } from '../../utils/thumbnails';
import { noteTypeInk, stampFill, surfaces } from '../../theme/tokens';
import { noteTypeMeta } from './noteTypeMeta';

/**
 * The sketch thumbnail for list rows.
 *
 *   NoteThumb    — a 64x48 tile: sketch strokes as an SVG or, when there is
 *                  nothing cheap to draw, the type's glyph.
 *
 * Performance: thumbnails parse JSON that can be megabytes, so a tile does
 * nothing until it scrolls into view (IntersectionObserver, with a margin so
 * it is ready by the time it arrives), the geometry is memoised per note
 * version in utils/thumbnails.js, and the tile itself is `memo`'d on that
 * key so a parent re-render never repaints it.
 */

// ─── Lazy-in-view ───────────────────────────────────────────────────────────

function useInView(rootMargin = '200px') {
  const ref = useRef(null);
  const [inView, setInView] = useState(
    () => typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined'
  );
  useEffect(() => {
    if (inView) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const io = new window.IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setInView(true);
        io.disconnect();
      }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);
  return [ref, inView];
}

// ─── Thumbnails ─────────────────────────────────────────────────────────────

const THUMB_W = 64;
const THUMB_H = 48;

function Tile({ children, type, label, innerRef }) {
  const theme = useTheme();
  const ink = noteTypeInk(theme, type);
  return (
    <Box
      ref={innerRef}
      role="img"
      aria-label={label}
      sx={{
        width: THUMB_W,
        height: THUMB_H,
        flexShrink: 0,
        borderRadius: '3px',
        border: `1px solid ${alpha(ink, 0.3)}`,
        bgcolor: surfaces(theme).elevated,
        // The tile is a scrap of the same dot-grid page.
        backgroundImage: `radial-gradient(circle at 1px 1px, ${alpha(theme.palette.text.primary, 0.1)} 0.6px, transparent 1px)`,
        backgroundSize: '8px 8px',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        color: ink,
      }}
    >
      {children}
    </Box>
  );
}

function Glyph({ type }) {
  const theme = useTheme();
  const Icon = noteTypeMeta(type).Icon;
  const ink = noteTypeInk(theme, type);
  return (
    <Box
      sx={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        bgcolor: stampFill(theme, ink),
      }}
    >
      <Icon sx={{ fontSize: 18 }} />
    </Box>
  );
}

function SketchSvg({ geometry, color }) {
  return (
    <svg
      width={THUMB_W - 8}
      height={THUMB_H - 8}
      viewBox={geometry.viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      focusable="false"
    >
      {geometry.boxes.map((b, i) => (
        <rect key={`b${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke={color} strokeWidth={geometry.strokeWidth} rx={geometry.strokeWidth} />
      ))}
      {geometry.paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth={geometry.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

function NoteThumbInner({ note }) {
  const theme = useTheme();
  const type = 'handwritten';
  const [ref, inView] = useInView();
  const key = thumbnailKey(note);
  const meta = noteTypeMeta(type);
  // List rows no longer carry the body (5.1): a sketch's is megabytes. The
  // tile fetches its own note's body once it is near the screen — one note,
  // only the ones actually scrolled to, and from the cache when the note was
  // opened before (same `note(id)` entry as the editor's).
  const apollo = useContext(getApolloContext())?.client || null;
  const [fetched, setFetched] = useState(null);
  const body = typeof note.content === 'string' ? note.content : fetched;
  useEffect(() => {
    if (typeof note.content === 'string' || !inView || !apollo) return undefined;
    if (cachedGeometry(key) !== undefined) return undefined;
    let alive = true;
    apollo.query({ query: NOTE_THUMB_CONTENT, variables: { id: note.id || note._id }, fetchPolicy: 'cache-first' })
      .then(({ data }) => { if (alive) setFetched(data?.note?.content || ''); })
      .catch(() => {});
    return () => { alive = false; };
  }, [apollo, inView, key, note.content, note.id, note._id]);

  // Parse off the render path: once the tile is near the viewport, in an
  // idle slot, one note per task. A 1MB sketch is ~10ms of JSON.parse; eight
  // of them inside one render was a visible hitch, eight idle tasks is not.
  // A version parsed before (a remount, a re-sort) paints on the first frame.
  const [geometry, setGeometry] = useState(() => cachedGeometry(key));
  useEffect(() => {
    if (!inView) return undefined;
    const hit = cachedGeometry(key);
    if (hit !== undefined) {
      setGeometry(hit);
      return undefined;
    }
    if (typeof body !== 'string') return undefined; // still fetching
    const run = () => setGeometry(sketchGeometry(body, key));
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 0);
    return () => window.clearTimeout(id);
  }, [inView, key, body]);

  if (geometry) {
    return (
      <Tile type={type} label="Handwriting preview" innerRef={ref}>
        <SketchSvg geometry={geometry} color={theme.palette.text.primary} />
      </Tile>
    );
  }
  return (
    <Tile type={type} label={`${meta.aria} thumbnail`} innerRef={ref}>
      <Glyph type={type} />
    </Tile>
  );
}

/** Re-renders only when this note's version changes. */
export const NoteThumb = memo(NoteThumbInner, (a, b) => thumbnailKey(a.note) === thumbnailKey(b.note));
