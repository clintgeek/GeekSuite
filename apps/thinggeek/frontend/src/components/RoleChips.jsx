/** One-of chips for a photo or document role. */
import React from 'react';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { chipGroupSx } from '../theme/chipStyles';

export default function RoleChips({ roles, value, onChange, label, labelFor }) {
  return (
    <ToggleButtonGroup exclusive value={value} onChange={(_e, v) => v && onChange(v)} aria-label={label} sx={chipGroupSx}>
      {roles.map((r) => (
        <ToggleButton key={r} value={r}>
          {labelFor(r)}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
