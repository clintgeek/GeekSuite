import React from 'react';
import { Box } from '@mui/material';

/**
 * A unit at the end of a number field ("lb", "mmHg", "bpm"), and the label
 * fix that goes with it.
 *
 * The unit was always centred on the typed number. What sat low was the
 * field's resting label: the suite's fields are 47px tall (12px padding),
 * while MUI parks an outlined label 16px down, the right place in its own
 * 56px field. So in an empty field the words rested about 5px under the unit
 * and the unit looked as if it floated (review, round three). `unitFieldSx`
 * rests the label on the field's middle line; the floated (shrunk) label is
 * untouched.
 *
 * If the theme ever centres every field's label itself, delete `unitFieldSx`.
 */
export const unitFieldSx = {
  '& .MuiInputLabel-outlined:not(.MuiInputLabel-shrink)': {
    // (field height - the label's own line) / 2, less MUI's half pixel.
    transform: 'translate(14px, 11.5px) scale(1)',
    // Phones: a 16px input under an 18px label.
    '@media (max-width:599.95px)': { transform: 'translate(14px, 10.5px) scale(1)' },
  },
};

/** The unit itself: one size and one quiet ink everywhere, on the centre line. */
export function FieldUnit({ children }) {
  return (
    <Box
      component="span"
      data-testid="field-unit"
      sx={{
        ml: 2,
        flexShrink: 0,
        alignSelf: 'center',
        fontSize: '0.875rem',
        lineHeight: 1,
        color: 'text.secondary',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
}

export default FieldUnit;
