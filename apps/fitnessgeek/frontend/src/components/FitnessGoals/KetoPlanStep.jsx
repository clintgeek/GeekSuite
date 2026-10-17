import React from 'react';
import {
  Box,
  Typography,
  Slider,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { macroColors } from '../../theme/theme.jsx';
import { previewMacros, ProteinBasisNote } from './planProvenance.jsx';

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
  high_protein: 'High protein 60/35/5',
  lazy:         'Lazy keto',
};

/**
 * KetoPlanStep — Step 3b of the goal wizard (shown when mode === 'keto').
 *
 * Props:
 *   ketoConfig   — { net_carb_limit_g, track_net_carbs, macro_split: { preset, fat_pct, protein_pct, carb_pct } }
 *   onChange     — (updatedConfig) => void
 *   calorieTarget — number | undefined  (used to derive gram equivalents)
 *   baseGoal     — the rest of the nutrition_goal about to be saved (target
 *                  weight, per-lb rules). Merged under mode/keto for the preview.
 *   leanMassLb   — averaged recent lean mass when a usable scan exists, else null
 */
const KetoPlanStep = ({ ketoConfig, onChange, calorieTarget, baseGoal = null, leanMassLb = null }) => {
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

  // Gram equivalents: the same macroRules + macrosForCalories the gateway's
  // derivedMacros runs (plan D4/D5). This used to be a bare % split of
  // calories, which stops being what the dashboard serves the moment protein
  // is anchored to lean mass (protein from the rule, fat the remainder).
  const preview =
    !isLazy && calorieTarget
      ? previewMacros(
          { ...(baseGoal || {}), mode: 'keto', keto: { ...(ketoConfig || {}), macro_split } },
          { leanMassLb, calories: calorieTarget }
        )
      : null;
  const gramEquivalents = preview ? preview.grams : null;

  // Macros in their own ramp, not the semantic tones (visual review B2):
  // fat was error red, protein success, carbs warning ochre.
  const macro = macroColors(theme.palette.mode);

  // ── section label style ────────────────────────────────────────────────────
  const labelSx = {
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'text.secondary',
    mb: 1,
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

      {/* ── A. Net Carb Limit ──────────────────────────────────────────────── */}
      <Box>
        <Typography sx={labelSx}>Net carbs a day, at most</Typography>

        {/* Live value */}
        <Typography
          sx={{
            fontFamily: 'inherit',
            fontSize: '1.5rem',
            fontWeight: 700,
            color: macro.carbs,
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
            color: theme.palette.primary.main,
            '& .MuiSlider-thumb': {
              '&:hover, &.Mui-focusVisible': {
                boxShadow: `0 0 0 8px ${alpha(theme.palette.primary.main, 0.14)}`,
              },
            },
          }}
        />

        <Typography variant="caption" color="text.secondary">
          Most keto plans aim for 20g or less
        </Typography>
      </Box>

      {/* ── B. Macro Split Presets ─────────────────────────────────────────── */}
      <Box>
        <Typography sx={labelSx}>Fat, protein and carbs</Typography>

        {/* Preset chips */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          {Object.keys(KETO_PRESETS).map((key) => {
            const isSelected = preset === key;
            return (
              <Chip
                key={key}
                label={PRESET_LABELS[key]}
                variant="outlined"
                onClick={() => handlePresetChange(key)}
                // Chosen = basil at 8% with a basil edge, the app's one
                // selected look (B2); ink text either way.
                sx={
                  isSelected
                    ? {
                        bgcolor: alpha(theme.palette.primary.main, 0.08),
                        borderColor: theme.palette.primary.main,
                        color: 'text.primary',
                        '&&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.14) },
                      }
                    : undefined
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
                  bgcolor: macro.fat,
                  transition: 'width 200ms ease-out',
                }}
              />
              <Box
                sx={{
                  width: `${protein_pct}%`,
                  bgcolor: macro.protein,
                  transition: 'width 200ms ease-out',
                }}
              />
              <Box
                sx={{
                  width: `${carb_pct}%`,
                  bgcolor: macro.carbs,
                  transition: 'width 200ms ease-out',
                }}
              />
            </Box>

            {/* Bar legend */}
            <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
              {[
                { label: 'Fat', pct: fat_pct, color: macro.fat },
                { label: 'Protein', pct: protein_pct, color: macro.protein },
                { label: 'Carbs', pct: carb_pct, color: macro.carbs },
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
                  fontFamily: 'inherit',
                  color: 'text.secondary',
                  display: 'block',
                }}
              >
                Protein {gramEquivalents.protein_g}g · Carbs {gramEquivalents.carbs_g}g · Fat {gramEquivalents.fat_g}g
              </Typography>
            )}
            {preview && <ProteinBasisNote rules={preview.rules} />}
          </>
        ) : (
          <Typography variant="caption" color="text.secondary">
            Track only the carb cap, with no split
          </Typography>
        )}
      </Box>

      {/* ── C. Net vs Total Carbs Toggle ───────────────────────────────────── */}
      <Box>
        <Typography sx={labelSx}>How to count carbs</Typography>

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
              fontFamily: 'inherit',
              fontSize: '0.8125rem',
              textTransform: 'none',
              px: 2,
            }}
          >
            Net carbs (carbs minus fiber)
          </ToggleButton>
          <ToggleButton
            value="total"
            sx={{
              fontFamily: 'inherit',
              fontSize: '0.8125rem',
              textTransform: 'none',
              px: 2,
            }}
          >
            Total carbs
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
