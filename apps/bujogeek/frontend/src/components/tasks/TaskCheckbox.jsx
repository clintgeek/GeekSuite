import { motion } from 'framer-motion';
import { Box } from '@mui/material';
import { colors } from '../../theme/colors';

/**
 * `glyph` shrinks the drawn circle without touching the hit target, which
 * stays 44px at every size — a step's checkbox reads as subordinate to its
 * parent's while still being something a thumb can land on.
 */
const TaskCheckbox = ({ checked, onChange, color = colors.aging.fresh, glyph = 22, label }) => {
  const r = glyph / 2 - 1;
  const c = glyph / 2;
  return (
    <Box
      component="button"
      type="button"
      onClick={onChange}
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      sx={{
        width: 44,
        height: 44,
        minWidth: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
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
