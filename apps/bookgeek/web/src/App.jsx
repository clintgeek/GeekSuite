/**
 * BookGeek root: the session gate, the shell, and the route table. Nothing
 * else — each route owns its own state (Phase B of
 * DOCS/BOOKGEEK_CLEANUP_PLAN.md; GameGeek's App.jsx is the model):
 *
 *   /            views/LibraryRoute.jsx    hooks/useLibrary (the list, in the Apollo cache)
 *   /book/:id    views/BookDetailRoute.jsx hooks/useBookDetail (child route over the library)
 *   /settings    views/SettingsRoute.jsx   hooks/useSettings
 *
 * What more than one route reads — profile and shelves, saved filters,
 * preferences, the device basket, the Add-book dialog — is session state in
 * hooks/useBookGeek.jsx; the library's filters are the URL
 * (hooks/useLibraryParams.jsx).
 *
 * Session rules (suite): getMe() on load; a null user shows the splash; the
 * refresh timer keeps the session warm; a 401 from bookgeek's own API signs
 * out (utils/authFetch.js), as it always did.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import { Navigate, Route, Routes } from "react-router-dom";
import { useApolloClient } from "@apollo/client";
import { getMe, loginRedirect, logout as logoutRequest, onLogout, startRefreshTimer, stopRefreshTimer } from "@geeksuite/auth";
import { useUser } from "@geeksuite/user";
import { GeekFab, GeekShell, GeekToastProvider, LoginSplash } from "@geeksuite/ui";
import { registerReset, reset as resetUserStore } from "./utils/resetUserStore";
import { setUnauthorizedHandler } from "./utils/authFetch";
import { installBookPolicies } from "./graphql/cachePolicies";
import { isFabHidden } from "./components/navConfig";
import AppMain from "./components/AppMain";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import { BookGeekProvider, useBookGeek } from "./hooks/useBookGeek";
import { LibraryParamsProvider, useLibraryParams } from "./hooks/useLibraryParams";
import AddBookDialog from "./views/AddBookDialog";
import BookDetailRoute from "./views/BookDetailRoute";
import DeviceBasketDialog from "./views/DeviceBasketDialog";
import LibraryRoute from "./views/LibraryRoute";
import SettingsRoute from "./views/SettingsRoute";

/** The route table, on its own so tests can mount it under their own providers. */
export function BookGeekRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LibraryRoute />}>
        <Route path="book/:id" element={<BookDetailRoute />} />
      </Route>
      <Route path="/settings" element={<SettingsRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Suite shell grammar (THE_UI_UNIFICATION_PLAN.md §3): the top bar is the
// shell's `topBar`, not a sibling AppBar above it, so the sidebar column runs
// full height; `nav` hands the shell the sidebar *content*, and it owns the
// md breakpoint, the mobile drawer and the 220px width. The dialogs below
// stay siblings of the shell (all of them are portals or `fixed` overlays).
function Shell() {
  const params = useLibraryParams();
  const { user, onSignOut, shelves, shelfSummary, savedFilters, basket, addBook, profile } = useBookGeek();

  return (
    <>
      <GeekShell
        nav={
          <Sidebar
            user={user}
            shelves={shelves}
            shelfFilter={params.shelfFilter}
            setShelfFilter={params.setShelfFilter}
            shelfSummary={shelfSummary}
            activeView={params.activeView}
            setActiveView={params.setActiveView}
            searchQuery={params.searchQuery}
            setSearchQuery={params.setSearchQuery}
            authorFilter={params.authorFilter}
            setAuthorFilter={params.setAuthorFilter}
            tagFilter={params.tagFilter}
            setTagFilter={params.setTagFilter}
            savedFilters={savedFilters.savedFilters}
            savedFiltersError={savedFilters.savedFiltersError}
            applySavedFilter={savedFilters.applySavedFilter}
            handleDeleteSavedFilter={savedFilters.handleDeleteSavedFilter}
            deleteFilterLoadingId={savedFilters.deleteFilterLoadingId}
            onSignOut={onSignOut}
          />
        }
        navSx={{ bgcolor: "background.paper" }}
        topBar={
          <TopBar
            user={user}
            activeView={params.activeView}
            setActiveView={params.setActiveView}
            setAddBookOpen={addBook.setAddBookOpen}
            onSignOut={onSignOut}
            searchQuery={params.searchQuery}
            setSearchQuery={params.setSearchQuery}
          />
        }
      >
        <GeekToastProvider>
          {/* Not GeekAppFrame: it would remount the library under /book/:id (components/AppMain.jsx). */}
          <AppMain transitionKey={params.activeView}>
            <Box
              sx={{
                p: { xs: 2, md: 3 },
                maxWidth: "1200px",
                mx: "auto",
              }}
            >
              <BookGeekRoutes />
            </Box>
          </AppMain>
        </GeekToastProvider>

        {/* Primary action in the thumb zone. Sibling of the main column, never
            inside it: the column animates, and an animating element becomes the
            containing block for `position: fixed` children. */}
        <GeekFab
          label="Add book"
          onClick={() => addBook.setAddBookOpen(true)}
          hidden={isFabHidden({
            activeView: params.activeView,
            selectMode: basket.selectMode,
            basketBookIds: basket.basketBookIds,
          })}
        />
      </GeekShell>

      <AddBookDialog {...addBook} shelves={shelves} />

      {/* Device Basket Result Dialog */}
      {basket.basketResultOpen && basket.basketResult && (
        <DeviceBasketDialog
          basketResult={basket.basketResult}
          clearBasket={basket.clearBasket}
          profile={profile}
          setBasketError={basket.setBasketError}
          setBasketResult={basket.setBasketResult}
          setBasketResultOpen={basket.setBasketResultOpen}
        />
      )}
    </>
  );
}

/** Everything behind the session gate. Unmounts on sign-out, taking all session state with it. */
export function SignedIn({ user, onSignOut }) {
  return (
    <LibraryParamsProvider>
      <BookGeekProvider user={user} onSignOut={onSignOut}>
        <Shell />
      </BookGeekProvider>
    </LibraryParamsProvider>
  );
}

export default function App() {
  const apolloClient = useApolloClient();
  // Before the first query writes anything (see graphql/cachePolicies.js).
  useState(() => installBookPolicies(apolloClient));
  const { bootstrap, reset: resetUser } = useUser();
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const bootstrapRanRef = useRef(false);

  useEffect(() => {
    registerReset(resetUser);
  }, [resetUser]);

  useEffect(() => {
    if (!user) {
      bootstrapRanRef.current = false;
      return;
    }
    if (sessionLoading) return;
    if (bootstrapRanRef.current) return;
    bootstrapRanRef.current = true;
    bootstrap().catch(() => { });
  }, [user, sessionLoading, bootstrap]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      try {
        const me = await getMe();
        if (cancelled) return;
        if (me) {
          setUser(me);
          startRefreshTimer(() => setUser(null));
        } else {
          setUser(null);
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    }

    hydrateSession();

    return () => {
      cancelled = true;
      stopRefreshTimer();
    };
  }, []);

  // Signing out drops the session's cached library too: the next user must
  // not see this one's rows.
  const endSession = useCallback(() => {
    resetUserStore();
    stopRefreshTimer();
    apolloClient.clearStore().catch(() => {});
    bootstrapRanRef.current = false;
    setUser(null);
  }, [apolloClient]);

  useEffect(() => onLogout(endSession), [endSession]);

  const handleLogout = useCallback(() => {
    resetUserStore();
    logoutRequest();
    endSession();
  }, [endSession]);

  useEffect(() => setUnauthorizedHandler(handleLogout), [handleLogout]);

  if (sessionLoading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          "@supports (height: 100dvh)": { minHeight: "100dvh" },
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.default",
          color: "text.secondary",
          typography: "body1",
        }}
      >
        Checking session…
      </Box>
    );
  }

  if (!user) {
    return (
      <LoginSplash
        appName="book"
        appSuffix="geek"
        taglineLine1="Read beautifully."
        taglineLine2="Your library, reimagined."
        description="A modern, clean e-reader for your personal library. upload, organize, and read your favorite books anywhere."
        features={['EPUB Support', 'Sync Progress', 'Metadata Management', 'Dark Mode']}
        onLogin={() => {
          setAuthLoading(true);
          setAuthError(null);
          loginRedirect("bookgeek", window.location.href, "login");
        }}
        loading={authLoading}
        error={authError}
        // BookGeek branding (Blue/Slate)
        logoColor="text.primary"
        logoSuffixColor="primary.main"
        // Custom ink wash for BookGeek
        inkColors={[
          'rgba(59, 130, 246, 0.08)', // Blue
          'rgba(30, 64, 175, 0.06)'   // Darker Blue
        ]}
      />
    );
  }

  return <SignedIn user={user} onSignOut={handleLogout} />;
}
