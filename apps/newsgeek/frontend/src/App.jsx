/**
 * NewsGeek root: the session gate, the shell, the route table.
 *
 * Any signed-in suite user may read (DOCS/NEWSGEEK_PLAN.md "Who") — no
 * member gate. Session rules as ThingGeek/GameGeek: getMe() on load; a null
 * user shows the splash; the refresh timer keeps the session warm; a 5xx is
 * never a sign-out (the shared Apollo link and @geeksuite/auth decide that).
 */
import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Box, CircularProgress, Typography, useMediaQuery, useTheme } from '@mui/material';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApolloClient } from '@apollo/client';
import { getMe, loginRedirect, logout as logoutRequest, onLogout, startRefreshTimer, stopRefreshTimer } from '@geeksuite/auth';
import { useUser } from '@geeksuite/user';
import { GeekShell, GeekToastProvider, LoginSplash } from '@geeksuite/ui';
import { installNewsPolicies } from './graphql/cachePolicies';
import AppMain from './components/AppMain';
import BottomTabs from './components/BottomTabs';
import GazetteMark from './components/GazetteMark';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import { APP_ID } from './components/navConfig';
import LatestView from './views/LatestView';
import { SIDEBAR_SX } from './theme/theme';

const SourcesView = lazy(() => import('./views/SourcesView'));
const SourceDetailView = lazy(() => import('./views/SourceDetailView'));

export function Booting({ label = 'Fetching the paper…' }) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        '@supports (height: 100dvh)': { minHeight: '100dvh' },
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        bgcolor: 'background.default',
        color: 'text.secondary',
      }}
    >
      <GazetteMark size={48} />
      <Typography sx={{ fontStyle: 'italic' }}>{label}</Typography>
    </Box>
  );
}

function RouteFallback() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', py: 12 }}>
      <CircularProgress size={24} aria-label="Loading" sx={{ color: 'text.secondary' }} />
    </Box>
  );
}

const lazyRoute = (element) => <Suspense fallback={<RouteFallback />}>{element}</Suspense>;

function SignedIn({ user, onSignOut }) {
  const location = useLocation();
  const theme = useTheme();
  // Phone: the tab bar is the navigation (no drawer, no hamburger). md+: the sidebar.
  const isPhone = useMediaQuery(theme.breakpoints.down('md'));
  return (
    <GeekShell
      nav={isPhone ? undefined : <Sidebar user={user} onSignOut={onSignOut} />}
      navSx={SIDEBAR_SX}
      topBar={<TopBar user={user} onSignOut={onSignOut} />}
      bottomNav={isPhone ? <BottomTabs /> : undefined}
    >
      <GeekToastProvider>
        <AppMain transitionKey={location.pathname}>
          <Routes>
            <Route path="/" element={<LatestView />} />
            <Route path="/sources" element={lazyRoute(<SourcesView />)} />
            <Route path="/sources/:id" element={lazyRoute(<SourceDetailView />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppMain>
      </GeekToastProvider>
    </GeekShell>
  );
}

export default function App() {
  const client = useApolloClient();
  // Before the first query writes anything (graphql/cachePolicies.js).
  useState(() => installNewsPolicies(client));
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

  useEffect(
    () =>
      onLogout(() => {
        resetUserStore();
        stopRefreshTimer();
        client.clearStore().catch(() => {});
        setSession({ loading: false, user: null });
      }),
    [client, resetUserStore]
  );

  const handleSignOut = () => {
    resetUserStore();
    stopRefreshTimer();
    logoutRequest();
    client.clearStore().catch(() => {});
    setSession({ loading: false, user: null });
  };

  if (session.loading) return <Booting />;

  if (!session.user) {
    return (
      <LoginSplash
        appName="news"
        appSuffix="geek"
        taglineLine1="The county paper, every morning."
        taglineLine2="Local first. Done in five minutes."
        description="A calm news briefing for Clark and Hot Spring County, then Arkansas, the nation, the world and tech — read at the publisher, never reprinted."
        features={['Local first', 'One story, many sources', 'Official notices', 'An end to the list']}
        onLogin={() => {
          setSigningIn(true);
          setError('');
          loginRedirect(APP_ID, window.location.href, 'login');
        }}
        loading={signingIn}
        error={error}
        logoColor="text.primary"
        logoSuffixColor="text.primary"
        inkColors={['rgba(27, 26, 23, 0.10)', 'rgba(29, 74, 138, 0.10)']}
      />
    );
  }

  return <SignedIn user={session.user} onSignOut={handleSignOut} />;
}
