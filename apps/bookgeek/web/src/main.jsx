import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";
import { FocusModeProvider } from "@geeksuite/ui";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider as UserThemeProvider, useThemeMode } from "@geeksuite/user";
import App from "./App.jsx";
// The theme's display face. Self-hosted via @fontsource so the wordmark and
// headings render offline; index.html used to load Libre Baskerville from
// Google instead, so every serif in the app fell back to Georgia.
import "@fontsource/dm-serif-display";
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
