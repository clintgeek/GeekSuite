import React from "react";
import { AuthProvider as BaseAuthProvider, useAuth } from "@geeksuite/auth";

export const AuthProvider = ({ children }) => (
  <BaseAuthProvider appName="flockgeek">
    {children}
  </BaseAuthProvider>
);

export { useAuth };
