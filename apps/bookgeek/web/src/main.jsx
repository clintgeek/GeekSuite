import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";
import { FocusModeProvider, GeekUpdateIndicator } from "@geeksuite/ui";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider as UserThemeProvider, useThemeMode } from "@geeksuite/user";
import App from "./App.jsx";
// The theme's display face. Self-hosted via @fontsource so the wordmark and
// headings render offline; index.html used to load Libre Baskerville from
// Google instead, so every serif in the app fell back to Georgia.
import "@fontsource/dm-serif-display";
// Used Bookstore (2026-09-30): DM Sans for everything that isn't a title (the
// old "Inter" was never loaded, so it had been the system font all along), and
// Caveat for the hand-lettered shelf talkers only.
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/caveat/600.css";
import "./styles.css";
import { configureUserPlatform } from "./bootstrapUser";
import { GeekSuiteApolloProvider } from "@geeksuite/api-client";
import createBookTheme from "./theme/theme";

configureUserPlatform();

const container = document.getElementById("root");
const root = createRoot(container);

function Root() {
  return (
    <UserThemeProvider>
      <ThemeWrapper />
    </UserThemeProvider>
  );
}

function ThemeWrapper() {
  const { theme: mode } = useThemeMode();
  const muiTheme = React.useMemo(() => createBookTheme(mode), [mode]);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      {/* First open after a deploy: the old build draws, then the new worker
          reloads into the new one (PWA_STANDARD rows 5 + 6). This says so. */}
      <GeekUpdateIndicator />
      <FocusModeProvider storageKey="bookgeek.focusMode">
        <GeekSuiteApolloProvider appName="bookgeek">
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </GeekSuiteApolloProvider>
      </FocusModeProvider>
    </ThemeProvider>
  );
}

root.render(<Root />);
