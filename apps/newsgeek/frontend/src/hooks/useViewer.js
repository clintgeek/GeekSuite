import { useQuery } from '@apollo/client';
import { GET_NEWS_VIEWER } from '../graphql/queries';

/**
 * Whether the signed-in user may manage sources. Admin controls stay hidden
 * until the gateway says yes; an error or a pending answer is "no".
 */
export function useViewer() {
  const { data, loading } = useQuery(GET_NEWS_VIEWER, { fetchPolicy: 'cache-first' });
  return { isAdmin: Boolean(data?.newsViewer?.isAdmin), loading };
}
