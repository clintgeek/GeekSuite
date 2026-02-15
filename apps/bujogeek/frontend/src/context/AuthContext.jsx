import React from 'react';
import { AuthProvider as BaseAuthProvider, useAuth } from '@geeksuite/auth';
import { reset as resetUserStore } from '../utils/resetUserStore';

const handleLogout = () => resetUserStore();

export const AuthProvider = ({ children }) => (
  <BaseAuthProvider appName="bujogeek" onLogout={handleLogout}>
    {children}
  </BaseAuthProvider>
);

export { useAuth };