import { Box, Typography, useTheme } from '@mui/material';
import { colors } from '../../theme/colors';

/**
 * SectionHeader — the planner page's section divider.
 *
 * Two variants:
 *   - default (tick): uppercase small-caps tick label with a dotted rule
 *                     to the right. Used for compact sub-sections (Stale,
 *                     Backlog, Completed).
 *   - display:        Two-row editorial treatment — Fraunces serif title
 *                     on the first line, italic Fraunces caption + dotted
 *                     rule on the second. Used as a chapter-style divider
 *                     for top-level sections (Today, Overdue, Review).
 *
 * Props:
 *   title       — the section name
 *   count       — numeric count, rendered next to/below the title
 *   action      — optional React node (button, IconButton) pinned to the right
 *   size        — 'tick' (default) | 'display'
 *   tone        — 'default' | 'warn' | 'success'  (colors the title/caption)
 *   caption     — optional override for the italic caption in display mode
 *                 (defaults to "N tasks on the page")
 */
const SectionHeader = ({
  title,
  count,
  action,
  size = 'tick',
  tone = 'default',
  caption,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // Tonal palettes
  const toneColors = {
    default: {
      title: theme.palette.text.primary,
      eyebrow: theme.palette.text.secondary,
      muted: isDark ? 'rgba(255,255,255,0.32)' : colors.ink[300],
      rule: isDark ? 'rgba(255,255,255,0.14)' : colors.ink[200],
    },
    warn: {
      title: colors.aging.warning,
      eyebrow: colors.aging.warning,
      muted: colors.aging.warning,
      rule: `${colors.aging.warning}40`,
    },
    success: {
      title: colors.aging.fresh,
      eyebrow: colors.aging.fresh,
      muted: colors.aging.fresh,
      rule: `${colors.aging.fresh}40`,
    },
  };
  const t = toneColors[tone] || toneColors.default;

  const dottedRule = `1px dotted ${t.rule}`;

  // ─── Display variant — two-row editorial chapter header ───
  if (size === 'display') {
    const captionText =
      caption !== undefined
        ? caption
        : count !== undefined && count !== null
        ? `— ${count} ${count === 1 ? 'task' : 'tasks'} on the page`
        : null;

    return (
      <Box sx={{ mt: 4, mb: 2, px: 0.5 }}>
        {/* Row 1: Fraunces serif title + optional action */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 2,
            mb: 0.625,
          }}
        >
          <Typography
            component="h2"
            sx={{
              fontFamily: '"Fraunces", serif',
              fontSize: { xs: '1.25rem', sm: '1.375rem' },
              fontWeight: 500,
              color: t.title,
              lineHeight: 1.1,
              letterSpacing: '-0.01em',
              fontOpticalSizing: 'auto',
            }}
          >
            {title}
          </Typography>
          {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
        </Box>

        {/* Row 2: italic Fraunces caption + dotted rule */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            minHeight: 16,
          }}
        >
          {captionText && (
            <Typography
              sx={{
                fontFamily: '"Fraunces", serif',
                fontStyle: 'italic',
                fontSize: '0.75rem',
                fontWeight: 400,
                color: t.muted,
                letterSpacing: '0.005em',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {captionText}
            </Typography>
          )}
          <Box
            sx={{
              flex: 1,
              borderTop: dottedRule,
              mt: '2px',
            }}
          />
        </Box>
      </Box>
    );
  }

  // ─── Default: compact tick-label with dotted rule ───
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        mt: 3,
        mb: 1.5,
        px: 0.5,
      }}
    >
      <Typography
        variant="h6"
        sx={{
          color: t.eyebrow,
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          lineHeight: 1,
        }}
      >
        {title}
        {count !== undefined && count !== null && (
          <Box
            component="span"
            sx={{ ml: 0.75, fontWeight: 400, color: t.muted }}
          >
            ({count})
          </Box>
        )}
      </Typography>
      <Box
        sx={{
          flex: 1,
          borderTop: dottedRule,
        }}
      />
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Box>
  );
};

export default SectionHeader;
