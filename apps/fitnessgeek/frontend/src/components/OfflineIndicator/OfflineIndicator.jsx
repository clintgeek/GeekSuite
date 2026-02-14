import React from 'react';
import { Box, Chip, Snackbar, Alert } from '@mui/material';
import {
  CloudOff as OfflineIcon,
  CloudQueue as SyncIcon,
  Cloud as OnlineIcon
} from '@mui/icons-material';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';

const OfflineIndicator = () => {
  const { isOnline, hasPendingSync } = useOnlineStatus();
  const [showNotification, setShowNotification] = React.useState(false);

  React.useEffect(() => {
    if (!isOnline) {
      setShowNotification(true);
    }
  }, [isOnline]);

  if (isOnline && !hasPendingSync) {
    return null;
  }

  return (
    <>
      {/* Status chip */}
      {!isOnline && (
        <Chip
          icon={<OfflineIcon />}
          label="Offline Mode"
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
      )}

      {hasPendingSync && isOnline && (
        <Chip
          icon={<SyncIcon />}
          label="Syncing..."
          color="info"
          size="small"
          sx={{
            position: 'fixed',
            top: 70,
            right: 16,
            zIndex: 1300,
            boxShadow: 2
          }}
        />
      )}

      {/* Snackbar notification */}
      <Snackbar
        open={showNotification && !isOnline}
        autoHideDuration={6000}
        onClose={() => setShowNotification(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setShowNotification(false)}
          severity="warning"
          icon={<OfflineIcon />}
          sx={{ width: '100%' }}
        >
          You're offline. Data will be synced when you reconnect.
        </Alert>
      </Snackbar>
    </>
  );
};

export default OfflineIndicator;
