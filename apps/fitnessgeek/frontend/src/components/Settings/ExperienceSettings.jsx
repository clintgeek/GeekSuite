import React from 'react';
import { Box, Switch, Typography } from '@mui/material';
import { useToast } from '@geeksuite/ui';
import { LabelPanel } from '../primitives';
import SaveNote, { useSaveNote } from './SaveNote.jsx';
import { useExperience } from '../../contexts/ExperienceContext.jsx';

/**
 * "How it looks" — Larger text, and (as `children`) the theme.
 *
 * There is one app now (DOCS/ONE_APP_PLAN.md), so there is nothing here to
 * choose between. Larger text saves the moment it is switched, as a partial
 * write of just that key (CONTEXT.md, "Settings writes are PARTIAL"), like
 * everything else on the Settings page, and says "Saved" under the switch. A
 * save that fails puts the switch back AND says so under it: a switch that
 * only flicks back reads as a mis-tap.
 */
const COULDNT = 'Couldn’t save that. Try again.';

export default function ExperienceSettings({ children, id }) {
  const { notify } = useToast();
  const { largerText, setLargerText } = useExperience();
  const note = useSaveNote();

  const toggleLarger = async (on) => {
    note.clear('larger');
    let result;
    try { result = await setLargerText(on); } catch { result = { ok: false }; }
    if (result?.ok) {
      note.saved('larger');
      return;
    }
    note.failed('larger', COULDNT);
    notify(COULDNT, { tone: 'error' });
  };

  return (
    <LabelPanel title="How it looks" titleComponent="h2" data-testid="experience-settings" id={id}>
      <Box
        component="label"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, minHeight: 56, cursor: 'pointer' }}
      >
        <Box>
          <Typography sx={{ fontWeight: 600 }}>Larger text</Typography>
          <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary' }}>Makes every word in the app bigger.</Typography>
        </Box>
        <Switch
          checked={largerText}
          onChange={(e) => toggleLarger(e.target.checked)}
          inputProps={{ 'aria-label': 'Larger text', 'data-testid': 'larger-text-switch' }}
        />
      </Box>
      <SaveNote note={note} for="larger" sx={{ mt: 0 }} />
      {children}
    </LabelPanel>
  );
}
