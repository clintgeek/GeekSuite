import { Typography } from '@mui/material';
import Panel from './Panel';
import { StatusLamp } from './Lamp';
import { LAMP } from './readings';

/**
 * One service's cabinet: a panel whose plate names the service and whose lamp
 * and word say whether it answered. Errors are printed, not just coloured.
 */
export function Cabinet({ title, number, connected, stateWord, error, children }) {
  return (
    <Panel
      number={number}
      title={title}
      actions={<StatusLamp state={connected ? LAMP.OK : LAMP.FAULT} word={stateWord ?? (connected ? 'connected' : 'disconnected')} />}
    >
      {error && (
        <Typography color="error" variant="body2" sx={{ mb: children ? 2 : 0 }}>
          Error: {error}
        </Typography>
      )}
      {children}
    </Panel>
  );
}
