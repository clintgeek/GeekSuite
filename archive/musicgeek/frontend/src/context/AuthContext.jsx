import React from 'react';
import { AuthProvider as BaseAuthProvider, useAuth as useBaseAuth } from '@geeksuite/auth';

export function AuthProvider({ children }) {
  return (
    <BaseAuthProvider appName="musicgeek">
      {children}
    </BaseAuthProvider>
  );
}

export function useAuth() {
  const ctx = useBaseAuth();
  return {
    ...ctx,
    currentUser: ctx.user,
    isLoading: ctx.loading,
  };
}

export function useUserMode() {
  const { currentUser } = useAuth();
  return currentUser?.preferences?.uiMode === 'kid' ? 'kid' : 'adult';
}
