/**
 * `/labels` — printable QR box labels (DOCS/THINGGEEK_PLAN.md; approved
 * 2026-09-29). With no `?ids=`, a simple selector; with `?ids=<id>,<id>,...`,
 * a preview and Print. See views/labels/ for the pieces.
 */
import React from 'react';
import { Box } from '@mui/material';
import { useLocation } from 'react-router-dom';
import LabelSelector from './labels/LabelSelector';
import LabelPreview from './labels/LabelPreview';
import { parseLabelIds } from '../utils/labelUrl';

export default function LabelsView() {
  const location = useLocation();
  const ids = parseLabelIds(location.search);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, md: 3 } }}>
      {ids.length ? <LabelPreview ids={ids} /> : <LabelSelector />}
    </Box>
  );
}
