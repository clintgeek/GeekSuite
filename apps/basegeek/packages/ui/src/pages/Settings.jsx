/**
 * Settings — the switch panel. Every switch here is real.
 *
 * What was here before was a form that saved nothing: "API Base URL",
 * "Default Database Port", "JWT Secret", "Enable SSL/TLS", backup directory
 * and frequency — none of it wired to anything, and a Save button with no
 * handler. A console that shows you a JWT Secret field you can type into and
 * that does nothing is worse than no page (2026-09-27, Signal Box pass). The
 * server's configuration lives in the deployment's environment and the
 * runbook; this page holds only the switches the console actually has:
 *
 *   - Night turn: the suite-wide theme (the `geek_theme` cookie and your
 *     stored preference, via @geeksuite/user).
 *   - Sound: the box bell and lever clunk. Off by default.
 *   - Night Watch: the dashboard's idle screensaver, and how long it waits.
 *
 * The last two are this browser's (consolePrefs, localStorage).
 */
import { Box, Button, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Switch, Typography } from '@mui/material';
import { useThemeMode } from '@geeksuite/user';
import Panel from '../signalbox/Panel';
import { Dymo } from '../signalbox/Labels';
import { IDLE_MINUTE_CHOICES, setConsolePref, useConsolePrefs } from '../signalbox/consolePrefs';
import { ringBell } from '../signalbox/sound';

function SwitchRow({ label, help, checked, onChange, children }) {
  return (
    <Box sx={{ py: 1.5, borderBottom: '1px solid', borderColor: 'divider', '&:last-of-type': { borderBottom: 'none' } }}>
      <FormControlLabel
        control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />}
        label={<Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{label}</Typography>}
        sx={{ ml: 0, mr: 0, gap: 1.5 }}
      />
      {help && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, pl: { xs: 0, sm: '84px' } }}>
          {help}
        </Typography>
      )}
      {children && <Box sx={{ mt: 1.5, pl: { xs: 0, sm: '84px' } }}>{children}</Box>}
    </Box>
  );
}

export default function Settings() {
  const { theme: mode, toggleTheme } = useThemeMode();
  const prefs = useConsolePrefs();

  return (
    <Box sx={{ display: 'grid', gap: 3, maxWidth: 880 }}>
      <Panel
        number={1}
        title="Panel switches"
        caption="Thrown here, they take effect at once. There is no Save button because there is nothing to save."
      >
        <SwitchRow
          label="Night turn"
          help={mode === 'dark'
            ? 'The panel is dark. Off switches to the day turn. This follows you across the whole suite.'
            : 'The panel is light. On switches to the night turn. This follows you across the whole suite.'}
          checked={mode === 'dark'}
          onChange={() => toggleTheme()}
        />
        <SwitchRow
          label="Box bell and lever sound"
          help="A bell for the lamp test, a clunk when a lever is thrown. Off unless you turn it on; this browser only."
          checked={prefs.sound}
          onChange={(on) => setConsolePref('sound', on)}
        >
          <Button variant="outlined" size="small" onClick={() => ringBell({ force: true })}>
            Ring the bell once
          </Button>
        </SwitchRow>
        <SwitchRow
          label="Night Watch"
          help="After a quiet spell on the Signal Box dashboard, the panel dims to a live departures board. Any key or touch brings it back. Never runs if your system asks for reduced motion."
          checked={prefs.nightWatch}
          onChange={(on) => setConsolePref('nightWatch', on)}
        >
          <FormControl size="small" sx={{ minWidth: 200 }} disabled={!prefs.nightWatch}>
            <InputLabel id="night-watch-idle-label">Come on after</InputLabel>
            <Select
              labelId="night-watch-idle-label"
              label="Come on after"
              value={prefs.idleMinutes}
              onChange={(e) => setConsolePref('idleMinutes', Number(e.target.value))}
            >
              {IDLE_MINUTE_CHOICES.map((m) => (
                <MenuItem key={m} value={m}>{m} minutes idle</MenuItem>
              ))}
            </Select>
          </FormControl>
        </SwitchRow>
      </Panel>

      <Panel number={2} title="Where the rest lives">
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          Server configuration — ports, secrets, database connections, backups — belongs to the
          deployment, not to a browser tab. Change it in the environment file and follow the runbook.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Dymo caps={false}>.env.production</Dymo>
          <Dymo caps={false}>DOCS/RUNBOOK.md</Dymo>
          <Dymo caps={false}>apps/basegeek/DOCS/CONTEXT.md</Dymo>
        </Box>
      </Panel>

      <Panel number={3} title="Box notes">
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Every panel has a lamp test, as real ones do. It is the old code: up, up, down, down,
          left, right, left, right, B, A — anywhere in the console, outside a text field.
        </Typography>
      </Panel>
    </Box>
  );
}
