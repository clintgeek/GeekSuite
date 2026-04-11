import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, IconButton, Button, Chip, Tooltip } from '@mui/material';
import {
  Close as CloseIcon,
  Remove as MinusIcon,
  Add as PlusIcon,
  RestaurantMenu as TrayIcon,
  ArrowForward as CommitIcon
} from '@mui/icons-material';
import { useTheme, alpha, keyframes } from '@mui/material/styles';

// ─── Physical slide-up: tray rises from below, overshoots slightly, settles ───
const riseIn = keyframes`
  0%   { transform: translateY(100%); opacity: 0; }
  60%  { transform: translateY(-8px); opacity: 1; }
  100% { transform: translateY(0); opacity: 1; }
`;

// ─── Fresh item pulse: when a new food joins the tray ───
const pulseGlow = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(13, 148, 136, 0.45); transform: scale(1); }
  40%  { box-shadow: 0 0 0 8px rgba(13, 148, 136, 0.12); transform: scale(1.015); }
  100% { box-shadow: 0 0 0 0 rgba(13, 148, 136, 0); transform: scale(1); }
`;

// ─── Odometer-style count-up for the total ───
const useCountUp = (target, duration = 380) => {
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);

  useEffect(() => {
    const from = prev.current;
    const to = target;
    if (from === to) return;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
};

const computeItemCalories = (item) => {
  const per = Number(item?.nutrition?.calories_per_serving) || 0;
  const s = Number(item?.servings) || 1;
  return Math.round(per * s);
};

const StagingTray = ({
  items = [],
  mealType = 'meal',
  onUpdateServings,
  onRemove,
  onClear,
  onCommit,
  committing = false
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const primary = theme.palette.primary.main;
  const ink = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  const canvas = theme.palette.background.paper;

  // Track item count so we can animate ENTRY of new items (not just render)
  const prevIdsRef = useRef(new Set());
  const [justAddedIds, setJustAddedIds] = useState(new Set());

  useEffect(() => {
    const currentIds = new Set(items.map((i) => i.stageId));
    const incoming = [...currentIds].filter((id) => !prevIdsRef.current.has(id));
    if (incoming.length > 0) {
      setJustAddedIds(new Set(incoming));
      const t = setTimeout(() => setJustAddedIds(new Set()), 650);
      prevIdsRef.current = currentIds;
      return () => clearTimeout(t);
    }
    prevIdsRef.current = currentIds;
  }, [items]);

  const totalCalories = items.reduce((sum, item) => sum + computeItemCalories(item), 0);
  const animatedTotal = useCountUp(totalCalories);
  const itemCount = items.length;

  if (itemCount === 0) return null;

  return (
    <Box
      role="region"
      aria-label="Staging tray"
      sx={{
        position: 'sticky',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        mt: 3,
        animation: `${riseIn} 380ms cubic-bezier(0.22, 1, 0.36, 1)`,
        // Ticket-rail: heavy top border that feels like a deli ticket stub
        background: isDark
          ? `linear-gradient(180deg, ${alpha(canvas, 0.92)} 0%, ${alpha(canvas, 0.98)} 100%)`
          : `linear-gradient(180deg, #FFFFFF 0%, #FDFCFB 100%)`,
        backdropFilter: 'blur(12px)',
        borderTop: `3px solid ${ink}`,
        borderLeft: `1px solid ${theme.palette.divider}`,
        borderRight: `1px solid ${theme.palette.divider}`,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        boxShadow: isDark
          ? '0 -24px 64px rgba(0, 0, 0, 0.5)'
          : '0 -24px 64px rgba(28, 25, 23, 0.18)',
        overflow: 'hidden',
        // Decorative notched edge reminiscent of a receipt
        '&::before': {
          content: '""',
          position: 'absolute',
          top: -3,
          left: 24,
          right: 24,
          height: 3,
          background: `repeating-linear-gradient(90deg, ${ink} 0 14px, transparent 14px 18px)`,
          opacity: 0.85
        }
      }}
    >
      {/* Header: editorial title + running total */}
      <Box
        sx={{
          px: { xs: 2.5, sm: 3.5 },
          pt: { xs: 2, sm: 2.5 },
          pb: { xs: 1.25, sm: 1.5 },
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 2,
          borderBottom: `1px dashed ${alpha(ink, 0.18)}`
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, minWidth: 0 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: primary,
              color: theme.palette.primary.contrastText,
              flexShrink: 0
            }}
          >
            <TrayIcon sx={{ fontSize: 18 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="h2"
              sx={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: { xs: '1.375rem', sm: '1.625rem' },
                fontWeight: 400,
                lineHeight: 1,
                color: ink,
                letterSpacing: '-0.01em'
              }}
            >
              Your Tray
            </Typography>
            <Typography
              component="p"
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: muted,
                mt: 0.5
              }}
            >
              {itemCount} item{itemCount !== 1 ? 's' : ''} · for {mealType}
            </Typography>
          </Box>
        </Box>

        {/* Running calorie total — monospaced odometer */}
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontVariantNumeric: 'tabular-nums',
              fontSize: { xs: '1.625rem', sm: '2rem' },
              fontWeight: 600,
              lineHeight: 1,
              color: ink,
              letterSpacing: '-0.02em'
            }}
          >
            {animatedTotal}
          </Typography>
          <Typography
            sx={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: muted,
              mt: 0.5
            }}
          >
            kcal total
          </Typography>
        </Box>
      </Box>

      {/* Staged items — horizontal scroll on mobile, wrapped grid on desktop */}
      <Box
        sx={{
          px: { xs: 2, sm: 3.5 },
          py: 1.5,
          maxHeight: { xs: 172, sm: 196 },
          overflowY: 'auto',
          overflowX: 'hidden',
          // Custom scrollbar that feels deliberate
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': {
            background: alpha(ink, 0.2),
            borderRadius: 3
          }
        }}
      >
        {items.map((item, index) => {
          const isFresh = justAddedIds.has(item.stageId);
          const calsForThis = computeItemCalories(item);
          return (
            <Box
              key={item.stageId}
              sx={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                alignItems: 'center',
                gap: { xs: 1.25, sm: 2 },
                py: 1,
                px: 1.25,
                borderRadius: 2,
                transition: 'background-color 180ms ease',
                animation: isFresh ? `${pulseGlow} 650ms ease-out` : 'none',
                '&:hover': {
                  backgroundColor: alpha(primary, isDark ? 0.08 : 0.04)
                },
                '&:not(:last-of-type)': {
                  borderBottom: `1px dotted ${alpha(ink, 0.1)}`
                }
              }}
            >
              {/* Name + source */}
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    color: ink,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.3
                  }}
                  title={item.name}
                >
                  {item.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                  {item.brand && (
                    <Typography
                      sx={{
                        fontSize: '0.75rem',
                        color: muted,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {item.brand}
                    </Typography>
                  )}
                  <Typography
                    sx={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: '0.75rem',
                      color: muted
                    }}
                  >
                    {calsForThis} kcal
                  </Typography>
                </Box>
              </Box>

              {/* Servings stepper — inline, no modal */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.25,
                  border: `1px solid ${alpha(ink, 0.18)}`,
                  borderRadius: 999,
                  px: 0.25,
                  py: 0.25
                }}
              >
                <IconButton
                  size="small"
                  aria-label={`Decrease servings for ${item.name}`}
                  onClick={() => onUpdateServings(item.stageId, Math.max(0.25, (item.servings || 1) - 0.25))}
                  sx={{
                    width: 26,
                    height: 26,
                    color: ink,
                    '&:hover': { backgroundColor: alpha(primary, 0.12) }
                  }}
                >
                  <MinusIcon sx={{ fontSize: 14 }} />
                </IconButton>
                <Typography
                  sx={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: ink,
                    minWidth: 30,
                    textAlign: 'center'
                  }}
                >
                  {Number(item.servings || 1).toFixed(Number.isInteger(item.servings || 1) ? 0 : 2)}
                </Typography>
                <IconButton
                  size="small"
                  aria-label={`Increase servings for ${item.name}`}
                  onClick={() => onUpdateServings(item.stageId, (item.servings || 1) + 0.25)}
                  sx={{
                    width: 26,
                    height: 26,
                    color: ink,
                    '&:hover': { backgroundColor: alpha(primary, 0.12) }
                  }}
                >
                  <PlusIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>

              {/* Remove */}
              <Tooltip title="Remove from tray" placement="left">
                <IconButton
                  size="small"
                  aria-label={`Remove ${item.name} from tray`}
                  onClick={() => onRemove(item.stageId)}
                  sx={{
                    width: 28,
                    height: 28,
                    color: muted,
                    '&:hover': {
                      color: theme.palette.error.main,
                      backgroundColor: alpha(theme.palette.error.main, 0.1)
                    }
                  }}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          );
        })}
      </Box>

      {/* Actions bar */}
      <Box
        sx={{
          px: { xs: 2.5, sm: 3.5 },
          py: { xs: 1.5, sm: 2 },
          pb: `calc(${theme.spacing(1.5)} + var(--safe-area-inset-bottom, 0px))`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          borderTop: `1px dashed ${alpha(ink, 0.18)}`,
          backgroundColor: alpha(canvas, isDark ? 0.4 : 0.6)
        }}
      >
        <Button
          onClick={onClear}
          disabled={committing}
          sx={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: muted,
            px: 1.5,
            minWidth: 'auto',
            '&:hover': {
              color: theme.palette.error.main,
              backgroundColor: 'transparent'
            }
          }}
        >
          Clear Tray
        </Button>

        <Button
          onClick={onCommit}
          disabled={committing || itemCount === 0}
          endIcon={<CommitIcon />}
          sx={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.875rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: theme.palette.primary.contrastText,
            background: `linear-gradient(135deg, ${primary}, ${theme.palette.primary.dark})`,
            px: { xs: 2.5, sm: 3.5 },
            py: 1.25,
            borderRadius: 999,
            boxShadow: `0 10px 24px -8px ${alpha(primary, 0.6)}`,
            transition: 'all 200ms cubic-bezier(0.22, 1, 0.36, 1)',
            '&:hover': {
              background: `linear-gradient(135deg, ${theme.palette.primary.dark}, ${primary})`,
              boxShadow: `0 14px 32px -8px ${alpha(primary, 0.75)}`,
              transform: 'translateY(-1px)'
            },
            '&:disabled': {
              background: alpha(ink, 0.12),
              color: alpha(ink, 0.4),
              boxShadow: 'none'
            }
          }}
        >
          {committing ? 'Logging…' : `Log ${itemCount} Item${itemCount !== 1 ? 's' : ''}`}
        </Button>
      </Box>
    </Box>
  );
};

export default StagingTray;
