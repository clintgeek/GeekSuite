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
import { INK_SWITCH_SX } from './inkSwitchSx';

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
        ...INK_SWITCH_SX,
      }}
    />
  );
}
