import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { CssBaseline } from "@mui/material";
import "@fontsource/dm-serif-display/400.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import App from "./App";
import "./index.css";
import { AuthProvider } from "./contexts/AuthContext";
import { AppThemeProvider } from "./theme/AppThemeProvider";
import { GeekSuiteApolloProvider } from "@geeksuite/api-client";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppThemeProvider>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <GeekSuiteApolloProvider appName="flockgeek">
            <App />
          </GeekSuiteApolloProvider>
        </AuthProvider>
      </BrowserRouter>
    </AppThemeProvider>
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    let refreshing = false;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.update().catch(() => { });
      })
      .catch((error) => console.error("Service worker registration failed", error));
  });
}
