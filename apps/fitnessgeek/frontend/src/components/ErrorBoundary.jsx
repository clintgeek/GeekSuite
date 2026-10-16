import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import logger from '../utils/logger.js';

/**
 * The last line of defence (review 0.16). A bad data shape anywhere under
 * the router used to leave a white screen; now it is one plain sentence and
 * a Reload button, and the error goes to the app logger.
 *
 * `resetKey` (the route) clears it, so going somewhere else from the nav
 * gets a fresh try without a full reload.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error, info) {
    logger.error('Something went wrong on screen', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Box
        role="alert"
        data-testid="error-boundary"
        sx={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: 2,
          px: 2,
          py: 6,
          bgcolor: 'background.default',
          color: 'text.primary',
        }}
      >
        <Typography component="h1" sx={{ fontSize: '1.5rem', fontWeight: 800 }}>
          Something went wrong.
        </Typography>
        <Typography sx={{ fontSize: '1.0625rem', color: 'text.secondary', maxWidth: 360 }}>
          Nothing you saved is lost. Reloading usually fixes it.
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => window.location.reload()}
          sx={{ minWidth: 200, minHeight: 48, borderRadius: '999px', fontWeight: 800 }}
        >
          Reload
        </Button>
      </Box>
    );
  }
}
