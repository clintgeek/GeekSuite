import React from 'react';
import { Alert, Box, Button } from '@mui/material';

/**
 * The error under a blood-pressure form.
 *
 * A duplicate instant (contract C1, `BP_DUPLICATE`) is the one failure with an
 * obvious fix — the person took two readings back to back — so it carries a
 * one-tap "Save it one minute later" instead of a dead end. Everything else is
 * plain words from `errorMessage()`, chosen by the caller.
 */
const BPSaveError = ({ error, duplicate = false, onSaveLater, busy = false, sx }) => {
  if (!error) return null;
  return (
    <Alert
      severity="error"
      role="alert"
      sx={sx}
    >
      {error}
      {/* Under the sentence, not in Alert's `action` slot: on a phone the
          slot squeezes the message into a column one word wide. */}
      {duplicate && onSaveLater && (
        <Box sx={{ mt: 1 }}>
          <Button
            color="inherit"
            variant="outlined"
            onClick={onSaveLater}
            disabled={busy}
            sx={{ fontWeight: 700, minHeight: 44 }}
          >
            Save it one minute later
          </Button>
        </Box>
      )}
    </Alert>
  );
};

export default BPSaveError;
