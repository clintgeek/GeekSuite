import React from 'react';
import { Chip } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';

/**
 * KetoStatusChip
 *
 * Displays the user's current net-carb status as a compact pill.
 *
 * Props:
 *   netCarbsConsumed  — grams consumed so far today (number, default 0)
 *   limitG            — daily net-carb cap in grams (number, default 20)
 */
const KetoStatusChip = ({ netCarbsConsumed = 0, limitG = 20 }) => {
  const pct = limitG > 0 ? netCarbsConsumed / limitG : 0;

  let label;
  let color;
  let variant;
  let icon;

  if (pct >= 1) {
    label = 'Over limit';
    color = 'error';
    variant = 'filled';
    icon = undefined;
  } else if (pct >= 0.7) {
    label = 'Approaching cap';
    color = 'warning';
    variant = 'filled';
    icon = undefined;
  } else {
    label = 'In range';
    color = 'success';
    variant = 'outlined';
    icon = <CheckIcon fontSize="inherit" />;
  }

  return (
    <Chip
      size="small"
      label={label}
      color={color}
      variant={variant}
      icon={icon}
    />
  );
};

export default KetoStatusChip;
