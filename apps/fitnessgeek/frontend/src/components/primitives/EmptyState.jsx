import React from 'react';
import { GeekEmptyState } from '@geeksuite/ui';
import Surface from './Surface';

// `GeekEmptyState` wraps `title` in its own `<Typography component="p">`, so the
// heavy one-line title is reproduced as `titleSx`.
const TITLE_SX = {
  fontFamily: "inherit",
  fontWeight: 900,
  fontSize: { xs: '1.25rem', sm: '1.5rem' },
  lineHeight: 1.1,
  letterSpacing: '-0.01em',
};

/**
 * EmptyState — The Label's empty state: a dashed 2px panel, one heavy line,
 * one normal sentence, the action.
 *
 * Thin wrapper over `@geeksuite/ui`'s `GeekEmptyState` (TODO_ORDER #15 fan-out):
 * structure (title/description/action layout, 44px action target, `text.muted`
 * copy) moved to `packages/ui`; this file keeps the app's own identity — the
 * dashed "ghost" `Surface` panel and an ink icon — and every
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
          <Icon sx={{ fontSize: 32, color: 'text.primary' }} />
        ) : undefined
      }
      iconSx={{ mb: 2.5 }}
      title={title}
      titleSx={TITLE_SX}
      description={copy}
      descriptionSx={{ fontSize: '1rem', fontWeight: 400, lineHeight: 1.5 }}
      action={action}
      maxWidth={380}
      {...props}
    />
  </Surface>
);

export default EmptyState;
