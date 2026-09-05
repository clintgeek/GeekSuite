import React from 'react';
import { Box } from '@mui/material';
import { GeekEmptyState } from '@geeksuite/ui';
import Surface from './Surface';

// The card-size step of DisplayHeading's scale, reproduced as `titleSx` —
// `GeekEmptyState` always wraps `title` in its own `<Typography component="p">`,
// so a heading component can't be handed in directly without nesting a
// block element (`DisplayHeading`'s `h3`) inside a `<p>`.
const TITLE_SX = {
  fontFamily: "'DM Serif Display', Georgia, serif",
  fontWeight: 400,
  fontSize: { xs: '1.25rem', sm: '1.5rem' },
  lineHeight: 1.15,
  letterSpacing: '-0.01em',
};

/**
 * EmptyState — FitnessGeek's ghost-card empty state.
 *
 * Thin wrapper over `@geeksuite/ui`'s `GeekEmptyState` (TODO_ORDER #15 fan-out):
 * structure (title/description/action layout, 44px action target, `text.muted`
 * copy) moved to `packages/ui`; this file keeps the app's own identity — the
 * dashed "ghost" `Surface` card and the circular icon ornament — and every
 * call site (`icon`, `title`, `copy`, `action`) stays untouched.
 */
const EmptyState = ({
  icon: Icon,
  title,
  copy,
  action,
  variant = 'ghost',
  sx,
  ...props
}) => (
  <Surface
    variant={variant}
    // `GeekEmptyState` owns its own vertical/horizontal rhythm — no padding
    // here, or the two stack and the card reads as oversized.
    padded={false}
    sx={sx}
  >
    <GeekEmptyState
      icon={
        Icon ? (
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundColor: 'background.paper',
              border: (theme) => `1px solid ${theme.palette.divider}`,
              color: 'primary.main',
            }}
          >
            <Icon sx={{ fontSize: 28 }} />
          </Box>
        ) : undefined
      }
      iconSx={{ mb: 2.5 }}
      title={title}
      titleSx={TITLE_SX}
      description={copy}
      descriptionSx={{ fontSize: '0.9375rem', lineHeight: 1.55 }}
      action={action}
      maxWidth={380}
      {...props}
    />
  </Surface>
);

export default EmptyState;
