import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { Undo as UndoIcon, CheckCircle as LoggedIcon } from '@mui/icons-material';
import { useTheme, alpha, keyframes } from '@mui/material/styles';
import { useGeekToastClearance } from '@geeksuite/ui';

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
 * What you have logged in this sitting, a way to take the last one back, and
 * Done.
 *
 * This is what the staging tray became. The tray existed because logging was a
 * two-step commit; now a tap logs, so there is nothing to stage — but there IS
 * something worth showing: that it landed, how much, and how to finish.
 *
 * FROM THE FIRST ITEM (L10). It used to wait for the second, and the only way
 * out of a picking session was the sheet's ✕, which reads as "cancel what I
 * did here" — so Heather hesitated, or tapped the food again "to be sure".
 * Now one tap shows "✓ 1 added to lunch · 190 cal" with a Done that closes
 * the sheet.
 *
 * NO "UNDO ALL" (L11). A red Undo all sat beside Undo last, two small buttons
 * apart, with no redo: one slip took back the whole sitting. Undo last stays;
 * each toast still has its own Undo.
 *
 * TOASTS STAY ABOVE IT. The ten-second "Added ✓ · Undo" toast used to land
 * right over Done on a phone, so the button she reaches for to finish was
 * under a toast for ten seconds. The ribbon registers itself with the toast
 * stack, which rises above it.
 *
 * `where` is the meal in words ("lunch", "Thursday's dinner"), or null when
 * the sitting spans meals.
 */
const SessionRibbon = ({ items = [], where = null, onUndoLast, onDone, busy = false }) => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  const totalCalories = items.reduce((sum, item) => {
    // A saved meal carries no `nutrition` of its own — its total is
    // `totalNutrition` — and was counted as 0 cal.
    const source = item?.type === 'meal' ? (item?.totalNutrition || item?.nutrition) : item?.nutrition;
    const per = Number(source?.calories_per_serving) || 0;
    return sum + per * (Number(item?.servings) || 1);
  }, 0);
  const displayed = useCountUp(Math.round(totalCalories));
  const ribbonRef = useRef(null);
  useGeekToastClearance(ribbonRef, items.length > 0);

  if (items.length < 1) return null;

  return (
    <Box
      ref={ribbonRef}
      data-testid="session-ribbon"
      role="status"
      sx={{
        position: 'sticky',
        bottom: 0,
        zIndex: 20,
        mt: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1,
        borderRadius: 3,
        border: `1px solid ${alpha(primary, 0.35)}`,
        backgroundColor: theme.palette.background.paper,
        backdropFilter: 'blur(8px)',
        boxShadow: `0 10px 30px -18px ${alpha(theme.palette.common.black, 0.6)}`,
        animation: `${riseIn} 260ms cubic-bezier(0.22, 1, 0.36, 1)`,
        pb: `calc(${theme.spacing(1)} + var(--safe-area-inset-bottom, 0px))`
      }}
    >
      <LoggedIcon sx={{ color: primary, fontSize: 22, flexShrink: 0 }} aria-hidden />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: 'text.primary', lineHeight: 1.3 }}>
          {items.length} added{where ? ` to ${where}` : ''}
        </Typography>
        <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary', lineHeight: 1.3 }}>
          {displayed.toLocaleString('en-US')} cal
        </Typography>
      </Box>

      {onUndoLast && (
        <Button
          startIcon={<UndoIcon />}
          onClick={onUndoLast}
          disabled={busy}
          sx={{ color: 'text.primary', fontSize: '0.9375rem', fontWeight: 700, minHeight: 44, flexShrink: 0 }}
        >
          Undo last
        </Button>
      )}
      {onDone && (
        <Button
          variant="contained"
          onClick={onDone}
          disabled={busy}
          data-testid="session-done"
          sx={{ minHeight: 48, borderRadius: 999, fontWeight: 800, fontSize: '1rem', px: 2.5, boxShadow: 'none', flexShrink: 0 }}
        >
          Done
        </Button>
      )}
    </Box>
  );
};

export default SessionRibbon;
