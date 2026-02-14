import { useState } from 'react';
import { Box, Typography, IconButton, useTheme } from '@mui/material';
import { ChevronDown, ChevronRight } from 'lucide-react';
import TaskRow from '../tasks/TaskRow';
import { colors } from '../../theme/colors';

const OverdueSection = ({ tasks, onStatusToggle, onEdit, onDelete }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [expanded, setExpanded] = useState(true);

  if (!tasks || tasks.length === 0) return null;

  return (
    <Box sx={{ mt: 1 }}>
      {/* Quieter section header — not competing with the writing surface */}
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 0.5,
          py: 0.5,
          cursor: 'pointer',
          userSelect: 'none',
          '&:hover': { opacity: 0.8 },
        }}
      >
        <IconButton
          size="small"
          sx={{ color: colors.aging.warning, p: 0.25 }}
          aria-label={expanded ? 'Collapse overdue' : 'Expand overdue'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </IconButton>
        <Typography
          sx={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            color: colors.aging.warning,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            lineHeight: 1,
          }}
        >
          Carried forward
        </Typography>
        <Typography
          sx={{
            fontSize: '0.6875rem',
            fontWeight: 400,
            color: isDark ? 'rgba(255,255,255,0.3)' : colors.ink[300],
            lineHeight: 1,
          }}
        >
          ({tasks.length})
        </Typography>
      </Box>

      {expanded && (
        <Box
          sx={{
            borderRadius: '8px',
            overflow: 'hidden',
            opacity: 0.85,
          }}
        >
          {tasks.map((task) => (
            <TaskRow
              key={task._id}
              task={task}
              onStatusToggle={onStatusToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default OverdueSection;
