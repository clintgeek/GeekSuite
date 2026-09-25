/**
 * A facet's options as labeled checkboxes (or radios, for single-choice
 * facets like Played), each with its live count.
 *
 * The whole row is the <label>, so the target is the row (44px on a phone,
 * a denser 36px at md+ where a pointer is precise). The native input is
 * visually hidden but real: keyboard, screen readers and forms all get a
 * checkbox; the painted box beside it is only paint.
 *
 * Counts are quiet — secondary ink, tabular numerals, a fixed minimum width
 * so a count going 212 → 9 does not nudge the label. An option that would
 * give zero steps its label down to `text.muted` (never an alpha: dimmed text
 * must still clear 4.5:1 on the panel), and a selected option always shows.
 */
import React, { useState } from 'react';
import { Box, ButtonBase, alpha } from '@mui/material';
import { Check as CheckIcon } from '@mui/icons-material';
import { visuallyHidden } from '../../utils/a11y';
import { visibleOptions } from '../../utils/facets';

export function OptionRow({ option, type = 'checkbox', name, onChange }) {
  const { label, hint, count, selected } = option;
  const empty = count === 0 && !selected;
  const round = type === 'radio';
  // An explicit name: text nodes in the painted row do not reliably carry
  // their spaces into the computed name ("Steam11games").
  const accessibleName = [label, hint, count == null ? null : `${count} ${count === 1 ? 'game' : 'games'}`].filter(Boolean).join(', ');

  return (
    <Box
      component="label"
      data-facet-option={option.value || 'any'}
      data-empty={empty ? 'true' : undefined}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        minHeight: { xs: 44, md: 34 },
        px: 1,
        borderRadius: '8px',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'background-color 120ms',
        '&:hover': { bgcolor: (t) => alpha(t.palette.text.primary, 0.045) },
        '&:has(input:focus-visible)': { outline: 2, outlineColor: 'primary.main', outlineStyle: 'solid', outlineOffset: -2 },
      }}
    >
      <Box
        component="input"
        type={type}
        name={name}
        aria-label={accessibleName}
        checked={selected}
        onChange={() => onChange(option.value)}
        sx={visuallyHidden}
      />
      <Box
        aria-hidden="true"
        sx={{
          flex: '0 0 auto',
          width: 18,
          height: 18,
          borderRadius: round ? '50%' : '5px',
          display: 'grid',
          placeItems: 'center',
          border: '1.5px solid',
          transition: 'background-color 120ms, border-color 120ms',
          ...(selected
            ? { bgcolor: 'primary.main', borderColor: 'primary.main', color: 'primary.contrastText' }
            : { bgcolor: 'transparent', borderColor: (t) => (empty ? t.palette.divider : t.palette.border), color: 'transparent' }),
        }}
      >
        {selected ? (
          round ? (
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.contrastText' }} />
          ) : (
            <CheckIcon sx={{ fontSize: 14, strokeWidth: 1.5, stroke: 'currentColor' }} />
          )
        ) : null}
      </Box>
      <Box
        component="span"
        sx={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: '0.875rem',
          lineHeight: 1.3,
          fontWeight: selected ? 600 : 400,
          color: empty ? 'text.muted' : 'text.primary',
        }}
      >
        {label}
        {hint ? (
          <Box component="span" sx={{ ml: 0.75, fontSize: '0.75rem', fontWeight: 400, color: empty ? 'text.muted' : 'text.secondary' }}>
            {hint}
          </Box>
        ) : null}
      </Box>
      <Box
        component="span"
        sx={{
          flex: '0 0 auto',
          minWidth: '3.5ch',
          textAlign: 'right',
          fontSize: '0.75rem',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.01em',
          color: empty ? 'text.muted' : 'text.secondary',
        }}
      >
        {count == null ? '' : count}
      </Box>
    </Box>
  );
}

/** "Show all 24" / "Show fewer" — a quiet text button under a long list. */
export function ShowMoreButton({ expanded, total, onClick, noun = '' }) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-expanded={expanded ? 'true' : 'false'}
      sx={{
        minHeight: { xs: 44, md: 34 },
        px: 1,
        ml: 3.5,
        borderRadius: '8px',
        fontSize: '0.8125rem',
        fontWeight: 600,
        color: 'text.secondary',
        '&:hover': { color: 'text.primary' },
        '&.Mui-focusVisible': { outline: 2, outlineColor: 'primary.main', outlineStyle: 'solid' },
      }}
    >
      {expanded ? 'Show fewer' : `Show all ${total}${noun ? ` ${noun}` : ''}`}
    </ButtonBase>
  );
}

export default function FacetOptions({ options, type = 'checkbox', name, limit, label, onChange, emptyText = 'Nothing here yet.' }) {
  const [expanded, setExpanded] = useState(false);
  if (!options.length) {
    return <Box sx={{ px: 1, py: 0.5, fontSize: '0.8125rem', color: 'text.secondary' }}>{emptyText}</Box>;
  }
  const shown = visibleOptions(options, limit, expanded);
  return (
    <Box role="group" aria-label={label}>
      {shown.map((o) => (
        <OptionRow key={o.value || 'any'} option={o} type={type} name={name} onChange={onChange} />
      ))}
      {limit && options.length > limit ? (
        <ShowMoreButton expanded={expanded} total={options.length} onClick={() => setExpanded((v) => !v)} />
      ) : null}
    </Box>
  );
}
