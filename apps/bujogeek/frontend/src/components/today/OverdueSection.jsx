import { useState } from 'react';
import { Box, Typography, IconButton, useTheme } from '@mui/material';
import { ChevronDown, ChevronRight } from 'lucide-react';
import TaskRow from '../tasks/TaskRow';
import { colors } from '../../theme/colors';

/**
 * OverdueSection — carried-forward tasks.
 *
 * The spec calls for a warm amber background tint to signal urgency
 * without screaming. Container picks up a subtle warm tint and a dashed
 * amber left rule; header is a two-row editorial block with an italic
 * Fraunces caption.
 */
const OverdueSection = ({ tasks, onStatusToggle, onEdit, onDelete, onSaveAsNote }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [expanded, setExpanded] = useState(true);

  if (!tasks || tasks.length === 0) return null;

  const warmTint = isDark
    ? 'rgba(212, 132, 62, 0.08)'
    : 'rgba(212, 132, 62, 0.05)';
  const warmBorder = isDark
    ? 'rgba(212, 132, 62, 0.35)'
    : 'rgba(212, 132, 62, 0.25)';

  return (
    <Box sx={{ mt: 3, mb: 3 }}>
      {/* Two-row editorial header — clickable to toggle */}
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          userSelect: 'none',
          px: 0.5,
          mb: 1,
          '&:hover': { opacity: 0.88 },
        }}
      >
        <IconButton
          size="small"
          sx={{
            color: colors.aging.warning,
            p: 0.25,
            width: 20,
            height: 20,
          }}
          aria-label={expanded ? 'Collapse carried forward' : 'Expand carried forward'}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </IconButton>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontSize: { xs: '1.125rem', sm: '1.25rem' },
              fontWeight: 500,
              color: colors.aging.warning,
              lineHeight: 1.15,
              letterSpacing: '-0.005em',
            }}
          >
            Carried forward
          </Typography>
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontSize: '0.75rem',
              fontWeight: 400,
              color: isDark ? 'rgba(212, 132, 62, 0.75)' : 'rgba(212, 132, 62, 0.85)',
              letterSpacing: '0.005em',
              mt: 0.25,
            }}
          >
            — {tasks.length} {tasks.length === 1 ? 'task is' : 'tasks are'} still waiting
          </Typography>
        </Box>
      </Box>

      {/* Tasks container — warm tint + dashed amber rule + soft amber border */}
      {expanded && (
        <Box
          sx={{
            backgroundColor: warmTint,
            border: `1px solid ${warmBorder}`,
            borderLeft: `3px dashed ${colors.aging.warning}`,
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          {tasks.map((task, idx) => (
            <Box
              key={task.id || task._id}
              sx={{
                borderBottom:
                  idx < tasks.length - 1
                    ? `1px dotted ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(212, 132, 62, 0.18)'}`
                    : 'none',
              }}
            >
              <TaskRow
                task={task}
                onStatusToggle={onStatusToggle}
                onEdit={onEdit}
                onDelete={onDelete}
                onSaveAsNote={onSaveAsNote}
              />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default OverdueSection;
