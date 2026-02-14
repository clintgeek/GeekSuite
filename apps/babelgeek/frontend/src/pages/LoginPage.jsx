import React, { useEffect } from "react";
import { Box, CircularProgress, Link, Typography } from "@mui/material";
import { useLocation } from "react-router-dom";
import { loginRedirect } from "../utils/authClient";

const LoginPage = () => {
  const location = useLocation();

  useEffect(() => {
    const from = location.state?.from;
    const returnTo = from
      ? `${window.location.origin}${from.pathname || "/"}${from.search || ""}${from.hash || ""}`
      : `${window.location.origin}/learn`;

    loginRedirect(returnTo, "login");
  }, [location.state]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%)",
        position: "relative",
        overflow: "hidden",
        p: 2,
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "radial-gradient(circle at 20% 50%, rgba(255, 255, 255, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255, 255, 255, 0.1) 0%, transparent 50%)",
          pointerEvents: "none",
        },
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 520,
          px: 3,
          py: 4,
          borderRadius: 4,
          backgroundColor: "rgba(255, 255, 255, 0.92)",
          backdropFilter: "blur(18px)",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.2)",
          position: "relative",
          zIndex: 1,
          textAlign: "center",
        }}
      >
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
          Redirecting to GeekSuite sign in…
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          If you aren’t redirected, open{" "}
          <Link
            href="https://basegeek.clintgeek.com/login"
            target="_blank"
            underline="hover"
            rel="noopener"
          >
            basegeek.clintgeek.com
          </Link>
          .
        </Typography>
      </Box>
    </Box>
  );
};

export default LoginPage;
