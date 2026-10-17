import React from 'react';
import { Chip, Snackbar, Alert } from '@mui/material';
import { CloudOff as OfflineIcon } from '@mui/icons-material';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';

/**
 * Says so when there's no signal, and says what that means. There is no
 * offline queue, so it never promises a sync (review B17).
 */
export const OFFLINE_BANNER = 'You’re offline. New entries won’t save until you’re back online.';

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
        icon={<OfflineIcon />}
        label="Offline"
        color="warning"
        size="small"
        sx={{
          position: 'fixed',
          top: 70,
          right: 16,
          zIndex: 1300,
          boxShadow: 2
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
