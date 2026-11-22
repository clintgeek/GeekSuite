/**
 * GeekDay root: the session gate and the routes (the day page, the week spread). Each screen owns its own
 * state and queries.
 *
 * Session rules are the suite's (as ThingGeek): `getMe()` on load; no user
 * shows the splash, whose button goes to basegeek's sign-in (spec req 17);
 * the refresh timer keeps the session warm. A failed request never signs
 * anyone out here — the shared Apollo link and @geeksuite/auth decide when a
 * session is dead, and a 5xx is never that verdict (DOCS/THE_CONTEXT.md §3.3).
 */
import React, { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useApolloClient } from '@apollo/client';
import { getMe, loginRedirect, logout as logoutRequest, onLogout, startRefreshTimer, stopRefreshTimer } from '@geeksuite/auth';
import { useUser } from '@geeksuite/user';
import { GeekToastProvider, LoginSplash } from '@geeksuite/ui';
import DayPage from './pages/DayPage.jsx';
import WeekPage from './pages/WeekPage.jsx';
import { resetDayNoteStores } from './store/dayNoteStore.js';
import { DISPLAY_FONT } from './theme/theme.js';
import BackgroundReader from './components/BackgroundReader.jsx';

export const APP_ID = 'geekday';

export function Booting({ label = 'Opening today’s page…' }) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        '@supports (height: 100dvh)': { minHeight: '100dvh' },
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        bgcolor: 'background.default',
        color: 'text.secondary',
      }}
    >
      <Typography sx={{ fontFamily: DISPLAY_FONT, fontSize: '1.75rem', fontWeight: 600, color: 'text.primary' }}>GeekDay</Typography>
      <CircularProgress size={22} aria-hidden />
      <Typography sx={{ fontSize: '0.875rem' }}>{label}</Typography>
    </Box>
  );
}

export default function App() {
  const client = useApolloClient();
  const { bootstrap, reset: resetUserStore } = useUser();
  const [session, setSession] = useState({ loading: true, user: null });
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        setSession({ loading: false, user: me || null });
        if (me) {
          startRefreshTimer(() => setSession({ loading: false, user: null }));
          bootstrap().catch(() => {});
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // Could not reach the session check. That is not "signed out" — say so.
        setError(err?.message || 'Could not reach the sign-in service. Try again in a moment.');
        setSession({ loading: false, user: null });
      });
    return () => {
      cancelled = true;
      stopRefreshTimer();
    };
  }, [bootstrap]);

  const endSession = () => {
    resetUserStore();
    resetDayNoteStores();
    stopRefreshTimer();
    client.clearStore().catch(() => {});
    setSession({ loading: false, user: null });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onLogout(endSession), [client, resetUserStore]);

  const handleSignOut = () => {
    logoutRequest();
    endSession();
  };

  if (session.loading) return <Booting label="Checking who’s here…" />;

  if (!session.user) {
    return (
      <LoginSplash
        appName="geek"
        appSuffix="day"
        taglineLine1="One page per day."
        taglineLine2="Your tasks beside your handwriting."
        description="A paper planner that remembers: today’s TodoGeek tasks next to a page you write on with a pen. Circle a line and it becomes a task."
        features={['Today’s tasks', 'A page of ink per day', 'Circle to task', 'Clock when docked']}
        onLogin={() => {
          setSigningIn(true);
          setError('');
          loginRedirect(APP_ID, window.location.href, 'login');
        }}
        loading={signingIn}
        error={error}
        logoColor="text.primary"
        logoSuffixColor="secondary.main"
        inkColors={['rgba(178, 58, 34, 0.14)', 'rgba(34, 50, 74, 0.12)']}
      />
    );
  }

  return (
    <GeekToastProvider>
      {/* Reads pages nobody is writing on, so they are searchable in NoteGeek. */}
      <BackgroundReader />
      <Routes>
        <Route path="/" element={<DayPage onSignOut={handleSignOut} />} />
        <Route path="/day/:dayKey" element={<DayPage onSignOut={handleSignOut} />} />
        <Route path="/week" element={<WeekPage />} />
        <Route path="/week/:dayKey" element={<WeekPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </GeekToastProvider>
  );
}
