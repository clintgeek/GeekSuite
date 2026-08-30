import { useQuery } from '@apollo/client';
import { GET_TASK_TAGS } from '../graphql/queries';

/**
 * useTaskTags — the user's existing task tags, sorted by usage count
 * (the GraphQL service already sorts by count desc). Returns [String].
 */
const useTaskTags = () => {
  const { data } = useQuery(GET_TASK_TAGS, {
    fetchPolicy: 'cache-and-network',
  });
  return (data?.taskTags || []).map((t) => t.tag).filter(Boolean);
};

export default useTaskTags;
