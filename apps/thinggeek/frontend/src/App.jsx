/**
 * ThingGeek root: the session gate, the member gate, the shell, and the
 * route table. Nothing else — each route owns its own state and queries.
 *
 * Session rules (suite, as GameGeek): getMe() on load; a null user shows the
 * splash; the refresh timer keeps the session warm. No app-level logout on
 * a failed request — the shared Apollo link and @geeksuite/auth decide when
 * a session is dead, and a 5xx is never that verdict.
 *
 * Member gate (DOCS/THINGGEEK_PLAN.md): once signed in, the first gateway
 * answer says whether this account is a household member. A NOT_A_MEMBER
 * answer — from GraphQL at boot, or from any REST call later — shows the
 * members-only page instead of the app.
 */
import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApolloClient, useQuery } from '@apollo/client';
import { getMe, loginRedirect, logout as logoutRequest, onLogout, startRefreshTimer, stopRefreshTimer } from '@geeksuite/auth';
import { useUser } from '@geeksuite/user';
import { GeekShell, GeekToastProvider, LoginSplash } from '@geeksuite/ui';
import { CollectionProvider } from '@geeksuite/collection';
import { installThingPolicies } from './graphql/cachePolicies';
import { GET_THING_VOCABULARY } from './graphql/queries';
import { UploadsProvider } from './hooks/useUploads';
import { isNotMemberError, isNotMemberState, onNotMember, resetMembership } from './membership';
import AppMain from './components/AppMain';
import NotAMember from './components/NotAMember';
import Sidebar from './components/Sidebar';
import TagMark from './components/TagMark';
import TopBar from './components/TopBar';
import { APP_ID, isLibraryPath } from './components/navConfig';
import { THING_COLLECTION } from './utils/collectionConfig';
import LibraryView from './views/LibraryView';
import ThingDetail from './views/detail/ThingDetail';

const AddThing = lazy(() => import('./views/add/AddThing'));
const AttentionView = lazy(() => import('./views/AttentionView'));
const PlacesView = lazy(() => import('./views/PlacesView'));
const TypesView = lazy(() => import('./views/TypesView'));
const InsuranceView = lazy(() => import('./views/InsuranceView'));
const TrashView = lazy(() => import('./views/TrashView'));
const SettingsView = lazy(() => import('./views/settings/SettingsView'));

export function Booting({ label = 'Opening the ledger…' }) {
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
      <TagMark size={44} />
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

const lazyRoute = (element) => <Suspense fallback={<RouteFallback />}>{element}</Suspense>;

/** Whether this account may use ThingGeek, from the first gateway answer and any later REST 403. */
export function useMembership() {
  const { data, error, loading } = useQuery(GET_THING_VOCABULARY, { fetchPolicy: 'cache-first' });
  const [flagged, setFlagged] = useState(isNotMemberState);
  useEffect(() => onNotMember(() => setFlagged(true)), []);
  const notMember = flagged || isNotMemberError(error);
  // Any other error (the gateway briefly down) is not a verdict: open the
  // app and let each screen say its own "didn't load".
  return { checking: loading && !data && !error, notMember };
}

function SignedIn({ user, onSignOut }) {
  const location = useLocation();
  const { checking, notMember } = useMembership();
  const onLibrary = isLibraryPath(location.pathname);

  if (notMember) return <NotAMember user={user} onSignOut={onSignOut} />;
  if (checking) return <Booting />;

  return (
    <CollectionProvider value={THING_COLLECTION}>
      <GeekShell
        nav={<Sidebar user={user} onSignOut={onSignOut} />}
        navSx={{ bgcolor: 'background.paper' }}
        topBar={<TopBar user={user} onSignOut={onSignOut} />}
      >
        <GeekToastProvider>
          <UploadsProvider>
            <AppMain transitionKey={onLibrary ? 'library' : location.pathname}>
              <Routes>
                <Route path="/" element={<LibraryView />}>
                  <Route path="thing/:id" element={<ThingDetail />} />
                  <Route
                    path="add"
                    element={
                      <Suspense fallback={null}>
                        <AddThing />
                      </Suspense>
                    }
                  />
                </Route>
                <Route path="/attention" element={lazyRoute(<AttentionView />)} />
                <Route path="/places" element={lazyRoute(<PlacesView />)} />
                <Route path="/types" element={lazyRoute(<TypesView />)} />
                <Route path="/insurance" element={lazyRoute(<InsuranceView />)} />
                <Route path="/trash" element={lazyRoute(<TrashView />)} />
                <Route path="/settings" element={lazyRoute(<SettingsView user={user} onSignOut={onSignOut} />)} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppMain>
          </UploadsProvider>
        </GeekToastProvider>
      </GeekShell>
    </CollectionProvider>
  );
}

export default function App() {
  const client = useApolloClient();
  // Before the first query writes anything (see graphql/cachePolicies.js).
  useState(() => installThingPolicies(client));
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
        resetMembership();
        stopRefreshTimer();
        client.clearStore().catch(() => {});
        setSession({ loading: false, user: null });
      }),
    [client, resetUserStore]
  );

  const handleSignOut = () => {
    resetUserStore();
    resetMembership();
    stopRefreshTimer();
    logoutRequest();
    client.clearStore().catch(() => {});
    setSession({ loading: false, user: null });
  };

  if (session.loading) return <Booting label="Checking who's here…" />;

  if (!session.user) {
    return (
      <LoginSplash
        appName="thing"
        appSuffix="geek"
        taglineLine1="Everything worth keeping."
        taglineLine2="Ready for a bad day."
        description="The household ledger of what we own — where it lives, what's due, and the photo, serial, receipt and value the insurer will ask for."
        features={['Photos & receipts', 'Masked serials', "What's due", 'Insurance report']}
        onLogin={() => {
          setSigningIn(true);
          setError('');
          loginRedirect(APP_ID, window.location.href, 'login');
        }}
        loading={signingIn}
        error={error}
        logoColor="text.primary"
        logoSuffixColor="primary.main"
        inkColors={['rgba(29, 101, 70, 0.10)', 'rgba(168, 123, 43, 0.12)']}
      />
    );
  }

  return <SignedIn user={session.user} onSignOut={handleSignOut} />;
}
