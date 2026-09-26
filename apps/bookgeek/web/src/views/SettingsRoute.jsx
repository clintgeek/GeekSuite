/**
 * `/settings` — wires hooks/useSettings (forms, import jobs, AI status) and the
 * session's preferences into `SettingsView`, whose props are unchanged.
 */
import React from "react";
import { Box } from "@mui/material";
import { useBookGeek } from "../hooks/useBookGeek";
import { useLibraryParams } from "../hooks/useLibraryParams";
import { useSettings } from "../hooks/useSettings";
import SettingsView from "./SettingsView";

const noop = () => {};

export default function SettingsRoute() {
  const session = useBookGeek();
  const params = useLibraryParams();
  const settings = useSettings({ session, params });

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: "1200px", mx: "auto" }}>
      <SettingsView
        {...settings}
        // SettingsView's own signed-out branch is unreachable (App shows the
        // LoginSplash first), so its auth props are inert here.
        authError={null}
        authLoading={false}
        setAuthError={noop}
        setAuthLoading={noop}
        customShelves={session.customShelves}
        handleLogout={session.onSignOut}
        setActiveView={params.setActiveView}
        shelves={session.shelves}
        user={session.user}
      />
    </Box>
  );
}
