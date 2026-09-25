/**
 * Rows of copies — platform, format, storefront — with add/remove. Shared by
 * the add form and the detail sheet's copies editor.
 */
import React from 'react';
import { Box, Button, FormControl, IconButton, InputLabel, MenuItem, Select } from '@mui/material';
import { Add as AddIcon, DeleteOutline as DeleteIcon } from '@mui/icons-material';
import { defaultStorefrontFor, formatLabel, platformLabel, storefrontLabel } from '../utils/vocab';

function SelectField({ id, label, value, onChange, options, render, emptyLabel }) {
  return (
    <FormControl fullWidth>
      <InputLabel id={id}>{label}</InputLabel>
      <Select labelId={id} label={label} value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {emptyLabel ? <MenuItem value=""><em>{emptyLabel}</em></MenuItem> : null}
        {options.map((o) => <MenuItem key={o} value={o}>{render(o)}</MenuItem>)}
      </Select>
    </FormControl>
  );
}

export default function CopyRowsEditor({ rows, onChange, vocab, defaultPlatform, idPrefix = 'copy' }) {
  const update = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => {
    const platform = defaultPlatform || 'pc';
    onChange([...rows, { platform, format: 'digital', storefront: defaultStorefrontFor(platform) }]);
  };
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {rows.map((r, i) => (
        <Box
          key={r.id || `new-${i}`}
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0,1fr) minmax(0,1fr) 44px', sm: 'minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.3fr) 44px' },
            gridTemplateAreas: { xs: '"plat plat del" "fmt store store"', sm: '"plat fmt store del"' },
            gap: 1,
            alignItems: 'center',
            p: 1.25,
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
          }}
        >
          <Box sx={{ gridArea: 'plat', minWidth: 0 }}>
            <SelectField
              id={`${idPrefix}-platform-${i}`}
              label="Platform"
              value={r.platform}
              onChange={(platform) => update(i, { platform, storefront: r.storefront || defaultStorefrontFor(platform) })}
              options={vocab.platforms}
              render={platformLabel}
            />
          </Box>
          <Box sx={{ gridArea: 'fmt', minWidth: 0 }}>
            <SelectField id={`${idPrefix}-format-${i}`} label="Format" value={r.format} onChange={(format) => update(i, { format })} options={vocab.copyFormats} render={formatLabel} emptyLabel="Not recorded" />
          </Box>
          <Box sx={{ gridArea: 'store', minWidth: 0 }}>
            <SelectField id={`${idPrefix}-store-${i}`} label="Storefront" value={r.storefront} onChange={(storefront) => update(i, { storefront })} options={vocab.storefronts} render={storefrontLabel} emptyLabel="Not recorded" />
          </Box>
          <Box sx={{ gridArea: 'del', justifySelf: 'end' }}>
            <IconButton onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove the ${platformLabel(r.platform) || 'new'} copy`} sx={{ color: 'text.secondary' }}>
              <DeleteIcon />
            </IconButton>
          </Box>
        </Box>
      ))}
      <Button startIcon={<AddIcon />} onClick={add} variant="outlined" sx={{ alignSelf: 'flex-start', color: 'text.primary' }}>
        {rows.length ? 'Add another copy' : 'Add a copy'}
      </Button>
    </Box>
  );
}
