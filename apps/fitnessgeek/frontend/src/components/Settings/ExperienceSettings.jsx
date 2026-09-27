import React from 'react';
import { Box, ButtonBase, Switch, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Check as CheckIcon } from '@mui/icons-material';
import { useToast } from '@geeksuite/ui';
import { Surface } from '../primitives';
import { useExperience } from '../../contexts/ExperienceContext.jsx';

/**
 * "How FitnessGeek looks" — Simple or Full, and Larger text
 * (DOCS/SIMPLE_AND_FULL_PLAN.md items 5 and the per-person setting).
 *
 * Each choice saves the moment it is made, as a partial write of just that
 * key (CONTEXT.md, "Settings writes are PARTIAL"); the rest of the Settings
 * page keeps its Save button. Until someone chooses, the app shows the mode
 * their history suggests, and this says so.
 */
const MODES = [
  { id: 'simple', title: 'Simple', body: 'Today, your meals, and the check-ins. Big buttons, nothing to set up.' },
  { id: 'full', title: 'Full', body: 'Everything: macros, reports, body scans, Garmin and more.' },
];

export default function ExperienceSettings() {
  const theme = useTheme();
  const { notify } = useToast();
  const { effectiveMode, savedMode, largerText, setMode, setLargerText } = useExperience();

  const choose = async (mode) => {
    if (mode === savedMode) return;
    const result = await setMode(mode);
    notify(result.ok ? `Switched to ${mode === 'simple' ? 'Simple' : 'Full'}` : "Couldn't save that. Try again.", { tone: result.ok ? 'success' : 'error' });
  };

  const toggleLarger = async (on) => {
    const result = await setLargerText(on);
    if (!result.ok) notify("Couldn't save that. Try again.", { tone: 'error' });
  };

  return (
    <Surface sx={{ mb: 2, borderRadius: '24px' }} data-testid="experience-settings">
      <Typography component="h2" sx={{ fontSize: '1.375rem', fontWeight: 800, mb: 0.5 }}>
        How FitnessGeek looks
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: '1rem', mb: 2 }}>
        {savedMode ? 'Saved as soon as you choose.' : `You haven't chosen yet, so you're seeing ${effectiveMode === 'simple' ? 'Simple' : 'Full'}. Saved as soon as you choose.`}
      </Typography>

      <Box role="radiogroup" aria-label="Simple or Full" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25, mb: 2.5 }}>
        {MODES.map((m) => {
          const on = effectiveMode === m.id;
          return (
            <ButtonBase
              key={m.id}
              role="radio"
              aria-checked={on}
              onClick={() => choose(m.id)}
              data-testid={`mode-${m.id}`}
              sx={{
                justifyContent: 'flex-start',
                alignItems: 'flex-start',
                textAlign: 'left',
                gap: 1.5,
                p: 2,
                minHeight: 88,
                borderRadius: '20px',
                border: `2px solid ${on ? theme.palette.primary.main : theme.palette.divider}`,
                bgcolor: on ? theme.palette.produce?.lunch?.tint : 'background.paper',
                '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
              }}
            >
              <Box
                aria-hidden
                sx={{
                  mt: 0.25, width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                  bgcolor: on ? 'primary.main' : 'transparent',
                  color: 'primary.contrastText',
                  border: on ? 'none' : `2px solid ${theme.palette.text.secondary}`,
                }}
              >
                {on && <CheckIcon sx={{ fontSize: 20 }} />}
              </Box>
              <Box>
                <Typography sx={{ fontSize: '1.1875rem', fontWeight: 800, color: 'text.primary' }}>{m.title}</Typography>
                <Typography sx={{ fontSize: '1rem', color: 'text.secondary', lineHeight: 1.4 }}>{m.body}</Typography>
              </Box>
            </ButtonBase>
          );
        })}
      </Box>

      <Box
        component="label"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, minHeight: 56, cursor: 'pointer' }}
      >
        <Box>
          <Typography sx={{ fontSize: '1.125rem', fontWeight: 800 }}>Larger text</Typography>
          <Typography sx={{ fontSize: '1rem', color: 'text.secondary' }}>Makes every word in the app bigger.</Typography>
        </Box>
        <Switch
          checked={largerText}
          onChange={(e) => toggleLarger(e.target.checked)}
          inputProps={{ 'aria-label': 'Larger text', 'data-testid': 'larger-text-switch' }}
        />
      </Box>
    </Surface>
  );
}
