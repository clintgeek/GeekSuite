import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  Container,
  Paper,
  Typography,
  Box,
  CircularProgress,
  Divider
} from "@mui/material";
import { loginRedirect } from "../utils/authClient";

const LoginPage = () => {
  const location = useLocation();

  useEffect(() => {
    const mode = location.pathname === "/register" ? "register" : "login";
    const returnTo = location.state?.from?.pathname
      ? `${window.location.origin}${location.state.from.pathname}`
      : `${window.location.origin}/`;

    loginRedirect(returnTo, mode);
  }, [location]);

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        px: 2
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          width: "100%",
          maxWidth: 400,
          p: 5,
          textAlign: "center"
        }}
      >
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 1.5,
            bgcolor: "primary.main",
            color: "#1a1a18",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: '"DM Serif Display", serif',
            fontWeight: 400,
            fontSize: "1.5rem",
            mb: 2
          }}
        >
          F
        </Box>
        <Typography variant="h3" gutterBottom>
          FlockGeek
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Manage your flock with precision
        </Typography>

        <Divider sx={{ mb: 3 }} />

        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, py: 3 }}>
          <CircularProgress size={24} sx={{ color: "primary.main" }} />
          <Typography variant="body1">Redirecting to baseGeek…</Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in there, and you'll be brought back here.
          </Typography>
        </Box>

        <Typography variant="caption" color="text.disabled" sx={{ mt: 3, display: "block" }}>
          Protected by BaseGeek Secure Authentication
        </Typography>
      </Paper>
    </Box>
  );
};

export default LoginPage;
