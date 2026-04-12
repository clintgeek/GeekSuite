import { Box, Typography, Button, Chip, IconButton, Tooltip, useTheme } from '@mui/material';
import { X } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getTaskAge, getAgingColor, getAgingLabel } from '../../utils/taskAging';

const ReviewCard = ({ task, onKeep, onMoveForward, onBacklog, onDelete, focused = false }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { level, days } = getTaskAge(task);
  const agingColor = getAgingColor(level);
  const agingLabel = getAgingLabel(days);

  const cleanContent = (content) => {
    if (!content) return '';
    return content
      .replace(/#\w+/g, '')
      .replace(/!(high|medium|low)/i, '')
      .trim();
  };

  const taskId = task.id || task._id;

  return (
    <Box
      data-task-id={taskId}
      sx={{
        backgroundColor: focused
          ? (isDark ? 'rgba(96,152,204,0.08)' : colors.primary[50])
          : theme.palette.background.paper,
        border: `1px solid ${focused ? colors.primary[300] : theme.palette.divider}`,
        borderLeft: `4px solid ${agingColor}`,
        borderRadius: '12px',
        outline: focused ? `2px solid ${colors.primary[400]}` : 'none',
        outlineOffset: -1,
        p: { xs: 2, sm: 2.5 },
        mb: 2,
        transition: 'box-shadow 0.15s ease, background-color 0.15s ease, border-color 0.15s ease',
        '&:hover': {
          boxShadow: isDark ? `0 4px 12px rgba(0,0,0,0.3)` : `0 4px 12px ${colors.ink[200]}`,
        },
      }}
    >
      {/* Header: content + age */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Signifier */}
          {task.signifier && task.signifier !== '-' && (
            <Box
              component="span"
              sx={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.7rem',
                fontWeight: 500,
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.ink[100],
                color: isDark ? 'rgba(255,255,255,0.7)' : colors.ink[600],
                px: 0.75,
                py: 0.125,
                borderRadius: '4px',
                mr: 1,
                display: 'inline-block',
                lineHeight: 1.4,
              }}
            >
              {task.signifier}
            </Box>
          )}

          {/* Task content */}
          <Typography
            sx={{
              fontSize: '1rem',
              fontWeight: 500,
              color: theme.palette.text.primary,
              lineHeight: 1.5,
              display: 'inline',
            }}
          >
            {cleanContent(task.content)}
          </Typography>

          {/* Note */}
          {task.note && (
            <Typography
              sx={{
                fontSize: '0.8125rem',
                fontStyle: 'italic',
                color: theme.palette.text.secondary,
                mt: 0.5,
                lineHeight: 1.4,
              }}
            >
              {task.note}
            </Typography>
          )}

          {/* Tags */}
          {task.tags?.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
              {task.tags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.6875rem',
                    fontWeight: 500,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.ink[100],
                    color: isDark ? 'rgba(255,255,255,0.7)' : colors.ink[600],
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : colors.ink[200]}`,
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
              ))}
            </Box>
          )}
        </Box>

        {/* Age badge */}
        {agingLabel && (
          <Typography
            sx={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: agingColor,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              pt: 0.25,
            }}
          >
            {agingLabel}
          </Typography>
        )}
      </Box>

      {/* Action buttons */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mt: 2,
          pt: 2,
          borderTop: `1px solid ${theme.palette.divider}`,
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
        }}
      >
        <Button
          variant="outlined"
          size="small"
          onClick={() => onKeep?.(task)}
          sx={{
            flex: { xs: '1 1 45%', sm: 'none' },
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: colors.primary[500],
            borderColor: colors.primary[200],
            '&:hover': {
              borderColor: colors.primary[500],
              backgroundColor: isDark ? 'rgba(96, 152, 204, 0.12)' : colors.primary[50],
              transform: 'none',
            },
          }}
        >
          Keep Today
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={() => onMoveForward?.(task)}
          sx={{
            flex: { xs: '1 1 45%', sm: 'none' },
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: isDark ? 'rgba(255,255,255,0.65)' : colors.ink[600],
            borderColor: isDark ? 'rgba(255,255,255,0.2)' : colors.ink[200],
            '&:hover': {
              borderColor: isDark ? 'rgba(255,255,255,0.4)' : colors.ink[400],
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.ink[50],
              transform: 'none',
            },
          }}
        >
          Tomorrow
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={() => onBacklog?.(task)}
          sx={{
            flex: { xs: '1 1 45%', sm: 'none' },
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: isDark ? 'rgba(255,255,255,0.65)' : colors.ink[600],
            borderColor: isDark ? 'rgba(255,255,255,0.2)' : colors.ink[200],
            '&:hover': {
              borderColor: isDark ? 'rgba(255,255,255,0.4)' : colors.ink[400],
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.ink[50],
              transform: 'none',
            },
          }}
        >
          Backlog
        </Button>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Delete task" placement="top">
          <IconButton
            size="small"
            onClick={() => onDelete?.(task)}
            sx={{
              color: colors.ink[400],
              '&:hover': {
                color: colors.aging.overdue,
                backgroundColor: isDark ? 'rgba(196, 69, 60, 0.15)' : colors.status.errorBg,
              },
            }}
          >
            <X size={18} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default ReviewCard;
