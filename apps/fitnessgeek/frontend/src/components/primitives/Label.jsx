import React from 'react';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import Surface from './Surface.jsx';
import { trackColor } from '../../theme/theme.jsx';

/**
 * The card grammar (theme/theme.jsx, "Daylight"). The names date from "The
 * Label" and are kept for their ~300 call sites; what they draw is now soft:
 *
 *   LabelPanel   a card with a quiet title row
 *   Rule         a hairline between sections (every weight draws the same)
 *   FactHeadline the card's one big number
 *   FactRow      "name amount (of target) [tag] … percent"
 *   Tag          a small rounded status tag
 *   LabelBar     a rounded progress bar
 *   ListRow      a row in a list, with a hairline above
 *
 * Hierarchy comes from spacing and type size, never from boxes in boxes.
 */

/** A hairline between sections. `thick` and `medium` are kept as names and
 * add a little air; nothing draws a heavy rule any more. */
export function Rule({ weight = 'thin', sx }) {
  const air = weight === 'thin' ? 0 : 0.5;
  return (
    <Box
      aria-hidden
      sx={{ borderTop: (t) => `1px solid ${t.palette.divider}`, mt: air, ...sx }}
    />
  );
}

/** A card with a title row. `level` 1 is the page's main card (a slightly
 * larger title), 2 the rest. `meta` / `metaRight` are a quiet line under the
 * title; `action` sits right of it. */
export function LabelPanel({ title, titleId, level = 2, meta, metaRight, action, children, sx, titleComponent, ...rest }) {
  const big = level === 1;
  return (
    <Surface sx={sx} {...rest}>
      {title && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, minHeight: 28 }}>
          <Typography
            component={titleComponent || (big ? 'h2' : 'h3')}
            id={titleId}
            sx={{
              m: 0,
              fontWeight: 700,
              lineHeight: 1.25,
              letterSpacing: '-0.01em',
              fontSize: big ? '1.25rem' : '1.0625rem',
              minWidth: 0,
            }}
          >
            {title}
          </Typography>
          {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
        </Box>
      )}
      {(meta || metaRight) && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 1.5,
            mt: 0.25,
            color: 'text.secondary',
            fontSize: '0.9375rem',
          }}
        >
          <span>{meta}</span>
          <span>{metaRight}</span>
        </Box>
      )}
      {title && <Box aria-hidden sx={{ height: 12 }} />}
      {children}
    </Surface>
  );
}

/** The panel's one big number: a small caption, the thing's name set heavy,
 * and the amount set huge on the right ("Calories … 660"). */
export function FactHeadline({ caption, name, value, unit }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 1.5, pt: 0.5 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {caption && <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>{caption}</Typography>}
        <Typography sx={{ fontWeight: 600, fontSize: '1.125rem', lineHeight: 1.2 }}>{name}</Typography>
      </Box>
      <Typography component="div" sx={{ fontWeight: 700, fontSize: { xs: '2.5rem', sm: '2.75rem' }, lineHeight: 1, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
        {value}
        {unit && (
          <Box component="span" sx={{ fontSize: '1rem', fontWeight: 500, letterSpacing: 0, color: 'text.secondary' }}>
            {' '}{unit}
          </Box>
        )}
      </Typography>
    </Box>
  );
}

/** A rounded progress bar. `segments` ([{ value, color }], values in percent)
 * draws a split bar, e.g. the day's calories by meal; otherwise one fill in
 * the app's blue. Always give it a `label`: it is an image to a screen reader. */
export function LabelBar({ value = 0, segments, label, height = 8, sx }) {
  const parts = segments || [{ value, color: 'primary.main' }];
  let used = 0;
  return (
    <Box
      role="img"
      aria-label={label}
      sx={{ height, my: 1, display: 'flex', bgcolor: (t) => trackColor(t), overflow: 'hidden', borderRadius: 999, ...sx }}
    >
      {parts.map((part, i) => {
        const width = Math.max(0, Math.min(100 - used, Number(part.value) || 0));
        used += width;
        return <Box key={i} sx={{ width: `${width}%`, bgcolor: part.color || 'primary.main' }} />;
      })}
    </Box>
  );
}

/** The right-aligned column heading above a run of FactRows. */
export function FactColumnHead({ children }) {
  return (
    <Typography sx={{ textAlign: 'right', fontSize: '0.75rem', fontWeight: 500, color: 'text.secondary', pt: 0.375, pb: 0.25 }}>
      {children}
    </Typography>
  );
}

/** A small rounded status tag ("21 over", "Behind plan"): a neutral wash by
 * default. Pass `tone` ("warning" | "error" | "success" | "info") when the
 * tag is a status, or `fill` (any colour, or a palette path like
 * "error.main") when the colour comes from data, e.g. a blood-pressure
 * stage. Either way the tag is a soft wash of that colour with a dot of it,
 * and the words stay in the normal text colour: the words carry the meaning,
 * the colour only agrees. */
export function Tag({ children, tone, fill, sx, ...rest }) {
  const resolve = (t) => {
    if (fill) {
      const [group, shade] = String(fill).split('.');
      return t.palette[group]?.[shade] || fill;
    }
    return (tone && t.palette[tone]?.main) || null;
  };
  return (
    <Box
      component="span"
      {...rest}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1.25,
        bgcolor: (t) => alpha(resolve(t) || t.palette.text.primary, t.palette.mode === 'dark' ? 0.2 : 0.1),
        color: 'text.primary',
        fontSize: '0.75rem',
        fontWeight: 600,
        lineHeight: 1.4,
        px: 2,
        py: 0.5,
        borderRadius: 999,
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
        ...sx,
      }}
    >
      {(fill || tone) && (
        <Box component="span" aria-hidden sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, bgcolor: (t) => resolve(t) }} />
      )}
      {children}
    </Box>
  );
}

/** One label row: **name** amount (of target) [tag] ……… percent / trailing.
 * `first` drops the hairline above it (directly under a Rule). */
export function FactRow({ name, amount, of, tag, tagTone, percent, trailing, first = false, sx }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 1.5,
        py: 2,
        borderTop: first ? 0 : (t) => `1px solid ${t.palette.divider}`,
        fontSize: '1rem',
        ...sx,
      }}
    >
      <Box component="span" sx={{ minWidth: 0 }}>
        <Box component="b" sx={{ fontWeight: 600 }}>{name}</Box>
        {amount != null && <> {amount}</>}
        {of && <Box component="span" sx={{ color: 'text.secondary' }}> {of}</Box>}
        {tag && <Tag tone={tagTone} sx={{ ml: 1.5 }}>{tag}</Tag>}
      </Box>
      {(percent != null || trailing) && (
        <Box component="span" sx={{ fontWeight: percent != null ? 600 : 400, whiteSpace: 'nowrap', textAlign: 'right' }}>
          {percent ?? trailing}
        </Box>
      )}
    </Box>
  );
}

/** A row inside a list panel (a food in a meal, a reading, a dose): a
 * hairline above each row but the first. */
export function ListRow({ children, first = false, sx, ...rest }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 1.5,
        py: 1,
        borderTop: first ? 0 : (t) => `1px solid ${t.palette.divider}`,
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}
