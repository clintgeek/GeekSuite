import { useEffect } from 'react';
import { useUser } from '@geeksuite/user';
import useAuthStore from './store/authStore';
import { registerReset } from './utils/resetUserStore';

export default function AppBootstrapper({ children }) {
  const { bootstrap, reset } = useUser();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const authReady = !isLoading;

  // Register reset so non-React code (authStore) can clear the user store
  useEffect(() => {
    registerReset(reset);
  }, [reset]);

  useEffect(() => {
    if (authReady && isAuthenticated) {
      bootstrap().catch(() => {
        // bootstrap failed — non-fatal, preferences just won't load
      });
    }
  }, [authReady, isAuthenticated, bootstrap]);

  return children;
}
