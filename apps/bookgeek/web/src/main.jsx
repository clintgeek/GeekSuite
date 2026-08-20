import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";
import { FocusModeProvider } from "@geeksuite/ui";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider as UserThemeProvider, useThemeMode } from "@geeksuite/user";
import App from "./App.jsx";
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

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(mode);
  }, [mode]);

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
