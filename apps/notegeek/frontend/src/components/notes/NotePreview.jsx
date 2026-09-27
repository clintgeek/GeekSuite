import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Box, useTheme, alpha } from '@mui/material';
import { decodeCodeNote } from '../../utils/previewText';
import { cachedGeometry, mindMapGeometry, sketchGeometry, thumbnailKey, tintCodeLine } from '../../utils/thumbnails';
import { noteTypeColor, noteTypeInk, stampFill, surfaces } from '../../theme/tokens';
import { noteTypeMeta } from './noteTypeMeta';

/**
 * Type-appropriate previews for list rows.
 *
 *   CodePreview  — the first two lines of code, in mono, with a regex tint
 *                  (keywords in the code ink, strings in markdown blue,
 *                  comments muted). Every tint colour is a `noteTypeInk` or
 *                  `text.secondary`, all of which clear 4.5:1 on the row.
 *   NoteThumb    — a 64x48 tile: sketch strokes as an SVG, a mind map's root
 *                  and first children as a mini diagram, or — when there is
 *                  nothing cheap to draw — the type's glyph.
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

// ─── Code ───────────────────────────────────────────────────────────────────

export function CodePreview({ content, lines = 2 }) {
  const theme = useTheme();
  const { code, language } = useMemo(() => decodeCodeNote(content), [content]);
  const shown = useMemo(
    () => code.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, lines),
    [code, lines]
  );
  if (!shown.length) return null;

  const colors = {
    keyword: noteTypeInk(theme, 'code'),
    string: noteTypeInk(theme, 'markdown'),
    number: noteTypeInk(theme, 'mindmap'),
    comment: theme.palette.text.secondary,
    plain: theme.palette.text.primary,
  };

  return (
    <Box
      component="pre"
      data-language={language || undefined}
      sx={{
        m: 0,
        mt: '4px',
        py: '4px',
        pl: '8px',
        borderLeft: `2px solid ${alpha(noteTypeColor(theme, 'code'), 0.5)}`,
        fontFamily: theme.typography.fontFamilyMono,
        fontSize: '0.75rem',
        lineHeight: 1.55,
        overflow: 'hidden',
        whiteSpace: 'pre',
        textOverflow: 'ellipsis',
        fontVariantLigatures: 'none',
        color: colors.plain,
      }}
    >
      {shown.map((line, i) => (
        <Box component="span" key={i} sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {tintCodeLine(line.slice(0, 160)).map((tok, j) => (
            <span
              key={j}
              style={tok.kind === 'plain' ? undefined : {
                color: colors[tok.kind],
                fontStyle: tok.kind === 'comment' ? 'italic' : undefined,
                fontWeight: tok.kind === 'keyword' ? 600 : undefined,
              }}
            >
              {tok.text}
            </span>
          ))}
        </Box>
      ))}
    </Box>
  );
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

function MindMapSvg({ geometry, color, muted }) {
  const n = Math.max(geometry.children.length, 1);
  const w = THUMB_W - 8;
  const h = THUMB_H - 8;
  const rootW = 18;
  const rootH = 10;
  const rootX = 2;
  const rootY = h / 2 - rootH / 2;
  const kidX = 34;
  const kidW = w - kidX - 2;
  const gap = h / n;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden focusable="false">
      {geometry.children.map((_, i) => {
        const cy = gap * i + gap / 2;
        const midX = (rootX + rootW + kidX) / 2;
        return (
          <path
            key={`e${i}`}
            d={`M${rootX + rootW} ${h / 2} H${midX} V${cy} H${kidX}`}
            fill="none"
            stroke={color}
            strokeWidth="1"
            opacity="0.7"
          />
        );
      })}
      <rect x={rootX} y={rootY} width={rootW} height={rootH} rx="2" fill={color} />
      {geometry.children.map((label, i) => {
        const cy = gap * i + gap / 2;
        // Bar length hints at label length without drawing unreadable text.
        const len = Math.max(8, Math.min(kidW, 6 + label.length * 1.1));
        return <rect key={`k${i}`} x={kidX} y={cy - 2.5} width={len} height="5" rx="2" fill={muted} />;
      })}
    </svg>
  );
}

function NoteThumbInner({ note }) {
  const theme = useTheme();
  const type = note.type || 'text';
  const [ref, inView] = useInView();
  const key = thumbnailKey(note);
  const meta = noteTypeMeta(type);

  // Parse off the render path: once the tile is near the viewport, in an
  // idle slot, one note per task. A 1MB sketch is ~10ms of JSON.parse; eight
  // of them inside one render was a visible hitch, eight idle tasks is not.
  // A version parsed before (a remount, a re-sort) paints on the first frame.
  const [geometry, setGeometry] = useState(() => cachedGeometry(type, key));
  useEffect(() => {
    if (!inView || (type !== 'handwritten' && type !== 'mindmap')) return undefined;
    const hit = cachedGeometry(type, key);
    if (hit !== undefined) {
      setGeometry(hit);
      return undefined;
    }
    const run = () => setGeometry(
      type === 'handwritten' ? sketchGeometry(note.content, key) : mindMapGeometry(note.content, key)
    );
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 0);
    return () => window.clearTimeout(id);
  }, [inView, type, key, note.content]);

  const color = noteTypeColor(theme, type);

  if (type === 'handwritten' && geometry) {
    return (
      <Tile type={type} label="Sketch preview" innerRef={ref}>
        <SketchSvg geometry={geometry} color={theme.palette.text.primary} />
      </Tile>
    );
  }
  if (type === 'mindmap' && geometry) {
    const extra = geometry.more ? ` and ${geometry.more} more` : '';
    return (
      <Tile
        type={type}
        label={`Mind map: ${geometry.root}${geometry.children.length ? ` → ${geometry.children.join(', ')}${extra}` : ''}`}
        innerRef={ref}
      >
        <MindMapSvg geometry={geometry} color={color} muted={alpha(theme.palette.text.primary, 0.35)} />
      </Tile>
    );
  }
  return (
    <Tile type={type} label={`${meta.long} note`} innerRef={ref}>
      <Glyph type={type} />
    </Tile>
  );
}

/** Re-renders only when this note's version changes. */
export const NoteThumb = memo(NoteThumbInner, (a, b) => thumbnailKey(a.note) === thumbnailKey(b.note) && a.note.type === b.note.type);
