/**
 * GameGeek root: the session gate, the shell, and the route table. Nothing
 * else — each route owns its own state and queries.
 *
 * Session rules (suite): getMe() on load; a null user shows the splash; the
 * refresh timer keeps the session warm. There is no app-level logout on a
 * failed request — the shared Apollo link and @geeksuite/auth decide when a
 * session is dead, and a 5xx/503 is never that verdict.
 */
import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApolloClient } from '@apollo/client';
import { getMe, loginRedirect, logout as logoutRequest, onLogout, startRefreshTimer, stopRefreshTimer } from '@geeksuite/auth';
import { useUser } from '@geeksuite/user';
import { GeekShell, GeekToastProvider, LoginSplash } from '@geeksuite/ui';
import { installGamePolicies } from './graphql/cachePolicies';
import { useShelfList, useShelfStats } from './hooks/useGameMeta';
import AppMain from './components/AppMain';
import SavePointMark from './components/SavePointMark';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import { APP_ID, isLibraryPath } from './components/navConfig';
import LibraryView from './views/LibraryView';
import GameDetail from './views/detail/GameDetail';

const AddGameDialog = lazy(() => import('./views/add/AddGameDialog'));
const SettingsView = lazy(() => import('./views/settings/SettingsView'));

function Booting({ label = 'Loading your library…' }) {
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
      <SavePointMark size={40} />
      <Typography sx={{ fontSize: '0.875rem' }}>{label}</Typography>
    </Box>
  );
}

function RouteFallback() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
      <CircularProgress size={24} aria-label="Loading" />
    </Box>
  );
}

function SignedIn({ user, onSignOut }) {
  const location = useLocation();
  const shelves = useShelfList();
  const { stats } = useShelfStats();
  const onLibrary = isLibraryPath(location.pathname);

  return (
    <GeekShell
      nav={<Sidebar user={user} shelves={shelves} stats={stats} onSignOut={onSignOut} />}
      navSx={{ bgcolor: 'background.paper' }}
      topBar={<TopBar user={user} onSignOut={onSignOut} />}
    >
      <GeekToastProvider>
        <AppMain transitionKey={onLibrary ? 'library' : location.pathname}>
          <Routes>
            <Route path="/" element={<LibraryView />}>
              <Route path="game/:id" element={<GameDetail />} />
              <Route
                path="add"
                element={
                  <Suspense fallback={null}>
                    <AddGameDialog />
                  </Suspense>
                }
              />
            </Route>
            <Route
              path="/settings"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <SettingsView user={user} onSignOut={onSignOut} />
                </Suspense>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppMain>
      </GeekToastProvider>
    </GeekShell>
  );
}

export default function App() {
  const client = useApolloClient();
  // Before the first query writes anything (see graphql/cachePolicies.js).
  useState(() => installGamePolicies(client));
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

  if (session.loading) return <Booting label="Checking your save file…" />;

  if (!session.user) {
    return (
      <LoginSplash
        appName="game"
        appSuffix="geek"
        taglineLine1="Every game you own."
        taglineLine2="Pick up where you left off."
        description="The household game library — what's on which platform, what's in the backlog, what you're playing, and how long it took."
        features={['Every platform', 'Backlog & shelves', 'Play sessions', 'Steam import']}
        onLogin={() => {
          setSigningIn(true);
          setError('');
          loginRedirect(APP_ID, window.location.href, 'login');
        }}
        loading={signingIn}
        error={error}
        logoColor="text.primary"
        logoSuffixColor="primary.main"
        inkColors={['rgba(255, 181, 71, 0.10)', 'rgba(71, 85, 105, 0.16)']}
      />
    );
  }

  return <SignedIn user={session.user} onSignOut={handleSignOut} />;
}
