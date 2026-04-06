import { createApolloClient } from '@geeksuite/api-client';
import useSharedAuthStore from './store/sharedAuthStore';

export const apolloClient = createApolloClient({
  getToken: () => useSharedAuthStore.getState().token,
  onTokenError: () => {
    useSharedAuthStore.getState().logout?.();
    console.error('GraphQL token error or missing token');
  }
});
