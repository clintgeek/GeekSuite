import React from 'react';
import { Alert, Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Tag } from '../primitives';
import { bpGuidance, categorizeBP } from '../../utils/bpUtils.js';
import { bpStageWords } from '../../utils/plainWords.js';

/**
 * What the reading being typed is, as soon as both numbers are in: the
 * category in plain words on a tag of its tone, and one calm line about what
 * to do with it (round-two review: "High (stage 1)" stood alone in red, with
 * no advice). A crisis-range reading gets a clear, serious line instead.
 *
 * The category is the one shared categoriser's (`categorizeBP`): the same
 * bands, in the same order, as the saved row will get everywhere else.
 */
const BPReadingStatus = ({ systolic, diastolic }) => {
  const theme = useTheme();
  if (!systolic || !diastolic) return null;
  const sys = parseInt(systolic, 10);
  const dia = parseInt(diastolic, 10);
  if (Number.isNaN(sys) || Number.isNaN(dia)) return null;

  const category = categorizeBP(sys, dia, theme.palette.mode);
  const guidance = bpGuidance(category.stage);

  return (
    <Box data-testid="bp-reading-status">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="body2">This reading is</Typography>
        <Tag fill={category.color}>{bpStageWords(category.stage).label}</Tag>
      </Box>
      {guidance && (guidance.serious ? (
        <Alert severity="error" role="alert" data-testid="bp-reading-guidance" sx={{ mt: 3 }}>
          {guidance.text}
        </Alert>
      ) : (
        <Typography data-testid="bp-reading-guidance" sx={{ color: 'text.secondary', fontSize: '0.875rem', lineHeight: 1.5, mt: 1 }}>
          {guidance.text}
        </Typography>
      ))}
    </Box>
  );
};

export default BPReadingStatus;
