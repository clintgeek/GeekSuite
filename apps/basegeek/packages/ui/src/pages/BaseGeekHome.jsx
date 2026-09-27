/**
 * BaseGeekHome — the Signal Box.
 *
 * baseGeek is the interlocking every request in the suite passes through, so
 * its home is the box's panel. Everything on it is a reading:
 *
 *   The fascia     split-flap line status (faults and cautions counted from
 *                  the lamps below and the AI attention list) and the clock.
 *   1 The line     the suite as a track diagram — a station per app, its lamp
 *                  the live health check; the nameboards launch the apps. The
 *                  depot underneath is the shared infrastructure.
 *
 * Admin only (the data behind them is admin-only on the server):
 *
 *   2 Instruments  paid spend today against the governor's daily cap; AI calls
 *                  today against the week's busiest day; free models alive in
 *                  the catalog's last probe; and the chart recorder, calls per
 *                  day from the ledger.
 *   3 Annunciator  a tile per kind of attention item, lit by the real list,
 *                  and a lamp per AI provider.
 *   4 Lever frame  three real, non-destructive actions: re-read everything,
 *                  run catalog discovery, day/night.
 *   5 Register     what the box has observed this session.
 *
 * Anyone else who lands here (Heather, via the suite's app switcher) gets the
 * fascia and the line, which is the launcher they came for, and nothing that
 * would only ever show them a 403.
 *
 * Night Watch, the idle screensaver, lives here too — see signalbox/NightWatch.
 */
import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useToast } from '@geeksuite/ui';
import { useThemeMode } from '@geeksuite/user';
import { useBaseGeekAuth } from '../components/AuthContext';
import Panel from '../signalbox/Panel';
import SuiteMap from '../signalbox/SuiteMap';
import SplitFlap from '../signalbox/SplitFlap';
import Gauge from '../signalbox/Gauge';
import ChartRecorder from '../signalbox/ChartRecorder';
import Annunciator from '../signalbox/Annunciator';
import Lever from '../signalbox/Lever';
import Lamp, { StatusLamp } from '../signalbox/Lamp';
import NightWatch, { useIdle } from '../signalbox/NightWatch';
import { Dymo } from '../signalbox/Labels';
import { useSignalBox } from '../signalbox/useSignalBox';
import { useConsolePrefs } from '../signalbox/consolePrefs';
import { useReducedMotion } from '../signalbox/motion';
import {
  LAMP,
  annunciate,
  catalogReading,
  dayLabel,
  formatDollars,
  healthDetail,
  healthLamp,
  lineStatus,
  providerLamp,
  spendReading,
  trafficReading,
} from '../signalbox/readings';

const SPEND_WORD = { ok: 'within cap', warn: 'nearing cap', fault: 'at cap' };
const CATALOG_WORD = { ok: 'healthy', warn: 'thinning', fault: 'failing' };

/**
 * The name to greet. On production Chef's username IS his email, so greeting by
 * username read "GOOD MORNING, CLINT@CLINTGEEK.COM" (2026-09-27). Prefer the
 * profile's display name, then a username or email's local part, first letter
 * capitalised (NoteGeek's greetingNameFrom does the same).
 */
export function greetingName(user) {
  const raw = user?.profile?.displayName?.trim()
    || String(user?.username || user?.email || '').split('@')[0].trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
}

function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function clockText(date) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function Fascia({ user, status, now }) {
  return (
    <Box
      component="header"
      sx={(theme) => ({
        mb: 3,
        borderRadius: 1.5,
        overflow: 'hidden',
        border: `1px solid ${theme.palette.line.strong}`,
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      })}
    >
      {/* The board: black glass, flaps, the clock. Fixed ink on a fixed fill. */}
      <Box
        sx={(theme) => ({
          px: { xs: 1.5, sm: 2.5 },
          py: 1.5,
          bgcolor: theme.palette.box.tape.black,
          color: theme.palette.box.tape.ink,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
        })}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, flex: '1 1 260px' }}>
          <Lamp state={status.state} size={18} />
          <Box sx={{ minWidth: 0 }}>
            <Typography component="span" sx={{ display: 'block', fontFamily: 'fontFamilyMono', fontSize: '0.75rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#b0b6be', mb: 0.5 }}>
              Line status
            </Typography>
            <SplitFlap text={status.message} size="md" />
          </Box>
        </Box>
        <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
          <Typography component="span" sx={{ display: 'block', fontFamily: 'fontFamilyMono', fontSize: '0.75rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#b0b6be', mb: 0.5 }}>
            Box time
          </Typography>
          <SplitFlap text={clockText(now)} size="md" tone="brass" />
        </Box>
      </Box>
      <Box
        sx={(theme) => ({
          px: { xs: 1.5, sm: 2.5 },
          py: 1.5,
          bgcolor: theme.palette.background.paper,
          display: 'flex',
          alignItems: 'baseline',
          gap: 2,
          flexWrap: 'wrap',
        })}
      >
        <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.6rem', sm: '2rem' } }}>
          {greetingFor(now)}{greetingName(user) ? `, ${greetingName(user)}` : ''}
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontFamily: 'fontFamilyMono', fontSize: '0.8125rem' }}>
          {now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Typography>
      </Box>
    </Box>
  );
}

function Instruments({ status, statusError, traffic, trafficError }) {
  const spend = spendReading(status?.spend);
  const calls = trafficReading(traffic);
  const catalog = catalogReading(status?.catalog);
  const pct = (f) => `${Math.round((f || 0) * 100)}%`;

  return (
    <Panel
      number={2}
      title="Instruments"
      caption={statusError || trafficError
        ? `Some readings are missing: ${[statusError && `AI status (${statusError})`, trafficError && `ledger (${trafficError})`].filter(Boolean).join('; ')}.`
        : 'Real ceilings only: the paid governor’s daily cap, the week’s own peak, the catalog’s last probe.'}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: { xs: 3, sm: 2 }, mb: 3 }}>
        <Gauge
          label="Paid spend today"
          value={spend?.value}
          max={spend?.max}
          fraction={spend?.fraction ?? null}
          zone={spend?.zone}
          zoneWord={SPEND_WORD[spend?.zone]}
          readout={formatDollars(spend?.value)}
          caption={`of ${formatDollars(spend?.max)} a day, the governor’s cap`}
          valueText={spend ? `${formatDollars(spend.value)} of a ${formatDollars(spend.max)} daily cap, ${pct(spend.fraction)}, ${SPEND_WORD[spend.zone]}` : ''}
          maxLabel={spend?.max ? formatDollars(spend.max) : undefined}
        />
        <Gauge
          label="AI calls today"
          value={calls?.value}
          max={calls?.max}
          fraction={calls ? calls.fraction : null}
          zone={LAMP.OK}
          readout={calls ? calls.value.toLocaleString() : ''}
          caption={calls?.max
            ? `against the week’s busiest day (${calls.max.toLocaleString()}, ${dayLabel(calls.peakDay)})`
            : 'no calls in the ledger this week'}
          valueText={calls ? `${calls.value} calls today; the week’s busiest day had ${calls.max ?? 0}` : ''}
          zones={null}
          maxLabel={calls?.max ? String(calls.max) : undefined}
        />
        <Gauge
          label="Free models alive"
          value={catalog?.value}
          max={catalog?.max}
          fraction={catalog?.fraction ?? null}
          zone={catalog?.zone}
          zoneWord={CATALOG_WORD[catalog?.zone]}
          readout={catalog ? `${catalog.value} / ${catalog.max ?? 0}` : ''}
          caption="answered the catalog’s last probe"
          valueText={catalog ? `${catalog.value} of ${catalog.max ?? 0} free models answered the last probe, ${CATALOG_WORD[catalog.zone]}` : ''}
          zones={{ warn: 0.5, fault: 0.75, invert: true }}
          maxLabel={catalog?.max ? String(catalog.max) : undefined}
        />
      </Box>
      <Dymo sx={{ mb: 1 }}>Chart recorder</Dymo>
      <ChartRecorder days={traffic?.days || []} />
    </Panel>
  );
}

function AnnunciatorPanel({ status }) {
  const tiles = useMemo(() => annunciate(status?.attention || []), [status]);
  const providers = Object.keys(status?.catalog?.byProvider || {});
  const labels = status?.catalog?.labels || {};
  const active = tiles.filter((t) => t.lit).length;

  return (
    <Panel
      number={3}
      title="Annunciator"
      caption={status
        ? active ? `${active} alarm ${active === 1 ? 'window' : 'windows'} lit. AIGeek has the detail and the fixes.` : 'Every window dark: nothing on the AI attention list.'
        : 'Waiting for the AI status.'}
      actions={(
        <Button component={RouterLink} to="/aigeek" variant="outlined" size="small">
          Open AIGeek
        </Button>
      )}
    >
      <Annunciator tiles={tiles} />
      {providers.length > 0 && (
        <>
          <Dymo sx={{ mt: 2.5, mb: 1.5 }}>Providers</Dymo>
          <Box component="ul" sx={{ m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
            {providers.map((id) => {
              const lamp = providerLamp(id, status.catalog.byProvider, status.attention);
              return (
                <Box component="li" key={id} sx={{ listStyle: 'none', minWidth: 0 }}>
                  <StatusLamp state={lamp.state} label={labels[id] || id} word={lamp.word} dense />
                </Box>
              );
            })}
          </Box>
        </>
      )}
    </Panel>
  );
}

function LeverFrame({ box, notify }) {
  const { theme: mode, toggleTheme } = useThemeMode();
  return (
    <Panel
      number={4}
      title="Lever frame"
      caption="Real jobs, none destructive. Anything that deletes or resets keeps its confirmation on its own page."
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 1, sm: 1.5 } }}>
        <Lever
          number={1}
          label="Re-read"
          colour="black"
          description="Poll every instrument now"
          busyWord="reading"
          onPull={box.rereadAll}
        />
        <Lever
          number={2}
          label="Discovery"
          colour="yellow"
          description="List every provider, probe the free models"
          busy={box.discoveryRunning}
          busyWord="running"
          onPull={async () => {
            const outcome = await box.runDiscovery();
            notify(outcome.message, { tone: outcome.ok ? 'success' : 'error' });
          }}
        />
        <Lever
          number={3}
          label={mode === 'dark' ? 'Day turn' : 'Night turn'}
          colour="blue"
          description={mode === 'dark' ? 'Switch the panel to light' : 'Switch the panel to dark'}
          onPull={() => {
            toggleTheme();
            box.log(`Lever 3 — ${mode === 'dark' ? 'day' : 'night'} turn`);
          }}
        />
      </Box>
    </Panel>
  );
}

function Register({ entries }) {
  return (
    <Panel number={5} title="Train register" caption="What this box has seen since you opened it: lamps that changed, levers thrown.">
      <Box
        component="ol"
        aria-label="Register entries, newest first"
        sx={(theme) => ({
          m: 0,
          p: 1.5,
          maxHeight: 260,
          overflowY: 'auto',
          borderRadius: 1,
          bgcolor: theme.palette.box.chart.paper,
          color: theme.palette.box.chart.ink,
          fontFamily: theme.typography.fontFamilyMono,
          fontSize: '0.75rem',
          lineHeight: 1.7,
          // Ruled like the book.
          backgroundImage: `repeating-linear-gradient(180deg, transparent 0 19.4px, ${theme.palette.box.chart.grid} 19.4px 20.4px)`,
        })}
        tabIndex={0}
      >
        {entries.map((entry, i) => (
          <Box component="li" key={`${entry.at}-${i}`} sx={{ listStyle: 'none', display: 'flex', gap: 1.5 }}>
            <Box component="span" sx={{ color: '#8c1c13', fontWeight: 700, flexShrink: 0 }}>{entry.at}</Box>
            <Box component="span" sx={{ overflowWrap: 'anywhere' }}>{entry.text}</Box>
          </Box>
        ))}
      </Box>
    </Panel>
  );
}

export default function BaseGeekHome() {
  const { user, isAdmin } = useBaseGeekAuth();
  const { notify } = useToast();
  const prefs = useConsolePrefs();
  const reduced = useReducedMotion();
  const box = useSignalBox({ isAdmin });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const lampStates = [
    ...box.apps.map((app) => healthLamp(box.appHealth[app.name])),
    ...box.services.map((svc) => healthLamp(box.serviceStatus[svc.key])),
  ];
  const status = lineStatus({ lamps: lampStates, attention: isAdmin ? box.status?.attention : [] });

  const idle = useIdle({ ms: prefs.idleMinutes * 60000, enabled: prefs.nightWatch && !reduced });
  const [watchDismissed, setWatchDismissed] = useState(false);
  useEffect(() => { if (!idle) setWatchDismissed(false); }, [idle]);

  const stations = [
    ...box.apps.map((app) => ({ label: app.displayName, state: healthLamp(box.appHealth[app.name]), word: healthDetail(box.appHealth[app.name]) })),
    ...box.services.map((svc) => ({ label: svc.name, state: healthLamp(box.serviceStatus[svc.key]), word: healthDetail(box.serviceStatus[svc.key]) })),
  ];

  return (
    <Box>
      <Fascia user={user} status={status} now={now} />

      <Box sx={{ display: 'grid', gap: 3 }}>
        <Panel
          number={1}
          title="The line"
          caption="Every app is a station; its lamp is a live health check through baseGeek. Nameboards open the app."
        >
          <SuiteMap apps={box.apps} health={box.appHealth} services={box.services} serviceStatus={box.serviceStatus} />
        </Panel>

        {isAdmin ? (
          <>
            <Instruments status={box.status} statusError={box.statusError} traffic={box.traffic} trafficError={box.trafficError} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, gap: 3, alignItems: 'start' }}>
              <AnnunciatorPanel status={box.status} />
              <LeverFrame box={box} notify={notify} />
            </Box>
            <Register entries={box.register} />
          </>
        ) : (
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <Button component={RouterLink} to="/account" variant="outlined">Your account</Button>
            <Button component={RouterLink} to="/settings" variant="outlined">Console settings</Button>
          </Box>
        )}
      </Box>

      <NightWatch active={idle && !watchDismissed} stations={stations} status={status} onExit={() => setWatchDismissed(true)} />
    </Box>
  );
}
