import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { Undo as UndoIcon, CheckCircle as LoggedIcon } from '@mui/icons-material';
import { useTheme, alpha, keyframes } from '@mui/material/styles';

const riseIn = keyframes`
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
`;

/** Odometer count-up, kept from the old staging tray — it earned its place. */
const useCountUp = (target, duration = 380) => {
  const [display, setDisplay] = useState(target);
  const previous = useRef(target);

  useEffect(() => {
    const from = previous.current;
    if (from === target) return undefined;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else previous.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
};

/**
 * What you have logged in this sitting, and one way to take it back.
 *
 * This is what the staging tray became. The tray existed because logging was a
 * two-step commit; now a tap logs, so there is nothing to stage — but there IS
 * something worth showing once you are mid-meal: how much you have put down so
 * far. It stays out of the way for a single item and appears from the second.
 */
const SessionRibbon = ({ items = [], onUndoAll, onUndoLast, busy = false }) => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  const totalCalories = items.reduce((sum, item) => {
    const per = Number(item?.nutrition?.calories_per_serving) || 0;
    return sum + per * (Number(item?.servings) || 1);
  }, 0);
  const displayed = useCountUp(Math.round(totalCalories));

  // One item is a toast's job, not a dock's.
  if (items.length < 2) return null;

  return (
    <Box
      sx={{
        position: 'sticky',
        bottom: 0,
        zIndex: 20,
        mt: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.25,
        borderRadius: 3,
        border: `1px solid ${alpha(primary, 0.35)}`,
        backgroundColor: theme.palette.background.paper,
        backdropFilter: 'blur(8px)',
        boxShadow: `0 10px 30px -18px ${alpha(theme.palette.common.black, 0.6)}`,
        animation: `${riseIn} 260ms cubic-bezier(0.22, 1, 0.36, 1)`,
        pb: `calc(${theme.spacing(1.25)} + var(--safe-area-inset-bottom, 0px))`
      }}
    >
      <LoggedIcon sx={{ color: primary, fontSize: 20, flexShrink: 0 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: 'text.primary' }}>
          {items.length} logged
        </Typography>
        <Typography
          sx={{ fontSize: '0.75rem', color: 'text.secondary', fontFamily: "'JetBrains Mono', monospace" }}
        >
          {displayed} cal this sitting
        </Typography>
      </Box>

      <Button
        size="small"
        onClick={onUndoLast}
        disabled={busy}
        sx={{ color: 'text.secondary', fontSize: '0.75rem', minHeight: 44 }}
      >
        Undo last
      </Button>
      <Button
        size="small"
        startIcon={<UndoIcon />}
        onClick={onUndoAll}
        disabled={busy}
        sx={{
          color: theme.palette.error.main,
          fontSize: '0.75rem',
          minHeight: 44,
          flexShrink: 0
        }}
      >
        Undo all
      </Button>
    </Box>
  );
};

export default SessionRibbon;
