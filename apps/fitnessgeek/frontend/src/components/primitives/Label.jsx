import React from 'react';
import { Box, Typography } from '@mui/material';
import Surface from './Surface.jsx';

/**
 * The Label's grammar (theme/theme.jsx, DOCS/THEME_REVIEW_2026-11.md).
 *
 * A Nutrition Facts panel is built from five things, and so is every screen
 * here: a bordered panel with a heavy title, ink rules in three weights, a
 * headline amount, rows of "name amount … percent", and a small inverse tag.
 * Hierarchy comes from the rules and the type weight, never from nesting
 * boxes in boxes.
 *
 *   <LabelPanel title="Today’s Facts" meta={<>4 meals logged</>} metaRight={<>Target <b>2,340</b> cal</>}>
 *     <FactHeadline caption="Amount left today" name="Calories" value="660" />
 *     <LabelBar value={72} label="1,680 of 2,340 calories eaten" />
 *     <Rule weight="medium" />
 *     <FactColumnHead>% of daily target</FactColumnHead>
 *     <FactRow name="Protein" amount="113 g" of="of 156" percent="72%" />
 *     <FactRow name="Fat" amount="99 g" of="of 78" percent="127%" tag="21 over" />
 *   </LabelPanel>
 */

const RULE = { thick: 10, medium: 5, thin: 1 };

/** An ink rule. `thick` under a panel's header block, `medium` between
 * sections, `thin` between rows. */
export function Rule({ weight = 'thin', sx }) {
  return (
    <Box
      aria-hidden
      sx={{ borderTop: (t) => `${RULE[weight] ?? 1}px solid ${t.palette.text.primary}`, ...sx }}
    />
  );
}

/** A label panel: 2px ink border, a heavy title, an optional meta line, then
 * the thick rule. `level` picks the title size: 1 for the page's one main
 * panel, 2 for the rest. `action` sits right of a level-2 title. */
export function LabelPanel({ title, titleId, level = 2, meta, metaRight, action, children, sx, titleComponent, ...rest }) {
  const big = level === 1;
  return (
    <Surface sx={{ p: { xs: 1.5, sm: 2 }, ...sx }} {...rest}>
      {title && (
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5 }}>
          <Typography
            component={titleComponent || (big ? 'h2' : 'h3')}
            id={titleId}
            sx={{
              m: 0,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: '-0.01em',
              fontSize: big ? { xs: '2.25rem', sm: '2.5rem' } : '1.375rem',
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
            mt: 0.75,
            pt: 0.75,
            pb: 0.5,
            borderTop: (t) => `1px solid ${t.palette.text.primary}`,
            fontSize: '0.9375rem',
          }}
        >
          <span>{meta}</span>
          <span>{metaRight}</span>
        </Box>
      )}
      {title && <Rule weight={big ? 'thick' : 'medium'} sx={{ mt: meta || metaRight ? 0 : 0.5 }} />}
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
        {caption && <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700 }}>{caption}</Typography>}
        <Typography sx={{ fontWeight: 900, fontSize: '1.75rem', lineHeight: 1.05 }}>{name}</Typography>
      </Box>
      <Typography component="div" sx={{ fontWeight: 900, fontSize: { xs: '3.5rem', sm: '4rem' }, lineHeight: 0.95, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
        {value}
        {unit && (
          <Box component="span" sx={{ fontSize: '1.125rem', fontWeight: 700, letterSpacing: 0 }}>
            {' '}{unit}
          </Box>
        )}
      </Typography>
    </Box>
  );
}

/** A square progress bar. `segments` ([{ value, color }], values in percent)
 * draws a split bar, e.g. the day's calories by meal; otherwise one fill in
 * the app's blue. Always give it a `label`: it is an image to a screen reader. */
export function LabelBar({ value = 0, segments, label, height = 12, sx }) {
  const parts = segments || [{ value, color: 'primary.main' }];
  let used = 0;
  return (
    <Box
      role="img"
      aria-label={label}
      sx={{ height, my: 1, display: 'flex', bgcolor: (t) => t.palette.track, overflow: 'hidden', ...sx }}
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
    <Typography sx={{ textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, pt: 0.375, pb: 0.25 }}>
      {children}
    </Typography>
  );
}

/** A small inverse tag: ink fill, paper text ("21 OVER", "BEHIND PLAN"). */
export function Tag({ children, sx, ...rest }) {
  return (
    <Box
      component="span"
      {...rest}
      sx={{
        display: 'inline-block',
        bgcolor: 'text.primary',
        color: 'background.paper',
        fontSize: '0.75rem',
        fontWeight: 700,
        lineHeight: 1.3,
        px: 0.75,
        py: 0.25,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/** One label row: **name** amount (of target) [tag] ……… percent / trailing.
 * `first` drops the hairline above it (directly under a Rule). */
export function FactRow({ name, amount, of, tag, percent, trailing, first = false, sx }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 1.5,
        py: 0.875,
        borderTop: first ? 0 : (t) => `1px solid ${t.palette.text.primary}`,
        fontSize: '1rem',
        ...sx,
      }}
    >
      <Box component="span" sx={{ minWidth: 0 }}>
        <Box component="b" sx={{ fontWeight: 700 }}>{name}</Box>
        {amount != null && <> {amount}</>}
        {of && <Box component="span" sx={{ color: 'text.secondary' }}> {of}</Box>}
        {tag && <Tag sx={{ ml: 0.75 }}>{tag}</Tag>}
      </Box>
      {(percent != null || trailing) && (
        <Box component="span" sx={{ fontWeight: percent != null ? 700 : 400, whiteSpace: 'nowrap', textAlign: 'right' }}>
          {percent ?? trailing}
        </Box>
      )}
    </Box>
  );
}

/** A row inside a list panel (a food in a meal, a reading, a dose): a
 * hairline in the muted divider colour, lighter than a FactRow's ink rule. */
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
