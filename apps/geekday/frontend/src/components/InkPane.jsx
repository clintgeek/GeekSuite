/**
 * The ink page for one day (spec reqs 5–8): the canvas, and the truth about
 * whether what is on it has been saved.
 *
 * Mounted with `key={dayKey}`, so each day gets a fresh canvas. The saving
 * itself lives in store/dayNoteStore.js and carries on after this unmounts.
 */
import React, { Suspense, lazy, useEffect, useMemo, useRef } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import CloudDoneOutlined from '@mui/icons-material/CloudDoneOutlined';
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined';
import { GeekLoadError } from '@geeksuite/ui';

// tldraw is most of the bundle; the agenda should not wait for it.
const InkCanvas = lazy(() => import('../ink/index.js').then((module) => ({ default: module.InkCanvas })));

const RULE_PX = 44;

/** The diary page's ruled lines, shown while the canvas (which draws its own) is not there. */
const ruled = (theme) => ({
  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${RULE_PX - 1}px, ${theme.palette.day.rule} ${RULE_PX - 1}px, ${theme.palette.day.rule} ${RULE_PX}px)`,
  backgroundPositionY: '20px',
});

function PageWait({ label }) {
  return (
    <Box sx={(theme) => ({ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', ...ruled(theme) })}>
      <CircularProgress size={24} aria-label={label} />
    </Box>
  );
}

function SaveLine({ state, store }) {
  const { save } = state;
  if (save === 'idle') return null;

  if (save === 'saving' || save === 'saved') {
    return (
      <Box
        role="status"
        data-testid="ink-save-status"
        data-save={save}
        sx={(theme) => ({
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1.5,
          bgcolor: theme.palette.day.page,
          color: 'text.secondary',
          fontSize: '0.75rem',
          pointerEvents: 'none',
        })}
      >
        {save === 'saved' ? <CloudDoneOutlined sx={{ fontSize: 16 }} /> : <CircularProgress size={12} color="inherit" aria-hidden />}
        {save === 'saved' ? 'Saved' : 'Saving…'}
      </Box>
    );
  }

  const copy = {
    error: {
      text: 'Not saved yet. Your writing is kept on this page and will be sent again shortly.',
      actions: [{ label: 'Try now', onClick: () => store.retryNow(), testId: 'ink-save-retry' }],
    },
    conflict: {
      text: 'This page was changed on another device since you opened it.',
      actions: [
        { label: 'Keep this version', onClick: () => store.resolveConflict('mine'), testId: 'ink-conflict-mine', variant: 'contained' },
        { label: 'Use the other', onClick: () => store.resolveConflict('theirs'), testId: 'ink-conflict-theirs' },
      ],
    },
    tooLarge: {
      text: 'This page is too full to save. Erase a few strokes and it will save again.',
      actions: [],
    },
  }[save];

  return (
    <Box
      role="alert"
      data-testid="ink-save-problem"
      data-save={save}
      sx={(theme) => ({
        position: 'absolute',
        top: 8,
        left: 8,
        right: 8,
        zIndex: 3,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1,
        p: 1,
        pl: 1.5,
        borderRadius: 2,
        bgcolor: 'background.paper',
        border: `1px solid ${theme.palette.secondary.main}`,
        boxShadow: theme.shadows[3],
      })}
    >
      <CloudOffOutlined sx={{ color: 'secondary.main', fontSize: 20 }} aria-hidden />
      <Typography sx={{ flex: '1 1 220px', fontSize: '0.875rem', lineHeight: 1.35 }}>{copy.text}</Typography>
      {copy.actions.map((action) => (
        <Button
          key={action.label}
          size="small"
          variant={action.variant || 'outlined'}
          onClick={action.onClick}
          data-testid={action.testId}
          sx={{ minHeight: 44 }}
        >
          {action.label}
        </Button>
      ))}
    </Box>
  );
}

export default function InkPane({ dayLabel, state, store, inkRef, onLasso, onLassoError, onTouchDrawsChange, onPanStateChange }) {
  const localRef = useRef(null);
  const apiRef = inkRef || localRef;

  // The document handed to the canvas changes only when it came from the
  // server (a load, "use the other"). The page's own saves are not fed back.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const content = useMemo(() => state.content, [state.revision, state.phase]);

  // Anything still in the canvas's debounce is written before this day leaves the screen.
  useEffect(
    () => () => {
      const pending = apiRef.current?.flush?.();
      if (pending) store.write(pending);
    },
    [apiRef, store]
  );

  return (
    <Box
      component="section"
      aria-label={`Handwriting page for ${dayLabel}`}
      data-testid="ink-pane"
      sx={(theme) => ({
        position: 'relative',
        minHeight: 0,
        minWidth: 0,
        bgcolor: theme.palette.day.page,
        border: `1px solid ${theme.palette.day.divider}`,
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 1px 2px rgba(27,36,48,0.06), 0 8px 24px -12px rgba(27,36,48,0.18)',
      })}
    >
      {state.phase === 'loading' ? <PageWait label="Opening the page" /> : null}

      {state.phase === 'loadError' ? (
        <Box data-testid="ink-load-error" sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 2 }}>
          <GeekLoadError what="this page" onRetry={() => store.load()} />
        </Box>
      ) : null}

      {state.phase === 'ready' ? (
        <Suspense fallback={<PageWait label="Opening the page" />}>
          <InkCanvas
            content={content}
            onChange={(next) => store.write(next)}
            apiRef={apiRef}
            onLasso={onLasso}
            onLassoError={onLassoError}
            onTouchDrawsChange={onTouchDrawsChange}
            onPanStateChange={onPanStateChange}
            ariaLabel={`Handwriting page for ${dayLabel}`}
          />
        </Suspense>
      ) : null}

      <SaveLine state={state} store={store} />
    </Box>
  );
}
