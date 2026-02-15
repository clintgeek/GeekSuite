import { motion } from 'framer-motion';
import { Box } from '@mui/material';
import { colors } from '../../theme/colors';

const TaskCheckbox = ({ checked, onChange, color = colors.aging.fresh }) => {
  return (
    <Box
      component="button"
      onClick={onChange}
      role="checkbox"
      aria-checked={checked}
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
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        {/* Outer circle */}
        <motion.circle
          cx="11"
          cy="11"
          r="10"
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
          d="M7 11.5L9.5 14L15 8"
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
