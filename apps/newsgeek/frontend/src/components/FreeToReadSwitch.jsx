/**
 * "Free to read": the reader's easy button. On → stories that need a
 * subscription (metered or hard paywall) are left out of the list; off (the
 * default) → everything. Set in small capitals like the section flags; the
 * whole label is the 44px target, and the switch's accessible name is the
 * visible label.
 */
import React from 'react';
import { FormControlLabel, Switch } from '@mui/material';
import { flagSx } from '../theme/theme';

export default function FreeToReadSwitch({ checked, onChange, disabled = false }) {
  return (
    <FormControlLabel
      data-testid="free-to-read"
      labelPlacement="start"
      disabled={disabled}
      control={
        <Switch
          checked={Boolean(checked)}
          onChange={(e) => onChange?.(e.target.checked)}
          color="primary"
          inputProps={{ role: 'switch' }}
        />
      }
      label="Free to read"
      sx={{
        m: 0,
        minHeight: 44,
        gap: 1,
        '& .MuiFormControlLabel-label': { ...flagSx, fontSize: '0.8125rem', color: 'text.primary' },
        '& .MuiFormControlLabel-label.Mui-disabled': { color: 'text.secondary' },
        // MUI's default unchecked thumb is near-white: invisible on newsprint.
        // Ink thumbs in both states (inkSoft off, ink on) against the page;
        // position, not colour, says which. Measured in gazetteContrast.
        '& .MuiSwitch-thumb': { bgcolor: 'text.secondary', boxShadow: 'none' },
        '& .MuiSwitch-track': { bgcolor: 'text.secondary', opacity: 0.25 },
        '& .Mui-checked .MuiSwitch-thumb': { bgcolor: 'text.primary' },
        '& .Mui-checked + .MuiSwitch-track': { bgcolor: 'text.primary', opacity: 0.5 },
        '& .Mui-focusVisible .MuiSwitch-thumb': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: 2 },
      }}
    />
  );
}
