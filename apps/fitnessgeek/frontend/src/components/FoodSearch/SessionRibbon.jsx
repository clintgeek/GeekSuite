import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { Undo as UndoIcon, CheckCircle as LoggedIcon } from '@mui/icons-material';
import { useTheme, keyframes } from '@mui/material/styles';
import { useGeekToastClearance } from '@geeksuite/ui';
import { sittingWhat } from './entries.js';

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
 * Now one tap shows "✓ Egg added to lunch · 72 cal" (or "3 foods added …")
 * with a Done that closes the sheet.
 *
 * NO "UNDO ALL" (L11). A red Undo all sat beside Undo last, two small buttons
 * apart, with no redo: one slip took back the whole sitting. Its Undo takes
 * back the last thing added, and is the sheet's only Undo for a tap (UX
 * review 2026-11, A9/B7: one label per scope — "Undo" for one item, "Undo
 * all" for everything just added; the toasts no longer carry a second one).
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
  // It names what it counts (B7): "Egg ×2" for one entry, "3 foods" for
  // more, a copied meal by its foods (entries.js).
  const what = sittingWhat(items);
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
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(16, 24, 40, 0.12)',
        backgroundColor: theme.palette.background.paper,
        animation: `${riseIn} 260ms cubic-bezier(0.22, 1, 0.36, 1)`,
        pb: `calc(${theme.spacing(1)} + var(--safe-area-inset-bottom, 0px))`
      }}
    >
      <LoggedIcon sx={{ color: primary, fontSize: 22, flexShrink: 0 }} aria-hidden />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {/* Two lines whatever the name (harness 2026-11-18: "Greek Yogurt,
            Plain Whole Milk added to lunch" wrapped to three): the name on
            one line, cut with an ellipsis; where and how much under it. */}
        <Typography data-testid="ribbon-what" noWrap sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.3 }}>
          {what}{' '}
        </Typography>
        <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary', lineHeight: 1.3 }}>
          {`added${where ? ` to ${where}` : ''} · ${displayed.toLocaleString('en-US')} cal`}
        </Typography>
      </Box>

      {onUndoLast && (
        <Button
          startIcon={<UndoIcon />}
          onClick={onUndoLast}
          disabled={busy}
          sx={{ color: 'text.primary', fontSize: '0.9375rem', fontWeight: 700, minHeight: 44, flexShrink: 0 }}
        >
          Undo
        </Button>
      )}
      {onDone && (
        <Button
          variant="contained"
          onClick={onDone}
          disabled={busy}
          data-testid="session-done"
          sx={{ minHeight: 48, fontWeight: 700, fontSize: '1rem', px: 2.5, boxShadow: 'none', flexShrink: 0 }}
        >
          Done
        </Button>
      )}
    </Box>
  );
};

export default SessionRibbon;
