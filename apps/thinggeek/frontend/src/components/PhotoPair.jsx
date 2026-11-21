/**
 * "Take a photo / Choose a file", one design everywhere (2026-11-18 review:
 * Add, a thing's Add photo sheet and the Attic each had their own): the
 * camera is the yard-orange button (on a phone it is the usual way in), the
 * file picker the outlined one beside it. Without `onCamera` (a document),
 * Choose a file takes the orange.
 */
import React from 'react';
import { Box, Button } from '@mui/material';
import { FolderOpenOutlined as FileIcon, PhotoCameraOutlined as CameraIcon } from '@mui/icons-material';
import { HERO_BUTTON_SX } from './saveBar';

const HERO_SX = { minHeight: 48, ...HERO_BUTTON_SX };
const PLAIN_SX = { minHeight: 48, fontWeight: 700, color: 'text.primary', borderColor: 'text.secondary' };

export default function PhotoPair({ onCamera, onFile, fileLabel = 'Choose a file', sx }) {
  return (
    <Box data-testid="photo-pair" sx={{ display: 'grid', gridTemplateColumns: onCamera ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 1, ...sx }}>
      {onCamera ? (
        <Button variant="contained" color="hero" disableElevation startIcon={<CameraIcon />} onClick={onCamera} data-testid="photo-pair-camera" sx={HERO_SX}>
          Take a photo
        </Button>
      ) : null}
      <Button
        variant={onCamera ? 'outlined' : 'contained'}
        color={onCamera ? 'inherit' : 'hero'}
        disableElevation
        startIcon={<FileIcon />}
        onClick={onFile}
        data-testid="photo-pair-file"
        sx={onCamera ? PLAIN_SX : HERO_SX}
      >
        {fileLabel}
      </Button>
    </Box>
  );
}
