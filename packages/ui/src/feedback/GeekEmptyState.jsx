/**
 * GeekEmptyState — the "there is nothing here yet" block.
 *
 * Seeded from bujogeek's `EmptyState` (TODO_ORDER #15). Structure is shared:
 * optional ornament/icon, a title in `text.primary`, a description in
 * `text.muted`, an optional action with a real 44px target. Identity — fonts,
 * alignment, the three-dot pause mark bujogeek uses instead of an icon — stays
 * the app's business via `icon`, `align` and the `*Sx` hooks.
 *
 * `text.muted` (not `text.disabled`) for the description: empty-state copy is
 * copy, and owes AA. See the contrast suite's text-tier notes.
 *
 * `children` is an extra slot between the description and the action —
 * `GeekErrorState` uses it for its detail line.
 */
import { forwardRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { geekLayout } from '../designTokens.js';

const ALIGN_ITEMS = { start: 'flex-start', center: 'center', end: 'flex-end' };

export const GeekEmptyState = forwardRef(function GeekEmptyState(
  {
    icon,
    title,
    description,
    action,
    children,
    compact = false,
    align = 'center',
    maxWidth = 420,
    iconSx,
    titleSx,
    descriptionSx,
    actionSx,
    sx,
    ...props
  },
  ref
) {
  const items = ALIGN_ITEMS[align] || 'center';

  return (
    <Box
      ref={ref}
      data-geek-empty-state
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: items,
        textAlign: align === 'center' ? 'center' : 'left',
        py: compact ? { xs: 2.5, sm: 3 } : { xs: 5, sm: 6 },
        px: { xs: 2, sm: 2.5 },
        ...sx,
      }}
      {...props}
    >
      {icon ? (
        <Box
          aria-hidden="true"
          data-geek-empty-state-icon
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: items,
            color: 'text.muted',
            mb: compact ? 1 : 1.5,
            ...iconSx,
          }}
        >
          {icon}
        </Box>
      ) : null}

      {title ? (
        <Typography
          data-geek-empty-state-title
          variant={compact ? 'h6' : 'h5'}
          component="p"
          sx={{ color: 'text.primary', mb: description ? 0.75 : 0, ...titleSx }}
        >
          {title}
        </Typography>
      ) : null}

      {description ? (
        <Typography
          data-geek-empty-state-description
          variant="body2"
          sx={{ color: 'text.muted', maxWidth, ...descriptionSx }}
        >
          {description}
        </Typography>
      ) : null}

      {children}

      {action ? (
        <Box
          data-geek-empty-state-action
          sx={{
            mt: compact ? 2 : 3,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            justifyContent: items,
            // App themes may shrink buttons; the escape hatch out of an empty
            // state is not the place to lose the 44px target.
            '& .MuiButtonBase-root': { minHeight: geekLayout.minClickTarget },
            ...actionSx,
          }}
        >
          {action}
        </Box>
      ) : null}
    </Box>
  );
});
