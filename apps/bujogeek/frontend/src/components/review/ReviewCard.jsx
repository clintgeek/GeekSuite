import { Box, Typography, Chip, IconButton, Tooltip, useTheme } from '@mui/material';
import { X, ArrowRight, Archive, CalendarCheck, Calendar } from 'lucide-react';
import { useState } from 'react';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { motion } from 'framer-motion';
import { colors } from '../../theme/colors';
import { getTaskAge, getAgingColor, getAgingLabel } from '../../utils/taskAging';

/**
 * ReviewCard — the emotional center of the review flow.
 *
 * Design intent: Each card is a reckoning — the user decides what matters.
 * The layout gives the task content full authority on top, and the action
 * row reads as a considered, sequential choice: Keep · Tomorrow · Backlog.
 *
 * "Keep Today" is the primary action — the task earned its place. It gets
 * the most visual weight. "Tomorrow" is neutral. "Backlog" signals demotion.
 * "Delete" lives to the far right, quiet but accessible.
 *
 * The aging indicator is rendered as a small, editorial mono stamp — not
 * colored text but a classified label, like something rubber-stamped on a
 * physical card.
 */
const ReviewCard = ({
  task,
  onKeep,
  onMoveTomorrow,
  onMoveTo,
  onBacklog,
  onDelete,
  focused = false,
}) => {
  const theme  = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
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

  // Surface tokens for light/dark
  const cardBg = isDark
    ? focused
      ? `${colors.primary[900]}40`
      : colors.dark[200]
    : focused
    ? colors.primary[50]
    : colors.parchment.paper;

  const borderColor = focused
    ? colors.primary[400]
    : isDark ? colors.dark[400] : colors.ink[200];

  const dividerColor = isDark ? 'rgba(255,245,220,0.07)' : colors.ink[100];

  return (
    <Box
      data-task-id={taskId}
      sx={{
        backgroundColor: cardBg,
        border:          `1px solid ${borderColor}`,
        borderLeft:      `3px solid ${agingColor}`,
        borderRadius:    '10px',
        // Warm shadow — depth without harshness
        boxShadow: isDark
          ? `0 2px 12px ${colors.dark[0]}50`
          : focused
          ? `0 4px 16px ${colors.primary[200]}40`
          : `0 1px 6px ${colors.ink[200]}60`,
        mb:         1.5,
        overflow:   'hidden',
        transition: 'box-shadow 0.18s ease, border-color 0.18s ease, background-color 0.18s ease',
        '&:hover': {
          boxShadow: isDark
            ? `0 6px 24px ${colors.dark[0]}70`
            : `0 4px 16px ${colors.ink[300]}50`,
          borderColor: focused
            ? colors.primary[400]
            : isDark ? colors.dark[500] : colors.ink[300],
        },
      }}
    >
      {/* ─── Card body ──────────────────────────────────────────── */}
      <Box sx={{ px: { xs: 2, sm: 2.25 }, pt: { xs: 1.75, sm: 2 }, pb: 1.5 }}>

        {/* Header: content + age stamp */}
        <Box
          sx={{
            display:        'flex',
            alignItems:     'flex-start',
            justifyContent: 'space-between',
            gap:            1.5,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* Signifier */}
            {task.signifier && task.signifier !== '-' && (
              <Box
                component="span"
                sx={{
                  fontFamily:      '"IBM Plex Mono", monospace',
                  fontSize:        '0.625rem',
                  fontWeight:      600,
                  backgroundColor: isDark ? 'rgba(255,245,220,0.08)' : colors.ink[100],
                  color:           isDark ? 'rgba(255,245,220,0.55)' : colors.ink[500],
                  px:              0.625,
                  py:              0.125,
                  borderRadius:    '3px',
                  mr:              0.875,
                  display:         'inline-block',
                  lineHeight:      1.5,
                  border:          `1px solid ${isDark ? 'rgba(255,245,220,0.1)' : colors.ink[200]}`,
                  verticalAlign:   'middle',
                }}
              >
                {task.signifier}
              </Box>
            )}

            {/* Task content */}
            <Typography
              sx={{
                fontSize:      '0.9375rem',
                fontWeight:    500,
                color:         theme.palette.text.primary,
                lineHeight:    1.5,
                display:       'inline',
                letterSpacing: '-0.005em',
              }}
            >
              {cleanContent(task.content)}
            </Typography>

            {/* Note */}
            {task.note && (
              <Typography
                sx={{
                  fontSize:   '0.8125rem',
                  fontStyle:  'italic',
                  fontFamily: '"Fraunces", serif',
                  color:      isDark ? 'rgba(255,245,220,0.38)' : colors.ink[400],
                  mt:         0.5,
                  lineHeight: 1.45,
                }}
              >
                {task.note}
              </Typography>
            )}

            {/* Tags */}
            {task.tags?.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.875, flexWrap: 'wrap' }}>
                {task.tags.map((tag) => (
                  <Chip
                    key={tag}
                    label={`#${tag}`}
                    size="small"
                    sx={{
                      height:          18,
                      fontSize:        '0.625rem',
                      fontFamily:      '"IBM Plex Mono", monospace',
                      fontWeight:      500,
                      letterSpacing:   '0.02em',
                      backgroundColor: isDark ? 'rgba(255,245,220,0.06)' : colors.ink[100],
                      color:           isDark ? 'rgba(255,245,220,0.45)' : colors.ink[400],
                      border:          `1px solid ${isDark ? 'rgba(255,245,220,0.1)' : colors.ink[200]}`,
                      borderRadius:    '3px',
                      '& .MuiChip-label': { px: 0.625 },
                    }}
                  />
                ))}
              </Box>
            )}
          </Box>

          {/* Age stamp — editorial rubber-stamp aesthetic */}
          {agingLabel && (
            <Box
              sx={{
                flexShrink:      0,
                display:         'flex',
                flexDirection:   'column',
                alignItems:      'flex-end',
                gap:             0.25,
                pt:              0.125,
              }}
            >
              <Typography
                sx={{
                  fontFamily:   '"IBM Plex Mono", monospace',
                  fontSize:     '0.5625rem',
                  fontWeight:   700,
                  letterSpacing:'0.1em',
                  textTransform:'uppercase',
                  color:        `${agingColor}`,
                  lineHeight:   1,
                  border:       `1px solid ${agingColor}50`,
                  borderRadius: '3px',
                  px:           0.625,
                  py:           0.375,
                  whiteSpace:   'nowrap',
                  opacity:      0.85,
                }}
              >
                {agingLabel}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* ─── Action row ─────────────────────────────────────────── */}
      <Box
        sx={{
          display:        'flex',
          alignItems:     'center',
          gap:            0.5,
          px:             { xs: 1.5, sm: 1.75 },
          py:             1.125,
          borderTop:      `1px solid ${dividerColor}`,
          backgroundColor: isDark
            ? 'rgba(255,245,220,0.018)'
            : 'rgba(0,0,0,0.015)',
          flexWrap:       { xs: 'wrap', sm: 'nowrap' },
        }}
      >
        {/* Keep Today — primary action, most visual weight */}
        <ActionButton
          icon={CalendarCheck}
          label="Keep today"
          shortcut="1"
          onClick={() => onKeep?.(task)}
          variant="primary"
          isDark={isDark}
        />

        {/* Separator */}
        <Box
          sx={{
            width: '1px',
            height: 20,
            backgroundColor: dividerColor,
            flexShrink: 0,
            display: { xs: 'none', sm: 'block' },
          }}
        />

        {/* Move Tomorrow — neutral */}
        <ActionButton
          icon={ArrowRight}
          label="Move tomorrow"
          shortcut="2"
          onClick={() => onMoveTomorrow?.(task)}
          variant="neutral"
          isDark={isDark}
        />

        {/* Move To — date picker */}
        <Box sx={{ position: 'relative' }}>
          <ActionButton
            icon={Calendar}
            label="Move to"
            onClick={() => setIsDatePickerOpen(true)}
            variant="neutral"
            isDark={isDark}
          />
          <Box sx={{ position: 'absolute', visibility: 'hidden', height: 0, width: 0 }}>
            <DatePicker
              open={isDatePickerOpen}
              onClose={() => setIsDatePickerOpen(false)}
              onChange={(newDate) => {
                if (newDate) {
                  onMoveTo?.(task, newDate);
                }
                setIsDatePickerOpen(false);
              }}
              slotProps={{
                textField: {
                  size: 'small',
                },
              }}
            />
          </Box>
        </Box>

        {/* Backlog — demotion */}
        <ActionButton
          icon={Archive}
          label="Backlog"
          shortcut="3"
          onClick={() => onBacklog?.(task)}
          variant="muted"
          isDark={isDark}
        />

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Delete — destructive, quiet */}
        <Tooltip title="Delete permanently" placement="top">
          <IconButton
            size="small"
            onClick={() => onDelete?.(task)}
            sx={{
              color:   isDark ? 'rgba(255,245,220,0.2)' : colors.ink[300],
              width:   28,
              height:  28,
              flexShrink: 0,
              '&:hover': {
                color:           colors.aging.overdue,
                backgroundColor: isDark
                  ? `${colors.aging.overdue}14`
                  : colors.status.errorBg,
              },
              transition: 'color 0.14s ease, background-color 0.14s ease',
            }}
          >
            <X size={15} strokeWidth={1.75} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};

// ─── ActionButton sub-component ─────────────────────────────────────────────
// Three visual weights: primary (Keep), neutral (Tomorrow), muted (Backlog)
const ActionButton = ({ icon: Icon, label, shortcut, onClick, variant, isDark }) => {
  const styles = {
    primary: {
      color:   isDark ? colors.primary[300] : colors.primary[600],
      bg:      isDark ? `${colors.primary[900]}50` : colors.primary[50],
      border:  isDark ? `${colors.primary[700]}` : colors.primary[200],
      hoverBg: isDark ? `${colors.primary[800]}70` : colors.primary[100],
      hoverBorder: colors.primary[400],
    },
    neutral: {
      color:   isDark ? 'rgba(255,245,220,0.55)' : colors.ink[500],
      bg:      'transparent',
      border:  isDark ? 'rgba(255,245,220,0.12)' : colors.ink[200],
      hoverBg: isDark ? 'rgba(255,245,220,0.06)' : colors.ink[50],
      hoverBorder: isDark ? 'rgba(255,245,220,0.25)' : colors.ink[400],
    },
    muted: {
      color:   isDark ? 'rgba(255,245,220,0.35)' : colors.ink[400],
      bg:      'transparent',
      border:  isDark ? 'rgba(255,245,220,0.08)' : colors.ink[200],
      hoverBg: isDark ? 'rgba(255,245,220,0.04)' : colors.ink[50],
      hoverBorder: isDark ? 'rgba(255,245,220,0.18)' : colors.ink[300],
    },
  };

  const s = styles[variant];

  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display:         'inline-flex',
        alignItems:      'center',
        gap:             0.5,
        px:              1,
        py:              0.5,
        borderRadius:    '5px',
        border:          `1px solid ${s.border}`,
        backgroundColor: s.bg,
        color:           s.color,
        cursor:          'pointer',
        fontFamily:      '"Source Sans 3", sans-serif',
        fontSize:        '0.8125rem',
        fontWeight:      variant === 'primary' ? 600 : 500,
        letterSpacing:   '-0.005em',
        lineHeight:      1,
        transition:      'all 0.14s ease',
        flexShrink:      { xs: 1, sm: 0 },
        '&:hover': {
          backgroundColor: s.hoverBg,
          borderColor:     s.hoverBorder,
          transform:       'translateY(-1px)',
        },
        '&:active': {
          transform: 'translateY(0)',
        },
      }}
    >
      <Icon size={13} strokeWidth={2} />
      <Box component="span">{label}</Box>
      {shortcut && (
        <Box
          component="kbd"
          sx={{
            fontFamily:      '"IBM Plex Mono", monospace',
            fontSize:        '0.5rem',
            fontWeight:      700,
            color:           'inherit',
            opacity:         0.45,
            ml:              0.25,
            lineHeight:      1,
            letterSpacing:   '0',
          }}
        >
          {shortcut}
        </Box>
      )}
    </Box>
  );
};

export default ReviewCard;
