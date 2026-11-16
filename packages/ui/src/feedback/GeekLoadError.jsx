/**
 * GeekLoadError — "Couldn't load your notes · Retry" (plan 2.5).
 *
 * The state a list shows when its load FAILED, which must never look like the
 * empty state ("No notes yet" when the server was unreachable is a lie that
 * costs trust). Pair it with `geekLoadStatus()` to pick between the two:
 *
 *   const status = geekLoadStatus({ loading, error, data: notes });
 *   if (status === 'error') return <GeekLoadError what="your notes" error={error} onRetry={refetch} />;
 *   if (status === 'empty') return <GeekEmptyState title="No notes yet" />;
 *
 * Built on `GeekErrorState` (same glyph, copy tokens and slots). Adds:
 *   - copy written for a failed load: "Couldn't load {what}", and an offline
 *     line when the browser says it is offline;
 *   - a Retry with a real 44x44 target that shows progress: pass `retrying`,
 *     or return a promise from `onRetry` and the button waits for it;
 *   - `role="alert"`, so a screen reader hears the failure;
 *   - `data-geek-load-error` hooks.
 *
 * Theming: each app restyles it through its theme like an MUI component —
 * `theme.components.GeekLoadError.defaultProps` (e.g. `retryVariant`,
 * `retryLabel`, `sx`, `iconSx`) — or per use with the same props. No colours
 * are set here; the glyph takes `error.main`, the copy the text tokens.
 */
import { forwardRef, useEffect, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import { useThemeProps } from '@mui/material/styles';
import { geekLayout } from '../designTokens.js';
import { GeekErrorState } from './GeekErrorState.jsx';

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export const GeekLoadError = forwardRef(function GeekLoadError(inProps, ref) {
  const {
    what,
    title,
    description,
    error,
    onRetry,
    retrying: retryingProp,
    retryLabel = 'Retry',
    retryingLabel = 'Retrying…',
    retryVariant = 'outlined',
    retrySx,
    offlineDescription = "You're offline. It will load when you're back online.",
    showDetail = true,
    action,
    ...rest
  } = useThemeProps({ props: inProps, name: 'GeekLoadError' });

  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );
  const retrying = Boolean(retryingProp) || pending;

  const handleRetry = (event) => {
    if (retrying || !onRetry) return;
    const result = onRetry(event);
    if (result && typeof result.then === 'function') {
      setPending(true);
      const done = () => {
        if (mounted.current) setPending(false);
      };
      result.then(done, done);
    }
  };

  const offline = isOffline();
  const resolvedTitle = title ?? (what ? `Couldn't load ${what}` : "Couldn't load this");
  const resolvedDescription = description ?? (offline ? offlineDescription : undefined);

  const retry = onRetry ? (
    <Button
      variant={retryVariant}
      onClick={handleRetry}
      disabled={retrying}
      aria-busy={retrying || undefined}
      data-geek-load-error="retry"
      sx={{ minHeight: geekLayout.minClickTarget, minWidth: geekLayout.minClickTarget, ...retrySx }}
    >
      {retrying ? retryingLabel : retryLabel}
    </Button>
  ) : null;

  return (
    <GeekErrorState
      ref={ref}
      role="alert"
      data-geek-load-error=""
      title={resolvedTitle}
      description={resolvedDescription}
      error={showDetail ? error : undefined}
      action={
        retry && action ? (
          <>
            {retry}
            {action}
          </>
        ) : (
          retry || action || null
        )
      }
      {...rest}
    />
  );
});
