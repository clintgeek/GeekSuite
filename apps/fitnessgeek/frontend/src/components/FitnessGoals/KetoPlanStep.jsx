import React from 'react';
import {
  Box,
  Typography,
  Slider,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';

/**
 * Preset macro split definitions.
 * lazy = null signals "no split tracking, only watch the carb cap".
 */
const KETO_PRESETS = {
  classic:      { fat_pct: 70, protein_pct: 25, carb_pct: 5 },
  high_protein: { fat_pct: 60, protein_pct: 35, carb_pct: 5 },
  lazy:         null,
};

const PRESET_LABELS = {
  classic:      'Classic 70/25/5',
  high_protein: 'High Protein 60/35/5',
  lazy:         'Lazy Keto',
};

/**
 * KetoPlanStep — Step 3b of the goal wizard (shown when mode === 'keto').
 *
 * Props:
 *   ketoConfig   — { net_carb_limit_g, track_net_carbs, macro_split: { preset, fat_pct, protein_pct, carb_pct } }
 *   onChange     — (updatedConfig) => void
 *   calorieTarget — number | undefined  (used to derive gram equivalents)
 */
const KetoPlanStep = ({ ketoConfig, onChange, calorieTarget }) => {
  const theme = useTheme();

  const {
    net_carb_limit_g = 20,
    track_net_carbs = true,
    macro_split = { preset: 'classic', fat_pct: 70, protein_pct: 25, carb_pct: 5 },
  } = ketoConfig || {};

  const { preset = 'classic', fat_pct = 70, protein_pct = 25, carb_pct = 5 } = macro_split;
  const isLazy = preset === 'lazy';

  // ── helpers ────────────────────────────────────────────────────────────────

  const handleNetCarbLimitChange = (_e, newValue) => {
    onChange({ ...ketoConfig, net_carb_limit_g: newValue });
  };

  const handlePresetChange = (selectedPreset) => {
    const split = KETO_PRESETS[selectedPreset];
    onChange({
      ...ketoConfig,
      macro_split: split
        ? { preset: selectedPreset, ...split }
        : { preset: selectedPreset, fat_pct, protein_pct, carb_pct },
    });
  };

  const handleTrackToggle = (_e, newValue) => {
    // ToggleButtonGroup fires null if the same button is clicked — ignore
    if (newValue === null) return;
    onChange({ ...ketoConfig, track_net_carbs: newValue === 'net' });
  };

  // Gram equivalents from calorie target
  const gramEquivalents =
    !isLazy && calorieTarget
      ? {
          fat_g:     Math.round((calorieTarget * (fat_pct / 100)) / 9),
          protein_g: Math.round((calorieTarget * (protein_pct / 100)) / 4),
          carbs_g:   Math.round((calorieTarget * (carb_pct / 100)) / 4),
        }
      : null;

  // ── section label style ────────────────────────────────────────────────────
  const labelSx = {
    fontFamily: '"DM Sans", sans-serif',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'text.secondary',
    mb: 1,
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

      {/* ── A. Net Carb Limit ──────────────────────────────────────────────── */}
      <Box>
        <Typography sx={labelSx}>Daily Net Carb Limit</Typography>

        {/* Live value */}
        <Typography
          sx={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '1.5rem',
            fontWeight: 700,
            color: theme.palette.warning.main,
            mb: 1,
          }}
        >
          {net_carb_limit_g}g
        </Typography>

        <Slider
          min={10}
          max={50}
          step={5}
          value={net_carb_limit_g}
          onChange={handleNetCarbLimitChange}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}g`}
          sx={{
            color: theme.palette.warning.main,
            '& .MuiSlider-thumb': {
              '&:hover, &.Mui-focusVisible': {
                boxShadow: `0 0 0 8px ${theme.palette.warning.main}22`,
              },
            },
          }}
        />

        <Typography variant="caption" color="text.secondary">
          Most keto protocols target 20g or less
        </Typography>
      </Box>

      {/* ── B. Macro Split Presets ─────────────────────────────────────────── */}
      <Box>
        <Typography sx={labelSx}>Macro Split</Typography>

        {/* Preset chips */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          {Object.keys(KETO_PRESETS).map((key) => {
            const isSelected = preset === key;
            return (
              <Chip
                key={key}
                label={PRESET_LABELS[key]}
                variant={isSelected ? 'filled' : 'outlined'}
                onClick={() => handlePresetChange(key)}
                sx={
                  isSelected
                    ? {
                        bgcolor: theme.palette.warning.main,
                        color: theme.palette.getContrastText(theme.palette.warning.main),
                        '&:hover': { bgcolor: theme.palette.warning.dark },
                        fontFamily: '"DM Sans", sans-serif',
                      }
                    : {
                        fontFamily: '"DM Sans", sans-serif',
                        borderColor: theme.palette.divider,
                      }
                }
              />
            );
          })}
        </Box>

        {/* Split bar — hidden for Lazy Keto */}
        {!isLazy ? (
          <>
            {/* Stacked macro bar */}
            <Box
              sx={{
                display: 'flex',
                width: '100%',
                height: 8,
                borderRadius: '4px',
                overflow: 'hidden',
                mb: 1,
              }}
            >
              <Box
                sx={{
                  width: `${fat_pct}%`,
                  bgcolor: theme.palette.error.main,
                  transition: 'width 200ms ease-out',
                }}
              />
              <Box
                sx={{
                  width: `${protein_pct}%`,
                  bgcolor: theme.palette.success.main,
                  transition: 'width 200ms ease-out',
                }}
              />
              <Box
                sx={{
                  width: `${carb_pct}%`,
                  bgcolor: theme.palette.warning.main,
                  transition: 'width 200ms ease-out',
                }}
              />
            </Box>

            {/* Bar legend */}
            <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
              {[
                { label: 'Fat', pct: fat_pct, color: theme.palette.error.main },
                { label: 'Protein', pct: protein_pct, color: theme.palette.success.main },
                { label: 'Carbs', pct: carb_pct, color: theme.palette.warning.main },
              ].map(({ label, pct, color }) => (
                <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
                  <Typography variant="caption" color="text.secondary">
                    {label} {pct}%
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* Gram equivalents */}
            {gramEquivalents && (
              <Typography
                variant="caption"
                sx={{
                  fontFamily: '"JetBrains Mono", monospace',
                  color: 'text.secondary',
                  display: 'block',
                }}
              >
                Fat {gramEquivalents.fat_g}g · Protein {gramEquivalents.protein_g}g · Carbs {gramEquivalents.carbs_g}g
              </Typography>
            )}
          </>
        ) : (
          <Typography variant="caption" color="text.secondary">
            Track only the carb cap — no macro split
          </Typography>
        )}
      </Box>

      {/* ── C. Net vs Total Carbs Toggle ───────────────────────────────────── */}
      <Box>
        <Typography sx={labelSx}>Carb Tracking Method</Typography>

        <ToggleButtonGroup
          exclusive
          value={track_net_carbs ? 'net' : 'total'}
          onChange={handleTrackToggle}
          size="small"
          sx={{ mb: 1 }}
        >
          <ToggleButton
            value="net"
            sx={{
              fontFamily: '"DM Sans", sans-serif',
              fontSize: '0.8125rem',
              textTransform: 'none',
              px: 2,
            }}
          >
            Net Carbs (carbs − fiber)
          </ToggleButton>
          <ToggleButton
            value="total"
            sx={{
              fontFamily: '"DM Sans", sans-serif',
              fontSize: '0.8125rem',
              textTransform: 'none',
              px: 2,
            }}
          >
            Total Carbs
          </ToggleButton>
        </ToggleButtonGroup>

        <Typography variant="caption" color="text.secondary" display="block">
          Net is standard. Total is stricter.
        </Typography>
      </Box>

    </Box>
  );
};

export default KetoPlanStep;
