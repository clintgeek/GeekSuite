import React from 'react';
import { Box, Switch, Typography } from '@mui/material';
import { useToast } from '@geeksuite/ui';
import { LabelPanel } from '../primitives';
import { useExperience } from '../../contexts/ExperienceContext.jsx';

/**
 * "How it looks" — Larger text, and (as `children`) the theme.
 *
 * There is one app now (DOCS/ONE_APP_PLAN.md), so there is nothing here to
 * choose between. Larger text saves the moment it is switched, as a partial
 * write of just that key (CONTEXT.md, "Settings writes are PARTIAL"), like
 * everything else on the Settings page.
 */
export default function ExperienceSettings({ children, id }) {
  const { notify } = useToast();
  const { largerText, setLargerText } = useExperience();

  const toggleLarger = async (on) => {
    const result = await setLargerText(on);
    notify(result.ok ? 'Saved' : 'Couldn’t save that. Try again.', result.ok ? { tone: 'success', duration: 2000 } : { tone: 'error' });
  };

  return (
    <LabelPanel title="How it looks" titleComponent="h2" data-testid="experience-settings" id={id}>
      <Box
        component="label"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, minHeight: 56, cursor: 'pointer' }}
      >
        <Box>
          <Typography sx={{ fontSize: '1.125rem', fontWeight: 700 }}>Larger text</Typography>
          <Typography sx={{ fontSize: '1rem', color: 'text.secondary' }}>Makes every word in the app bigger.</Typography>
        </Box>
        <Switch
          checked={largerText}
          onChange={(e) => toggleLarger(e.target.checked)}
          inputProps={{ 'aria-label': 'Larger text', 'data-testid': 'larger-text-switch' }}
        />
      </Box>
      {children}
    </LabelPanel>
  );
}
