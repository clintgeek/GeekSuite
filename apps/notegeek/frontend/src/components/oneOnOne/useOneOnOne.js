import { useMemo } from 'react';
import { gql, useQuery } from '@apollo/client';
import { useAppPreferences } from '@geeksuite/user';
import { oneOnOneRoot, peopleFrom } from '../../utils/oneOnOne';

/** Every note under the 1:1 tag: just what "who, how many, when last" needs. */
export const GET_ONE_ON_ONE_NOTES = gql`
  query GetOneOnOneNotes($under: String!) {
    notes(under: $under) {
      id
      tags
      createdAt
    }
  }
`;

/** The 1:1 tag in force on this account. */
export function useOneOnOneRoot() {
  const { preferences } = useAppPreferences('notegeek');
  return oneOnOneRoot(preferences);
}

/** The people under the 1:1 tag, longest-unmet first. */
export function useOneOnOnePeople({ skip = false } = {}) {
  const root = useOneOnOneRoot();
  const { data, loading, error } = useQuery(GET_ONE_ON_ONE_NOTES, {
    variables: { under: root },
    fetchPolicy: 'cache-and-network',
    skip,
  });
  const people = useMemo(() => peopleFrom(data?.notes, root), [data, root]);
  return { root, people, loading: loading && !data, error };
}
