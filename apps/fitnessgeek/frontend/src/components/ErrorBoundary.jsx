import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import logger from '../utils/logger.js';

/**
 * The last line of defence (review 0.16). A bad data shape anywhere under
 * the router used to leave a white screen; now it is one plain sentence and
 * a way on, and the error goes to the app logger.
 *
 * Three ways on, least drastic first:
 *  - "Try again" draws the same screen again. Most render errors come from
 *    one bad answer, and the next read is fine; a reload throws away
 *    whatever else was open for nothing.
 *  - "Go to Today" leaves a screen that keeps failing, with a full load so
 *    nothing from the broken one comes along.
 *  - "Reload" is the old button, still there.
 *
 * A screen whose code could not be fetched (a new version went out while
 * this one was open) cannot be drawn again from here: React keeps the failed
 * import. For that, "Try again" IS a reload.
 *
 * `resetKey` (the route) clears it, so going somewhere else from the nav
 * gets a fresh try without a full reload.
 */
const TODAY_PATH = '/dashboard';
const CHUNK_ERROR = /Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically|Unable to preload CSS/i;

export const isChunkLoadError = (error) =>
  error?.name === 'ChunkLoadError' || CHUNK_ERROR.test(String(error?.message || ''));

const onToday = () => {
  try {
    return window.location.pathname === TODAY_PATH;
  } catch {
    return false;
  }
};

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

  retry = () => {
    if (isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  goToToday = () => {
    window.location.assign(TODAY_PATH);
  };

  render() {
    if (!this.state.error) return this.props.children;
    const button = { minWidth: 200, minHeight: 48, fontWeight: 700, textTransform: 'none' };
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
          gap: 3,
          px: 4,
          py: 6,
          bgcolor: 'background.default',
          color: 'text.primary',
        }}
      >
        <Typography component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
          Something went wrong.
        </Typography>
        <Typography sx={{ fontSize: '1.0625rem', color: 'text.secondary', maxWidth: 360, mb: 2 }}>
          Nothing you saved is lost. Trying again usually fixes it.
        </Typography>
        <Button variant="contained" size="large" onClick={this.retry} sx={button}>
          Try again
        </Button>
        {!onToday() && (
          <Button variant="tonal" size="large" onClick={this.goToToday} sx={button}>
            Go to Today
          </Button>
        )}
        <Button variant="text" onClick={() => window.location.reload()} sx={{ ...button, minHeight: 44, color: 'text.secondary' }}>
          Reload
        </Button>
      </Box>
    );
  }
}
