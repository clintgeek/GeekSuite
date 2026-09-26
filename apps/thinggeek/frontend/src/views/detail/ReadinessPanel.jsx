/**
 * "Claim-ready": the five things an insurer asks for — a photo, the ID
 * plate, the receipt, the serial, a value — as a meter, and every gap as a
 * one-tap fix: the ID-plate fix opens the camera with the role already set,
 * the serial fix opens the editor at the identifier fields.
 *
 * The gaps are the server's (`thing.missing`). "ID plate" and "Serial" only
 * count for a type with identifier fields — a keyboard has no serial to
 * miss (the gateway's missingOf rule).
 */
import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import {
  AddAPhotoOutlined as PhotoIcon,
  AttachMoney as ValueIcon,
  CheckCircle as DoneIcon,
  NumbersOutlined as SerialIcon,
  QrCode2Outlined as PlateIcon,
  ReceiptLongOutlined as ReceiptIcon,
} from '@mui/icons-material';
import { PRESENT_LABELS } from '../../utils/vocab';
import { MISSING_VALUES } from '../../utils/libraryFilter';

export const FIXES = {
  photo: { label: 'Add a photo', hint: 'The whole thing, in good light.', icon: PhotoIcon },
  'id-plate': { label: 'Add an ID-plate photo', hint: 'The plate or sticker with the model and serial.', icon: PlateIcon },
  receipt: { label: 'Add a receipt', hint: 'A photo or PDF of what you paid.', icon: ReceiptIcon },
  serial: { label: 'Record the serial', hint: 'Masked on screen, never sent to AI.', icon: SerialIcon },
  value: { label: 'Add a value', hint: 'What it would cost to replace today.', icon: ValueIcon },
};

export function applicableKeys(thing) {
  const hasIdentifiers = (thing.fields ?? []).some((f) => f.identifier);
  return MISSING_VALUES.filter((k) => (k !== 'serial' && k !== 'id-plate') || hasIdentifiers);
}

export default function ReadinessPanel({ thing, onFix }) {
  const keys = applicableKeys(thing);
  const missing = new Set((thing.missing ?? []).filter((k) => keys.includes(k)));
  const onFile = keys.filter((k) => !missing.has(k));
  const ready = missing.size === 0;

  return (
    <Box
      component="section"
      aria-labelledby="readiness-heading"
      data-testid="readiness"
      sx={{
        border: 1,
        borderColor: ready ? 'divider' : 'border',
        borderRadius: 3,
        bgcolor: 'background.card',
        p: 2,
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 1 }}>
        <Typography id="readiness-heading" component="h3" sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>
          Claim readiness
        </Typography>
        <Typography component="span" sx={{ fontSize: '0.8125rem', fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
          {onFile.length} of {keys.length} on file
        </Typography>
      </Box>

      <Box aria-hidden="true" sx={{ display: 'grid', gridTemplateColumns: `repeat(${keys.length}, 1fr)`, gap: 0.5, mb: 1.25 }}>
        {keys.map((k) => (
          <Box key={k} sx={{ height: 6, borderRadius: 3, bgcolor: missing.has(k) ? 'divider' : 'primary.main' }} />
        ))}
      </Box>

      <Box component="ul" aria-label="On file" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 1.25, mb: ready ? 0 : 1.25 }}>
        {onFile.map((k) => (
          <Box component="li" key={k} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.8125rem', color: 'text.secondary' }}>
            <DoneIcon aria-hidden="true" sx={{ fontSize: 16, color: 'primary.main' }} />
            {PRESENT_LABELS[k]}
          </Box>
        ))}
      </Box>

      {ready ? (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.primary', mt: 1 }}>Everything an insurer asks for is on file.</Typography>
      ) : (
        <Box component="ul" aria-label="Missing" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.75 }}>
          {keys
            .filter((k) => missing.has(k))
            .map((k) => {
              const fix = FIXES[k];
              const Icon = fix.icon;
              return (
                <Box component="li" key={k}>
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={() => onFix(k)}
                    data-testid={`fix-${k}`}
                    startIcon={<Icon sx={{ color: 'primary.main' }} />}
                    sx={{ justifyContent: 'flex-start', textAlign: 'left', py: 1, color: 'text.primary', borderColor: 'border', borderStyle: 'dashed' }}
                  >
                    <Box component="span" sx={{ display: 'block', minWidth: 0 }}>
                      <Box component="span" sx={{ display: 'block', fontWeight: 700, fontSize: '0.875rem' }}>
                        {fix.label}
                      </Box>
                      <Box component="span" sx={{ display: 'block', fontWeight: 400, fontSize: '0.75rem', color: 'text.secondary' }}>
                        {fix.hint}
                      </Box>
                    </Box>
                  </Button>
                </Box>
              );
            })}
        </Box>
      )}
    </Box>
  );
}
