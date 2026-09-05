import { Box, Typography, useTheme } from '@mui/material';
import { colors } from '../../theme/colors';
import { domainInk } from '../../theme/inks';

/**
 * SectionHeader — the planner's chapter dividers.
 *
 * Two variants:
 *
 *   'display' (default for top-level sections: Today, Overdue, Review)
 *     — Full editorial treatment: Fraunces serif title on row 1,
 *       italic Fraunces caption + extending rule on row 2.
 *       A subtle left-edge bar gives the section an anchor point.
 *
 *   'tick' (for compact sub-sections: Stale, Backlog, Completed)
 *     — Inline uppercase label + dotted rule to the right.
 *       No serif, pure function.
 *
 * Props:
 *   title    — section name
 *   count    — numeric count (displayed inline or as caption)
 *   action   — optional React node pinned to the right
 *   size     — 'tick' | 'display'
 *   tone     — 'default' | 'warn' | 'success' | 'overdue'
 *   caption  — override italic caption (display mode only)
 */
const SectionHeader = ({
  title,
  count,
  action,
  size    = 'tick',
  tone    = 'default',
  caption,
}) => {
  const theme  = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // Tonal palettes
  const toneColors = {
    default: {
      title:    theme.palette.text.primary,
      caption:  theme.palette.text.muted,
      rule:     isDark ? 'rgba(255,255,255,0.1)'  : colors.ink[200],
      bar:      isDark ? colors.ink[600]           : colors.ink[300],
      label:    theme.palette.text.secondary,
    },
    warn: {
      // Title/caption/label are read, not just seen: the hue survives, the
      // value moves until it clears AA (theme/inks.js).
      title:   domainInk(colors.aging.warning, theme),
      caption: domainInk(colors.aging.warning, theme),
      rule:    `${colors.aging.warning}30`,
      bar:     colors.aging.warning,
      label:   domainInk(colors.aging.warning, theme),
    },
    success: {
      // Title/caption/label are read, not just seen: the hue survives, the
      // value moves until it clears AA (theme/inks.js).
      title:   domainInk(colors.aging.fresh, theme),
      caption: domainInk(colors.aging.fresh, theme),
      rule:    `${colors.aging.fresh}30`,
      bar:     colors.aging.fresh,
      label:   domainInk(colors.aging.fresh, theme),
    },
    overdue: {
      // Title/caption/label are read, not just seen: the hue survives, the
      // value moves until it clears AA (theme/inks.js).
      title:   domainInk(colors.aging.overdue, theme),
      caption: domainInk(colors.aging.overdue, theme),
      rule:    `${colors.aging.overdue}28`,
      bar:     colors.aging.overdue,
      label:   domainInk(colors.aging.overdue, theme),
    },
  };

  const t           = toneColors[tone] || toneColors.default;
  const dottedRule  = `1px dotted ${t.rule}`;

  // ─── Display variant ─────────────────────────────────────────
  if (size === 'display') {
    const captionText =
      caption !== undefined
        ? caption
        : count !== undefined && count !== null
        ? `${count} ${count === 1 ? 'task' : 'tasks'} on the page`
        : null;

    return (
      <Box
        sx={{
          mt: 4,
          mb: 1.5,
          px: 0.5,
          // Left-edge accent bar — the typographic anchor
          borderLeft: `2px solid ${t.bar}`,
          pl:         1.5,
        }}
      >
        {/* Row 1: Serif title + action */}
        <Box
          sx={{
            display:        'flex',
            alignItems:     'baseline',
            justifyContent: 'space-between',
            gap:            2,
            mb:             0.25,
          }}
        >
          <Typography
            component="h2"
            sx={{
              fontFamily:        '"Fraunces", serif',
              fontSize:          { xs: '1.125rem', sm: '1.25rem' },
              fontWeight:        500,
              color:             t.title,
              lineHeight:        1.1,
              letterSpacing:     '-0.015em',
              fontOpticalSizing: 'auto',
            }}
          >
            {title}
          </Typography>
          {action && (
            <Box sx={{ flexShrink: 0 }}>
              {action}
            </Box>
          )}
        </Box>

        {/* Row 2: italic caption + extending dotted rule */}
        {captionText && (
          <Box
            sx={{
              display:    'flex',
              alignItems: 'center',
              gap:        1,
              minHeight:  14,
            }}
          >
            <Typography
              sx={{
                fontFamily:   '"Fraunces", serif',
                fontStyle:    'italic',
                fontSize:     '0.75rem',
                fontWeight:   400,
                color:        t.caption,
                letterSpacing:'0.005em',
                whiteSpace:   'nowrap',
                flexShrink:   0,
              }}
            >
              {captionText}
            </Typography>
            <Box
              sx={{
                flex:       1,
                borderTop:  dottedRule,
                mt:         '1px',
                minWidth:   16,
              }}
            />
          </Box>
        )}
        {!captionText && (
          <Box sx={{ height: 6 }} />
        )}
      </Box>
    );
  }

  // ─── Tick variant ────────────────────────────────────────────
  return (
    <Box
      sx={{
        display:    'flex',
        alignItems: 'center',
        gap:        1.25,
        mt:         3,
        mb:         1.25,
        px:         0.5,
      }}
    >
      <Typography
        sx={{
          fontFamily:    '"IBM Plex Mono", monospace',
          fontSize:      '0.75rem',
          fontWeight:    700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color:         t.label,
          whiteSpace:    'nowrap',
          lineHeight:    1,
          display:       'flex',
          alignItems:    'center',
          gap:           0.5,
        }}
      >
        {title}
        {count !== undefined && count !== null && (
          <Box
            component="span"
            sx={{
              fontWeight:      400,
              color:           t.caption,
              fontFamily:      '"IBM Plex Mono", monospace',
              letterSpacing:   '0',
            }}
          >
            ({count})
          </Box>
        )}
      </Typography>

      <Box
        sx={{
          flex:      1,
          borderTop: dottedRule,
        }}
      />

      {action && (
        <Box sx={{ flexShrink: 0 }}>
          {action}
        </Box>
      )}
    </Box>
  );
};

export default SectionHeader;
