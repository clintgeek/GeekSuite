/**
 * A numeric range facet (release year, read year, rating): a two-thumb
 * slider laid over the collection's histogram. The bars are the live counts
 * (every other filter applied); the slider's ends are the whole collection's
 * first and last bucket, so the track does not jump as other filters change.
 * Bars inside the chosen range glow (the theme's `phosphor`, else primary);
 * outside it they fall back to a faint slate.
 *
 * Behind the live bars, the unfiltered collection's shape is drawn fainter
 * still, so a narrow filter does not leave the track looking empty.
 *
 * The URL is written when a thumb is let go (onChangeCommitted), not on every
 * pixel of a drag, and a thumb parked at the collection's edge means "no
 * limit" on that side — so dragging back to the ends clears the filter:
 * `onCommit({ min, max })` with null for an open side.
 *
 * Buckets are `{ [bucketKey]: number, count }` (GameGeek's are `{ year, count }`).
 * `labels` words it: { any, empty, single(lo), minAria, maxAria }.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Slider, alpha, useTheme } from '@mui/material';

const DEFAULT_LABELS = {
  any: 'Any',
  empty: 'Nothing recorded yet.',
  single: (lo) => `Everything here is ${lo}.`,
  minAria: 'Minimum',
  maxAria: 'Maximum',
};

export default function RangeFacet({ baseBuckets = [], liveBuckets, bucketKey = 'value', min: selMin, max: selMax, step = 1, onCommit, labels: labelsIn }) {
  const labels = { ...DEFAULT_LABELS, ...labelsIn };
  const theme = useTheme();
  const years = useMemo(() => baseBuckets.map((b) => b[bucketKey]).filter(Number.isFinite), [baseBuckets, bucketKey]);
  const lo = years.length ? Math.min(...years) : null;
  const hi = years.length ? Math.max(...years) : null;

  const clampLo = selMin != null && lo != null ? Math.max(lo, Math.min(selMin, hi)) : lo;
  const clampHi = selMax != null && hi != null ? Math.min(hi, Math.max(selMax, lo)) : hi;
  const [value, setValue] = useState([clampLo, clampHi]);
  useEffect(() => setValue([clampLo, clampHi]), [clampLo, clampHi]);

  const counts = useMemo(() => new Map((liveBuckets ?? baseBuckets).map((b) => [b[bucketKey], b.count])), [liveBuckets, baseBuckets, bucketKey]);
  const ghost = useMemo(() => new Map(baseBuckets.map((b) => [b[bucketKey], b.count])), [baseBuckets, bucketKey]);

  if (lo == null) {
    return <Box sx={{ px: 1, py: 0.5, fontSize: '0.8125rem', color: 'text.secondary' }}>{labels.empty}</Box>;
  }

  if (lo === hi) {
    return <Box sx={{ px: 1, py: 0.5, fontSize: '0.8125rem', color: 'text.secondary' }}>{labels.single(lo)}</Box>;
  }

  const span = hi - lo + 1;
  const peak = Math.max(1, ...[...ghost.values()]);
  const [a, b] = value;
  const full = a === lo && b === hi;
  const inRange = (y) => y >= a && y <= b;
  const on = theme.palette.phosphor?.main ?? theme.palette.primary.main;
  const off = theme.palette.text.secondary;

  return (
    <Box sx={{ px: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
        <Box component="span" sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
          {full ? labels.any : a === b ? String(a) : `${a} – ${b}`}
        </Box>
      </Box>
      <Box sx={{ position: 'relative', px: '10px' }}>
        <Box
          component="svg"
          aria-hidden="true"
          viewBox={`0 0 ${hi - lo} 100`}
          preserveAspectRatio="none"
          sx={{ display: 'block', width: '100%', height: 40, overflow: 'visible' }}
        >
          {/* The whole collection's shape, faint; the live bars share its scale,
              so a narrowed range reads as "this much of it". */}
          {Array.from({ length: span }, (_, i) => {
            const c = ghost.get(lo + i) ?? 0;
            if (!c) return null;
            const h = Math.max(6, (c / peak) * 100);
            return <rect key={`g${i}`} x={i - 0.38} y={100 - h} width={0.76} height={h} rx={0.2} fill={alpha(off, 0.1)} />;
          })}
          {Array.from({ length: span }, (_, i) => {
            const y = lo + i;
            const c = counts.get(y) ?? 0;
            if (!c) return null;
            const h = Math.max(6, (c / peak) * 100);
            return (
              <rect
                key={y}
                x={i - 0.38}
                y={100 - h}
                width={0.76}
                height={h}
                rx={0.2}
                fill={inRange(y) ? alpha(on, theme.palette.mode === 'dark' ? 0.6 : 0.55) : alpha(off, 0.22)}
              />
            );
          })}
        </Box>
        <Slider
          value={value}
          min={lo}
          max={hi}
          step={step}
          disableSwap
          onChange={(_e, v) => setValue(v)}
          onChangeCommitted={(_e, [x, y]) => onCommit({ min: x === lo ? null : x, max: y === hi ? null : y })}
          getAriaLabel={(i) => (i === 0 ? labels.minAria : labels.maxAria)}
          getAriaValueText={(v) => String(v)}
          sx={{
            mt: '-14px',
            py: '20px',
            color: 'primary.main',
            '& .MuiSlider-rail': { opacity: 1, bgcolor: 'divider', height: 3 },
            '& .MuiSlider-track': { height: 3, border: 0 },
            '& .MuiSlider-thumb': {
              width: 18,
              height: 18,
              bgcolor: 'background.paper',
              border: '2px solid',
              borderColor: 'primary.main',
              '&:hover, &.Mui-focusVisible': { boxShadow: `0 0 0 6px ${alpha(theme.palette.primary.main, 0.18)}` },
              '&.Mui-active': { boxShadow: `0 0 0 8px ${alpha(theme.palette.primary.main, 0.22)}` },
            },
          }}
        />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: -1, fontSize: '0.75rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
        <span>{lo}</span>
        <span>{hi}</span>
      </Box>
    </Box>
  );
}
