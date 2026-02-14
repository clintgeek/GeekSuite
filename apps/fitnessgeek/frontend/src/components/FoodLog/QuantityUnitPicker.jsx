import React from 'react';
import { Box, TextField, MenuItem } from '@mui/material';
import { MASS_UNITS, VOLUME_UNITS, toBase, fromBase, formatNumber } from '../../utils/units.js';

const QuantityUnitPicker = ({
  value = 1,
  unit = 'g',
  kind = 'mass',
  onChange,
  showEquivalents = true
}) => {
  const units = kind === 'volume' ? VOLUME_UNITS : MASS_UNITS;
  const base = toBase(value, unit, kind);

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      <TextField
        type="number"
        size="small"
        value={value}
        onChange={(e) => onChange?.({ value: e.target.value, unit, kind })}
        sx={{ width: 120 }}
      />
      <TextField
        select
        size="small"
        value={unit}
        onChange={(e) => onChange?.({ value, unit: e.target.value, kind })}
        sx={{ width: 120 }}
      >
        {Object.keys(units).map((u) => (
          <MenuItem key={u} value={u}>{units[u].label}</MenuItem>
        ))}
      </TextField>

      {showEquivalents && (
        <Box sx={{ color: '#666', fontSize: 12 }}>
          {Object.keys(units)
            .filter((u) => u !== unit)
            .map((u) => `${formatNumber(fromBase(base, u, kind))} ${units[u].label}`)
            .join(' ≈ ')}
        </Box>
      )}
    </Box>
  );
};

export default QuantityUnitPicker;


