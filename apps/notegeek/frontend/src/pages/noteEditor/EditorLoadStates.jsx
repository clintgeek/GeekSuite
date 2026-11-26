import React from 'react';
import { Box, CircularProgress, Typography, Button } from '@mui/material';
// Deep-import (see MarkdownEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import BackIcon from '@mui/icons-material/ArrowBack';

/** Shown until the form is seeded from a fresh copy of the note. */
export function NoteLoading() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        p: 4,
        minHeight: 300,
        gap: 2,
      }}
    >
      <CircularProgress size={32} thickness={4} />
      <Typography variant="body2" color="text.secondary">
        Loading note...
      </Typography>
    </Box>
  );
}

/** Shown when the note failed to load and there is nothing cached to show. */
export function NoteLoadError({ message, onBack }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        p: 4,
        minHeight: 300,
        gap: 3,
        textAlign: 'center',
      }}
    >
      <Typography
        sx={{
          fontFamily: 'inherit',
          fontSize: '1.25rem',
          fontWeight: 600,
          color: 'error.main',
        }}
      >
        Couldn't load this note
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 300 }}>
        {message}
      </Typography>
      <Button
        variant="contained"
        startIcon={<BackIcon />}
        onClick={onBack}
        sx={{ borderRadius: 2, fontWeight: 600 }}
      >
        Back to Notes
      </Button>
    </Box>
  );
}
