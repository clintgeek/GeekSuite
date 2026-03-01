import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "./contexts/AuthContext";
import LayoutShell from "./components/LayoutShell";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import HomePage from "./pages/HomePage";
import BirdsPage from "./pages/BirdsPage";
import GroupsPage from "./pages/GroupsPage";
import LocationsPage from "./pages/LocationsPage";
import PairingsPage from "./pages/PairingsPage";
import EggLogPage from "./pages/EggLogPage";
import HatchLogPage from "./pages/HatchLogPage";

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
          minHeight: "100vh"
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
          minHeight: "100vh"
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
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
