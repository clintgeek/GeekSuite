import React from 'react';
import { Alert, Box, Button } from '@mui/material';
import { formatLocalTime, oneMinuteLater } from './bpTimeUtils.js';

/**
 * The message under a blood-pressure form when a save did not go through.
 *
 * A DUPLICATE IS NOT AN ERROR (contract C1, `BP_DUPLICATE`). Two readings
 * cannot share the same minute, and the usual way to get there is honest: the
 * cuff's own instructions say to take two readings back to back, and the
 * second was given the first one's time. This used to be a red alert reading
 * "You already saved a reading at that time." with a button "Save it one
 * minute later", which left a person wondering what the minute was for
 * (round-two review). It now names both times and says what the button does:
 * "You already have a reading at 7:18 AM. If this is a second one, save it as
 * 7:19 AM." in the calm tone, with "Save as 7:19 AM".
 *
 * Everything else is plain words from `errorMessage()`, chosen by the caller.
 *
 * @param {{ error?: string, duplicateAt?: string|null, onSaveLater?: () => void, busy?: boolean, sx?: object }} props
 *   `duplicateAt` is the `measured_at` that collided.
 */
const BPSaveError = ({ error, duplicateAt = null, onSaveLater, busy = false, sx }) => {
  if (duplicateAt) {
    const at = formatLocalTime(duplicateAt);
    const later = formatLocalTime(oneMinuteLater(duplicateAt));
    return (
      <Alert severity="info" role="alert" data-testid="bp-duplicate" sx={sx}>
        {at && later
          ? `You already have a reading at ${at}. If this is a second one, save it as ${later}.`
          : 'You already have a reading at that time. If this is a second one, save it a minute later.'}
        {/* Under the sentence, not in Alert's `action` slot: on a phone the
            slot squeezes the message into a column one word wide. */}
        {onSaveLater && (
          <Box sx={{ mt: 2 }}>
            <Button variant="tonal" onClick={onSaveLater} disabled={busy} sx={{ minHeight: 44 }}>
              {at && later ? `Save as ${later}` : 'Save it a minute later'}
            </Button>
          </Box>
        )}
      </Alert>
    );
  }
  if (!error) return null;
  return (
    <Alert severity="error" role="alert" sx={sx}>
      {error}
    </Alert>
  );
};

export default BPSaveError;
