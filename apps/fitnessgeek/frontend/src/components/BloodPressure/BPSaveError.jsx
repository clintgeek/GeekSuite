import React, { useEffect, useRef } from 'react';
import { Alert } from '@mui/material';
import { formatLocalTime, oneMinuteLater } from './bpTimeUtils.js';

/** What the form's own Save button reads while the duplicate note is showing. */
export const SAVE_SECOND_READING = 'Save as a second reading';

/**
 * The message under a blood-pressure form when a save did not go through.
 *
 * A DUPLICATE IS NOT AN ERROR (contract C1, `BP_DUPLICATE`). Two readings
 * cannot share the same minute, and the usual way to get there is honest: the
 * cuff's own instructions say to take two readings back to back, and the
 * second was given the first one's time. The note names both times, in the
 * calm tone: "You already have a reading at 7:18 AM. If this is a second one,
 * it will be saved as 7:19 AM."
 *
 * ONE ACTION (review, round three). The note used to carry its own button,
 * "Save as 7:19 AM", over the form's Save: two save buttons, and on a phone
 * the footer covered the lower one. The note is now words only; the form's
 * own button becomes "Save as a second reading" (`SAVE_SECOND_READING`) and
 * does what that button did. The note scrolls itself into view when it
 * appears, so it is read whole above the footer.
 *
 * Everything else is plain words from `errorMessage()`, chosen by the caller.
 *
 * @param {{ error?: string, duplicateAt?: string|null, sx?: object }} props
 *   `duplicateAt` is the `measured_at` that collided.
 */
const BPSaveError = ({ error, duplicateAt = null, sx }) => {
  const note = useRef(null);
  useEffect(() => {
    if (!duplicateAt) return;
    note.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [duplicateAt]);

  if (duplicateAt) {
    const at = formatLocalTime(duplicateAt);
    const later = formatLocalTime(oneMinuteLater(duplicateAt));
    return (
      <Alert ref={note} severity="info" role="alert" data-testid="bp-duplicate" sx={{ scrollMarginBottom: 16, ...sx }}>
        {at && later
          ? `You already have a reading at ${at}. If this is a second one, it will be saved as ${later}.`
          : 'You already have a reading at that time. If this is a second one, it will be saved a minute later.'}
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
