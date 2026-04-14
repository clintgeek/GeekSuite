import React from 'react';
import { Box, Typography, Button, Chip, IconButton, Tooltip } from '@mui/material';
import {
  Check as CheckIcon,
  Replay as ResetIcon,
  Restore as RestoreIcon,
  RemoveCircleOutline as SkipIcon,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';

/**
 * CompositeResolver — turns AI-parsed composite query results into a row of
 * active "resolution cards." Each parsed item ("chicken enchilada", "chips",
 * "a beer") gets its own card with a horizontal strip of candidates. Exactly
 * one candidate is staged per group (or the group can be explicitly skipped).
 *
 * Auto-stage of best matches happens in the parent (UnifiedFoodSearch) — this
 * component is purely presentational. State sources of truth:
 *   - Which candidate is "current" for a group: derived from `trayItems` by
 *     finding the candidate whose identityKey matches a tray item.
 *   - Which groups are explicitly skipped: `skippedGroupKeys` from parent.
 *
 * Props:
 *   groups               — Array<{ item, quantity, unit, foods: Food[] }>
 *   trayItems            — current staging tray items (for derived selection)
 *   skippedGroupKeys     — Set<string> of explicitly-skipped group keys
 *   onSelectCandidate    — (group, food) => void  // atomically swap selection
 *   onSkipGroup          — (group) => void
 *   onRestoreGroup       — (group) => void        // un-skip + restage best
 *   onResetAll           — () => void             // clear all skips, restage all best
 *   groupKeyOf           — (group) => string      // stable key for a group
 *   getFoodIdentity      — (food) => string       // identity key for a food
 */

const SOURCE_LABEL = {
  usda: 'USDA',
  nutritionix: 'Nutritionix',
  openfoodfacts: 'OFF',
  custom: 'My Foods',
  ai: 'AI',
  meal: 'Meal',
};

const sourceLabel = (s) =>
  SOURCE_LABEL[(s || '').toLowerCase()] || (s ? s.toUpperCase() : '—');

// ─── StatusPill ──────────────────────────────────────────────────────────
const StatusPill = ({ icon, label, tone = 'muted' }) => {
  const theme = useTheme();
  const ink = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  const success = theme.palette.success.main;
  const warn = theme.palette.warning.main;

  let color, bg, border;
  if (tone === 'success') {
    color = success;
    bg = alpha(success, 0.12);
    border = alpha(success, 0.32);
  } else if (tone === 'warn') {
    color = warn;
    bg = alpha(warn, 0.12);
    border = alpha(warn, 0.32);
  } else {
    color = muted;
    bg = alpha(ink, 0.06);
    border = alpha(ink, 0.15);
  }

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color,
        backgroundColor: bg,
        border: `1px solid ${border}`,
        borderRadius: 999,
        px: 0.875,
        py: 0.25,
        maxWidth: '100%',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      <Box
        component="span"
        sx={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 220,
        }}
      >
        {label}
      </Box>
    </Box>
  );
};

// ─── CandidateCard ──────────────────────────────────────────────────────
const CandidateCard = ({ food, isSelected, isBest, onClick }) => {
  const theme = useTheme();
  const ink = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  const cals = Math.round(food?.nutrition?.calories_per_serving || 0);
  const protein = Math.round(food?.nutrition?.protein_grams || 0);

  return (
    <Box
      role="radio"
      aria-checked={isSelected}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      sx={{
        flex: '0 0 auto',
        scrollSnapAlign: 'start',
        width: { xs: 168, sm: 184 },
        position: 'relative',
        cursor: 'pointer',
        borderRadius: 2.5,
        p: 1.5,
        pt: 1.75,
        border: `1.5px solid ${isSelected ? primary : alpha(ink, 0.12)}`,
        backgroundColor: isSelected
          ? alpha(primary, isDark ? 0.18 : 0.07)
          : theme.palette.background.paper,
        transition:
          'border-color 200ms ease, background-color 200ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease',
        ...(isSelected && {
          boxShadow: `0 8px 18px -10px ${alpha(primary, 0.5)}`,
          transform: 'translateY(-2px)',
        }),
        '&:hover': {
          borderColor: isSelected ? primary : alpha(primary, 0.5),
          transform: 'translateY(-2px)',
          backgroundColor: isSelected
            ? alpha(primary, isDark ? 0.22 : 0.1)
            : alpha(primary, isDark ? 0.06 : 0.03),
        },
        '&:focus-visible': {
          outline: `2px solid ${primary}`,
          outlineOffset: 2,
        },
      }}
    >
      {/* Top-right marker: Best chip when not selected, check disc when selected */}
      <Box
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        {isBest && !isSelected && (
          <Box
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.5625rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: muted,
              px: 0.625,
              py: 0.125,
              borderRadius: 999,
              backgroundColor: alpha(ink, 0.06),
              border: `1px solid ${alpha(ink, 0.12)}`,
            }}
          >
            Best
          </Box>
        )}
        {isSelected && (
          <Box
            sx={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              backgroundColor: primary,
              color: theme.palette.primary.contrastText,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 6px 14px -4px ${alpha(primary, 0.55)}`,
              animation: 'candidateCheckPop 320ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              '@keyframes candidateCheckPop': {
                from: { transform: 'scale(0.4)', opacity: 0 },
                to: { transform: 'scale(1)', opacity: 1 },
              },
            }}
          >
            <CheckIcon sx={{ fontSize: 14 }} />
          </Box>
        )}
      </Box>

      {/* Name */}
      <Typography
        sx={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: ink,
          lineHeight: 1.3,
          mb: 0.5,
          pr: 3.5,
          minHeight: '2.1rem',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
        title={food.name}
      >
        {food.name}
      </Typography>

      {/* Brand or filler */}
      {food.brand ? (
        <Typography
          sx={{
            fontSize: '0.6875rem',
            color: muted,
            mb: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {food.brand}
        </Typography>
      ) : (
        <Box sx={{ height: '0.875rem', mb: 1 }} />
      )}

      {/* Cals (mono, dominant) + protein (small) */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
          <Typography
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontVariantNumeric: 'tabular-nums',
              fontSize: '1rem',
              fontWeight: 700,
              color: ink,
              lineHeight: 1,
            }}
          >
            {cals}
          </Typography>
          <Typography
            component="span"
            sx={{
              fontSize: '0.5625rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: muted,
            }}
          >
            kcal
          </Typography>
        </Box>
        <Typography
          sx={{
            fontFamily: "'JetBrains Mono', monospace",
            fontVariantNumeric: 'tabular-nums',
            fontSize: '0.625rem',
            fontWeight: 600,
            color: muted,
          }}
        >
          {protein}p
        </Typography>
      </Box>

      {/* Source caption */}
      <Typography
        sx={{
          mt: 0.75,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.5625rem',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: muted,
        }}
      >
        {sourceLabel(food.source)}
      </Typography>
    </Box>
  );
};

// ─── GroupCard ──────────────────────────────────────────────────────────
const GroupCard = ({
  group,
  chosenFood,
  skipped,
  onSelect,
  onSkip,
  onRestore,
  getFoodIdentity,
}) => {
  const theme = useTheme();
  const ink = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  const isResolved = !!chosenFood && !skipped;

  return (
    <Box
      sx={{
        borderRadius: 3,
        border: `1px solid ${
          skipped
            ? alpha(ink, 0.12)
            : isResolved
            ? alpha(primary, 0.35)
            : theme.palette.divider
        }`,
        backgroundColor: skipped
          ? alpha(ink, isDark ? 0.04 : 0.02)
          : theme.palette.background.paper,
        overflow: 'hidden',
        transition:
          'border-color 220ms ease, background-color 220ms ease, opacity 220ms ease, box-shadow 220ms ease',
        opacity: skipped ? 0.6 : 1,
        ...(isResolved && {
          boxShadow: `inset 0 0 0 1px ${alpha(primary, 0.18)}, 0 8px 24px -16px ${alpha(
            primary,
            0.4
          )}`,
        }),
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: { xs: 2, sm: 2.5 },
          pt: 1.75,
          pb: 1.25,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1.25,
          borderBottom: `1px dashed ${alpha(ink, 0.14)}`,
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              mb: 0.625,
              flexWrap: 'wrap',
            }}
          >
            <Typography
              sx={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: { xs: '1.25rem', sm: '1.375rem' },
                fontWeight: 400,
                color: ink,
                textTransform: 'capitalize',
                lineHeight: 1.1,
                letterSpacing: '-0.01em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: { xs: '100%', sm: 320 },
                textDecoration: skipped ? 'line-through' : 'none',
                textDecorationColor: alpha(ink, 0.4),
                textDecorationThickness: '1.5px',
              }}
              title={group.item}
            >
              {group.item}
            </Typography>
            <Chip
              label={`${group.quantity || 1} ${group.unit || ''}`.trim()}
              size="small"
              sx={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.625rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'lowercase',
                height: 20,
                backgroundColor: alpha(ink, 0.08),
                color: ink,
                border: `1px solid ${alpha(ink, 0.15)}`,
                borderRadius: '999px',
                flexShrink: 0,
                '& .MuiChip-label': { px: 1 },
              }}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {skipped ? (
              <StatusPill
                icon={<SkipIcon sx={{ fontSize: 12 }} />}
                label="Skipped"
                tone="muted"
              />
            ) : isResolved ? (
              <StatusPill
                icon={<CheckIcon sx={{ fontSize: 12 }} />}
                label={`Picked: ${chosenFood.name}`}
                tone="success"
              />
            ) : (
              <StatusPill label="Pick one" tone="warn" />
            )}
          </Box>
        </Box>

        {/* Skip / Restore */}
        <Box sx={{ flexShrink: 0 }}>
          {skipped ? (
            <Button
              size="small"
              startIcon={<RestoreIcon sx={{ fontSize: 16 }} />}
              onClick={onRestore}
              sx={{
                textTransform: 'uppercase',
                fontWeight: 700,
                fontSize: '0.625rem',
                letterSpacing: '0.12em',
                color: muted,
                px: 1,
                py: 0.5,
                minWidth: 0,
                '&:hover': { color: ink, backgroundColor: 'transparent' },
              }}
            >
              Restore
            </Button>
          ) : (
            <Button
              size="small"
              startIcon={<SkipIcon sx={{ fontSize: 16 }} />}
              onClick={onSkip}
              aria-label={`Skip ${group.item}`}
              sx={{
                textTransform: 'uppercase',
                fontWeight: 700,
                fontSize: '0.625rem',
                letterSpacing: '0.12em',
                color: muted,
                px: 1,
                py: 0.5,
                minWidth: 0,
                '&:hover': {
                  color: theme.palette.error.main,
                  backgroundColor: 'transparent',
                },
              }}
            >
              Skip
            </Button>
          )}
        </Box>
      </Box>

      {/* Candidate strip */}
      {!skipped && (
        <Box
          role="radiogroup"
          aria-label={`Candidates for ${group.item}`}
          sx={{
            display: 'flex',
            gap: 1.25,
            px: { xs: 2, sm: 2.5 },
            py: 1.75,
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollSnapType: 'x mandatory',
            scrollPaddingInlineStart: 16,
            '&::-webkit-scrollbar': { height: 6 },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              background: alpha(ink, 0.18),
              borderRadius: 3,
            },
          }}
        >
          {group.foods.map((food, idx) => {
            const identity = getFoodIdentity(food);
            const chosenIdentity = chosenFood ? getFoodIdentity(chosenFood) : null;
            const isSelected = identity === chosenIdentity;
            return (
              <CandidateCard
                key={`${identity}_${idx}`}
                food={food}
                isSelected={isSelected}
                isBest={idx === 0}
                onClick={() => onSelect(food)}
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
};

// ─── CompositeResolver ──────────────────────────────────────────────────
const CompositeResolver = ({
  groups,
  trayItems,
  skippedGroupKeys,
  onSelectCandidate,
  onSkipGroup,
  onRestoreGroup,
  onResetAll,
  groupKeyOf,
  getFoodIdentity,
}) => {
  const theme = useTheme();
  const ink = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  // Index tray contents by identity for fast lookup
  const trayIdentityKeys = React.useMemo(
    () => new Set(trayItems.map((i) => i.identityKey)),
    [trayItems]
  );

  // Compute per-group resolution state
  const groupResolved = React.useMemo(
    () =>
      groups.map((group) => {
        const groupKey = groupKeyOf(group);
        const skipped = skippedGroupKeys.has(groupKey);
        const chosenFood = skipped
          ? null
          : group.foods.find((f) => trayIdentityKeys.has(getFoodIdentity(f))) || null;
        return { groupKey, group, skipped, chosenFood };
      }),
    [groups, skippedGroupKeys, trayIdentityKeys, groupKeyOf, getFoodIdentity]
  );

  const totalCount = groups.length;
  const pickedCount = groupResolved.filter((g) => g.chosenFood).length;
  const skippedCount = groupResolved.filter((g) => g.skipped).length;
  const allResolved = pickedCount + skippedCount === totalCount;
  const allPicked = pickedCount === totalCount;

  // Progress bar fill
  const progressPct = totalCount === 0 ? 0 : ((pickedCount + skippedCount) / totalCount) * 100;

  return (
    <Box sx={{ mb: 3 }}>
      {/* Editorial header */}
      <Box sx={{ mb: 2 }}>
        <Typography
          sx={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            color: muted,
            mb: 0.5,
          }}
        >
          AI Parsed · {totalCount} Item{totalCount !== 1 ? 's' : ''}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            alignItems: { xs: 'flex-start', sm: 'flex-end' },
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Typography
            component="h2"
            sx={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: { xs: '1.5rem', sm: '1.875rem' },
              fontWeight: 400,
              lineHeight: 1.1,
              color: ink,
              letterSpacing: '-0.015em',
            }}
          >
            Your Meal, Broken Down
          </Typography>

          {/* Progress + reset */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                fontFamily: "'JetBrains Mono', monospace",
                fontVariantNumeric: 'tabular-nums',
                fontSize: '0.6875rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: allPicked ? primary : muted,
                px: 1.25,
                py: 0.625,
                borderRadius: 999,
                border: `1.5px solid ${
                  allPicked ? primary : alpha(ink, 0.18)
                }`,
                backgroundColor: allPicked
                  ? alpha(primary, isDark ? 0.16 : 0.08)
                  : 'transparent',
                transition: 'all 240ms ease',
              }}
            >
              {allPicked && <CheckIcon sx={{ fontSize: 13 }} />}
              {pickedCount} / {totalCount} picked
              {skippedCount > 0 && (
                <Box component="span" sx={{ opacity: 0.7 }}>
                  · {skippedCount} skip{skippedCount !== 1 ? 'd' : ''}
                </Box>
              )}
            </Box>
            <Tooltip title="Reset to best matches" placement="top">
              <span>
                <IconButton
                  size="small"
                  onClick={onResetAll}
                  aria-label="Reset all picks to best matches"
                  sx={{
                    color: muted,
                    border: `1.5px solid ${alpha(ink, 0.18)}`,
                    width: 30,
                    height: 30,
                    transition: 'all 200ms ease',
                    '&:hover': {
                      color: ink,
                      borderColor: ink,
                      transform: 'rotate(-30deg)',
                    },
                  }}
                >
                  <ResetIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>

        {/* Progress bar */}
        <Box
          sx={{
            mt: 1.5,
            height: 3,
            borderRadius: 999,
            backgroundColor: alpha(ink, isDark ? 0.1 : 0.06),
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              width: `${progressPct}%`,
              backgroundColor: allPicked ? primary : alpha(primary, 0.7),
              borderRadius: 999,
              transition: 'width 380ms cubic-bezier(0.22, 1, 0.36, 1), background-color 240ms ease',
            }}
          />
        </Box>
      </Box>

      {/* Helper hint */}
      <Box
        sx={{
          mb: 2,
          px: 2,
          py: 1.25,
          borderLeft: `3px solid ${primary}`,
          borderRadius: 0.5,
          backgroundColor: alpha(primary, isDark ? 0.08 : 0.04),
        }}
      >
        <Typography sx={{ fontSize: '0.8125rem', color: ink, lineHeight: 1.55 }}>
          We picked our best guess for each item — tap an alternative to swap, or
          skip what you don't want. Your tray updates as you go.
        </Typography>
      </Box>

      {/* Resolution cards */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {groupResolved.map(({ groupKey, group, skipped, chosenFood }) => (
          <GroupCard
            key={groupKey}
            group={group}
            chosenFood={chosenFood}
            skipped={skipped}
            onSelect={(food) => onSelectCandidate(group, food)}
            onSkip={() => onSkipGroup(group)}
            onRestore={() => onRestoreGroup(group)}
            getFoodIdentity={getFoodIdentity}
          />
        ))}
      </Box>
    </Box>
  );
};

export default CompositeResolver;
