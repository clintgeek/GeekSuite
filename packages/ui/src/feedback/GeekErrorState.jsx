/**
 * GeekErrorState — "we tried, it broke, here is the way out."
 *
 * `GeekEmptyState`'s shape plus two things an empty state has no business
 * having: a *detail* line and a retry. Rules that are rules, not looks:
 *
 *   - `error.main` colors the glyph only. The title and description stay on
 *     `text.primary` / `text.muted`, so the copy is readable in both modes
 *     regardless of how a brand tunes its error hue. (The palette's semantic
 *     colors are mode-aware already — see `designTokens.semanticDark` — but
 *     they are tuned to clear 3:1 as *graphics*, not 4.5:1 as body text.)
 *   - the detail line shows a message, never a stack. An `Error` contributes
 *     `error.message`; anything else is stringified. `error.stack` is never
 *     read.
 *
 * `@mui/icons-material` is not a peer of this package, so the default glyph is
 * inline SVG. Pass `icon` to override it (or `icon={null}` for none).
 */
import { forwardRef } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { GeekEmptyState } from './GeekEmptyState.jsx';

/** Alert triangle, 24px, currentColor — no icon package needed. */
function AlertGlyph({ size = 28 }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      sx={{ display: 'block' }}
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Box>
  );
}

/** A message safe to render: never a stack, never `[object Object]`. */
function detailFor(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || error.name || '';
  if (typeof error === 'object') return error.message ? String(error.message) : '';
  return String(error);
}

export const GeekErrorState = forwardRef(function GeekErrorState(
  {
    icon,
    title = 'Something went wrong',
    description,
    error,
    action,
    onRetry,
    retryLabel = 'Try again',
    compact = false,
    iconSx,
    detailSx,
    sx,
    ...props
  },
  ref
) {
  const detail = detailFor(error);
  const glyph = icon === undefined ? <AlertGlyph size={compact ? 22 : 28} /> : icon;

  const retry = onRetry ? (
    <Button variant="outlined" onClick={onRetry} data-geek-error-state-retry>
      {retryLabel}
    </Button>
  ) : null;

  const actions =
    retry && action ? (
      <>
        {retry}
        {action}
      </>
    ) : (
      retry || action || null
    );

  return (
    <GeekEmptyState
      ref={ref}
      data-geek-error-state
      icon={glyph}
      // The glyph is the only thing that takes the error hue.
      iconSx={{ color: 'error.main', ...iconSx }}
      title={title}
      description={description}
      compact={compact}
      action={actions}
      sx={sx}
      {...props}
    >
      {detail ? (
        <Typography
          data-geek-error-state-detail
          variant="caption"
          component="p"
          sx={{
            mt: description ? 1 : 0.75,
            fontFamily: (theme) => theme.geek?.typography?.monoFontFamily || 'monospace',
            color: 'text.muted',
            maxWidth: 420,
            overflowWrap: 'anywhere',
            ...detailSx,
          }}
        >
          {detail}
        </Typography>
      ) : null}
    </GeekEmptyState>
  );
});
