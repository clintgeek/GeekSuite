/**
 * One type attribute as a form control, by its field kind:
 *   text · number (with unit) · date · choice · money · url · boolean
 * Identifier fields are typed in mono and say what happens to them (masked
 * on screen, never sent to AI). The form holds strings (and booleans);
 * utils/attributes.js turns them into wire values on save.
 */
import React from 'react';
import { Box, InputAdornment, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { LockOutlined as LockIcon } from '@mui/icons-material';
import { MONO_FONT } from '../../theme/theme';
import { chipGroupSx } from '../../theme/chipStyles';

export default function AttributeField({ field, value, onChange, error }) {
  const id = `attr-${field.key}`;
  const label = field.required ? `${field.label} *` : field.label;
  const common = {
    id,
    fullWidth: true,
    label,
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
    error: Boolean(error),
    helperText: error || undefined,
  };

  switch (field.kind) {
    case 'boolean':
      return (
        <Box>
          <Typography id={`${id}-label`} sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
            {label}
          </Typography>
          <ToggleButtonGroup
            exclusive
            value={value === true ? 'yes' : value === false ? 'no' : null}
            onChange={(_e, v) => onChange(v === 'yes' ? true : v === 'no' ? false : '')}
            aria-labelledby={`${id}-label`}
            sx={chipGroupSx}
          >
            <ToggleButton value="yes">Yes</ToggleButton>
            <ToggleButton value="no">No</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      );
    case 'choice':
      return (
        <TextField {...common} select>
          <MenuItem value="">
            <em>Not set</em>
          </MenuItem>
          {(field.choices ?? []).map((c) => (
            <MenuItem key={c} value={c}>
              {c}
            </MenuItem>
          ))}
          {value && !(field.choices ?? []).includes(value) ? <MenuItem value={value}>{value}</MenuItem> : null}
        </TextField>
      );
    case 'date':
      return <TextField {...common} type="date" InputLabelProps={{ shrink: true }} />;
    case 'number':
      return (
        <TextField
          {...common}
          inputProps={{ inputMode: 'decimal' }}
          InputProps={field.unit ? { endAdornment: <InputAdornment position="end">{field.unit}</InputAdornment> } : undefined}
        />
      );
    case 'money':
      return (
        <TextField
          {...common}
          inputProps={{ inputMode: 'decimal' }}
          InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
        />
      );
    case 'url':
      return <TextField {...common} type="url" placeholder="https://" />;
    default:
      if (field.identifier) {
        return (
          <TextField
            {...common}
            autoComplete="off"
            inputProps={{ spellCheck: false, autoCapitalize: 'characters', 'data-identifier': 'true' }}
            InputProps={{
              sx: { fontFamily: MONO_FONT, letterSpacing: '0.03em' },
              endAdornment: (
                <InputAdornment position="end">
                  <LockIcon aria-hidden="true" sx={{ fontSize: 18, color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
            helperText={error || 'Masked on screen and never sent to AI.'}
          />
        );
      }
      return (
        <TextField
          {...common}
          InputProps={field.unit ? { endAdornment: <InputAdornment position="end">{field.unit}</InputAdornment> } : undefined}
        />
      );
  }
}
