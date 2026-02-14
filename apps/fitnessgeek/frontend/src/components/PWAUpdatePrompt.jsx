import React from 'react';
import { Snackbar, Alert, Button } from '@mui/material';
import { registerSW } from 'virtual:pwa-register';

const PWAUpdatePrompt = () => {
  const [showUpdate, setShowUpdate] = React.useState(false);
  const updateSWRef = React.useRef(null);
  const refreshTimeoutRef = React.useRef(null);

  React.useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setShowUpdate(true);
        refreshTimeoutRef.current = window.setTimeout(() => {
          updateSW(true);
        }, 15000);
      },
      onOfflineReady() {
        // no-op for now
      }
    });

    updateSWRef.current = updateSW;
  }, []);

  React.useEffect(() => () => {
    if (refreshTimeoutRef.current) {
      window.clearTimeout(refreshTimeoutRef.current);
    }
  }, []);

  const handleRefresh = () => {
    if (updateSWRef.current) {
      updateSWRef.current(true);
    }
  };

  return (
    <Snackbar
      open={showUpdate}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{ zIndex: 1400 }}
    >
      <Alert
        severity="info"
        sx={{ alignItems: 'center' }}
        action={(
          <Button color="inherit" size="small" onClick={handleRefresh}>
            Refresh
          </Button>
        )}
      >
        Update available. Refresh to get the latest version.
      </Alert>
    </Snackbar>
  );
};

export default PWAUpdatePrompt;
