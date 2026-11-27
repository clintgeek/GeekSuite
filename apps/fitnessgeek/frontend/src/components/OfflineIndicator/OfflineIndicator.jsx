import React from 'react';
import { Chip, Snackbar, Alert } from '@mui/material';
import { CloudOff as OfflineIcon } from '@mui/icons-material';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';

/**
 * Says so when there's no signal, and says what that means. There is no
 * offline queue, so it never promises a sync (review B17).
 *
 * "Changes", not "new entries": an edit, a removal and a ticked dose fail
 * offline just the same. The banner closes after a few seconds, so the chip
 * that stays says it too; "Offline" alone left the consequence to be guessed.
 */
export const OFFLINE_BANNER = 'You’re offline. Changes can’t be saved until you’re back online.';
export const OFFLINE_CHIP = 'Offline. Changes won’t save';

const OfflineIndicator = () => {
  const { isOnline } = useOnlineStatus();
  const [showNotification, setShowNotification] = React.useState(false);

  React.useEffect(() => {
    setShowNotification(!isOnline);
  }, [isOnline]);

  if (isOnline) return null;

  return (
    <>
      <Chip
        role="status"
        data-testid="offline-chip"
        icon={<OfflineIcon />}
        label={OFFLINE_CHIP}
        color="warning"
        size="small"
        sx={{
          position: 'fixed',
          top: 70,
          right: 16,
          zIndex: 1300,
          boxShadow: '0 8px 24px rgba(16, 24, 40, 0.12)',
          border: (t) => `1px solid ${t.palette.divider}`,
          borderRadius: 999,
          fontWeight: 700,
        }}
      />

      <Snackbar
        open={showNotification}
        autoHideDuration={8000}
        onClose={() => setShowNotification(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setShowNotification(false)}
          severity="warning"
          icon={<OfflineIcon />}
          sx={{ width: '100%' }}
        >
          {OFFLINE_BANNER}
        </Alert>
      </Snackbar>
    </>
  );
};

export default OfflineIndicator;
