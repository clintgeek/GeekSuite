import React from 'react';
import { AuthProvider as BaseAuthProvider, useAuth } from '@geeksuite/auth';

export const AuthProvider = ({ children }) => (
  <BaseAuthProvider appName="photogeek">
    {children}
  </BaseAuthProvider>
);

export { useAuth };

export default null;
