import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { configureUserPlatform } from "./bootstrapUser";
import { GeekSuiteApolloProvider } from "@geeksuite/api-client";

configureUserPlatform();

const container = document.getElementById("root");
const root = createRoot(container);

root.render(
  <GeekSuiteApolloProvider>
    <App />
  </GeekSuiteApolloProvider>
);
