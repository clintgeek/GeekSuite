/**
 * A labelled on/off in the Gazette's ink (INK_SWITCH_SX). The whole label is
 * the 44px target; `ariaLabel` names the switch when the visible label is
 * terse ("On" next to a source's name) and a screen reader needs the noun.
 */
import React from 'react';
import { FormControlLabel, Switch } from '@mui/material';
import { flagSx } from '../theme/theme';
import { INK_SWITCH_SX } from './inkSwitchSx';

export default function InkSwitch({ checked, onChange, label, ariaLabel, disabled = false, labelPlacement = 'start', sx, labelSx, ...rest }) {
  return (
    <FormControlLabel
      labelPlacement={labelPlacement}
      disabled={disabled}
      control={
        <Switch
          checked={Boolean(checked)}
          onChange={(e) => onChange?.(e.target.checked)}
          color="primary"
          inputProps={{ role: 'switch', ...(ariaLabel ? { 'aria-label': ariaLabel } : null) }}
        />
      }
      label={label}
      sx={{
        m: 0,
        minHeight: 44,
        gap: 1,
        '& .MuiFormControlLabel-label': { ...flagSx, fontSize: '0.75rem', color: 'text.primary', whiteSpace: 'nowrap', ...labelSx },
        '& .MuiFormControlLabel-label.Mui-disabled': { color: 'text.secondary' },
        ...INK_SWITCH_SX,
        ...sx,
      }}
      {...rest}
    />
  );
}
