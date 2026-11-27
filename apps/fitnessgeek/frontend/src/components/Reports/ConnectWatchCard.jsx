import React from 'react';
import { WatchOutlined as WatchIcon } from '@mui/icons-material';
import { EmptyState } from '../primitives';

/**
 * The one card a person without a watch sees where watch data would be:
 * what would show here, and one button. No empty charts, no setup form, no
 * server names. `action` is the button (a link to Settings on Activity, the
 * "Set it up" disclosure on Health).
 */
const ConnectWatchCard = ({
  title = 'Connect a Garmin watch',
  copy = 'Connect a Garmin watch to see heart rate, sleep and recovery here.',
  action,
  ...rest
}) => (
  <EmptyState
    variant="card"
    icon={WatchIcon}
    title={title}
    copy={copy}
    action={action}
    data-testid="connect-watch"
    {...rest}
  />
);

export default ConnectWatchCard;
