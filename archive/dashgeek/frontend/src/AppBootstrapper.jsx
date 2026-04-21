import { useEffect } from 'react';
import { useUser } from '@geeksuite/user';
import useAuthStore from './store/authStore';

export default function AppBootstrapper({ children }) {
  const { bootstrap } = useUser();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const authReady = !isLoading;

  useEffect(() => {
    if (authReady && isAuthenticated) {
      bootstrap().catch(() => {});
    }
  }, [authReady, isAuthenticated, bootstrap]);

  return children;
}
