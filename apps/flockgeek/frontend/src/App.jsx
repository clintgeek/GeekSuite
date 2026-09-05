import { lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "./contexts/AuthContext";
import LayoutShell from "./components/LayoutShell";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";

/**
 * Route-level code splitting (2026-09-05).
 *
 * Every page used to be a static import, so one visitor to Home downloaded
 * BirdsPage's 748 lines, both ledger dialogs and every GraphQL document in
 * the app before anything painted. The eight pages below are `lazy()` — each
 * becomes its own chunk that loads when its route is first entered, behind
 * the `Suspense` boundary `LayoutShell` puts around the `Outlet` (so the
 * shell, sidebar, top bar and bottom nav stay mounted while a chunk lands).
 *
 * EAGER on purpose, and the reason matters:
 *
 * - `HomePage` is the index route — the destination of `/`, of the bottom
 *   nav's first tab, and of every post-login redirect. Making it lazy would
 *   put a second network round-trip in front of the app's most common first
 *   paint to save bytes that the very next request asks for anyway. It also
 *   registers the harvest FAB (`QuickHarvestSheet` → `useGeekPrimaryAction`),
 *   and a lazy Home would mean the shell paints, then the FAB pops in a beat
 *   later on the one screen where it is the point.
 * - `LoginPage` is 34 lines and is the whole unauthenticated app; a chunk
 *   boundary there costs a round-trip and saves nothing measurable.
 *
 * `EggLogPage` registers the same FAB and IS lazy: it is a route the user
 * navigates to, so its FAB registers when its chunk mounts, which is exactly
 * when its page content appears — no window where the page is up and the FAB
 * is missing. `QuickHarvestEntry`/`QuickHarvestSheet` are shared by Home and
 * EggLog, so they ride in the eager Home graph and EggLog reuses them.
 */
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const BirdsPage = lazy(() => import("./pages/BirdsPage"));
const GroupsPage = lazy(() => import("./pages/GroupsPage"));
const LocationsPage = lazy(() => import("./pages/LocationsPage"));
const PairingsPage = lazy(() => import("./pages/PairingsPage"));
const EggLogPage = lazy(() => import("./pages/EggLogPage"));
const HatchLogPage = lazy(() => import("./pages/HatchLogPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

// Protected route component
const ProtectedRoute = ({ element }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          // `100vh` on iOS Safari is the *largest* viewport, so a centred
          // spinner sits below the fold while the URL bar shows. Same
          // `@supports` fallback GeekShell uses (MOBILE_UI_PLAN.md §2).
          minHeight: "100vh",
          "@supports (height: 100dvh)": { minHeight: "100dvh" }
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return isAuthenticated
    ? element
    : <Navigate to="/login" state={{ from: location }} replace />;
};

const App = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          // `100vh` on iOS Safari is the *largest* viewport, so a centred
          // spinner sits below the fold while the URL bar shows. Same
          // `@supports` fallback GeekShell uses (MOBILE_UI_PLAN.md §2).
          minHeight: "100vh",
          "@supports (height: 100dvh)": { minHeight: "100dvh" }
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Routes>
      {/* Auth Routes */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />

      <Route
        path="/register"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />

      {/* Protected Routes */}
      <Route path="/" element={<ProtectedRoute element={<LayoutShell />} />}>
        <Route index element={<HomePage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="birds" element={<BirdsPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="locations" element={<LocationsPage />} />
        <Route path="pairings" element={<PairingsPage />} />
        <Route path="egg-log" element={<EggLogPage />} />
        <Route path="hatch-log" element={<HatchLogPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
