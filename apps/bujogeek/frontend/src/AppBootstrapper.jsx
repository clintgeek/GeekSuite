import { useEffect } from 'react';
import { useUser } from '@geeksuite/user';
import { useAuth } from './context/AuthContext';
import { registerReset } from './utils/resetUserStore';

export default function AppBootstrapper({ children }) {
  const { bootstrap, reset } = useUser();
  const { user, loading } = useAuth();
  const authReady = !loading;
  const isAuthenticated = !!user;

  // Register reset so non-React code can clear the user store
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
