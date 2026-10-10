import { motion } from 'framer-motion';
import { Box } from '@mui/material';
import { colors } from '../../theme/colors';

/**
 * `glyph` shrinks the drawn circle without touching the hit target, which
 * stays 44px at every size — a step's checkbox reads as subordinate to its
 * parent's while still being something a thumb can land on.
 *
 * `label` is the accessible name and callers should always pass one that says
 * *which* entry this toggles — the whole control is a drawn circle, so without
 * it a screen reader hears "checkbox" fourteen times on one screen (axe
 * `button-name`, 28 nodes, 2026-09-05). The fallback below is a floor, not a
 * substitute.
 */
/**
 * `busy` blocks a second toggle while the first is in flight.
 *
 * This had no busy state at all, and for a RECURRING occurrence that was a
 * data bug rather than a cosmetic one: a `virtual_<id>_<epoch>` row keeps its
 * synthetic id until the first response merges, so a double tap sent the same
 * id twice and the server materialised two override rows for one occurrence.
 * A partial unique index on `(seriesId, originalDueDate)` now refuses the
 * duplicate at the collection, and this stops it being attempted.
 *
 * Deliberately NOT `disabled`: an element that disappears from the
 * accessibility tree mid-interaction loses focus and says nothing about why.
 * `aria-disabled` keeps it announced and focusable while the handler ignores
 * the click.
 */
const TaskCheckbox = ({ checked, onChange, color = colors.aging.fresh, glyph = 22, label, busy = false }) => {
  const r = glyph / 2 - 1;
  const c = glyph / 2;
  return (
    <Box
      component="button"
      type="button"
      onClick={busy ? undefined : onChange}
      role="checkbox"
      aria-checked={checked}
      aria-disabled={busy || undefined}
      aria-label={label || (checked ? 'Mark not done' : 'Mark done')}
      tabIndex={0}
      sx={{
        width: 44,
        height: 44,
        minWidth: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.6 : 1,
        border: 'none',
        backgroundColor: 'transparent',
        padding: 0,
        borderRadius: '50%',
        transition: 'background-color 0.15s ease',
        '&:hover': {
          backgroundColor: checked ? `${color}12` : `${colors.ink[200]}40`,
        },
        '&:focus-visible': {
          outline: `2px solid ${colors.primary[500]}`,
          outlineOffset: 2,
        },
      }}
    >
      <svg width={glyph} height={glyph} viewBox={`0 0 ${glyph} ${glyph}`} fill="none">
        {/* Outer circle */}
        <motion.circle
          cx={c}
          cy={c}
          r={r}
          stroke={checked ? color : colors.ink[300]}
          strokeWidth="1.5"
          fill={checked ? color : 'none'}
          initial={false}
          animate={{
            fill: checked ? color : 'rgba(0,0,0,0)',
            stroke: checked ? color : colors.ink[300],
          }}
          transition={{ duration: 0.2 }}
        />
        {/* Checkmark */}
        <motion.path
          d={`M${c * 0.64} ${c * 1.05}L${c * 0.86} ${c * 1.27}L${c * 1.36} ${c * 0.73}`}
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{
            pathLength: checked ? 1 : 0,
            opacity: checked ? 1 : 0,
          }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        />
      </svg>
    </Box>
  );
};

export default TaskCheckbox;
