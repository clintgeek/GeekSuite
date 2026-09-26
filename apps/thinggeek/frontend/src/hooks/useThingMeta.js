/**
 * The small, household-wide reference data every screen reads: the
 * vocabulary, the types, the containment tree (every live thing as a node —
 * utils/where.js), the caller's saved views and the attention summary. Each is its own cached query; this names them once and
 * derives the maps the pickers, labels and facets share.
 */
import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { GET_THING_ATTENTION, GET_THING_PROFILE, GET_THING_TREE, GET_THING_TYPES, GET_THING_VOCABULARY } from '../graphql/queries';
import { DEFAULT_VOCAB } from '../utils/vocab';
import { whereOrder } from '../utils/where';

export function useVocabulary() {
  const { data } = useQuery(GET_THING_VOCABULARY, { fetchPolicy: 'cache-first' });
  return useMemo(() => {
    const v = data?.thingVocabulary;
    if (!v) return DEFAULT_VOCAB;
    const pick = (key) => (Array.isArray(v[key]) && v[key].length ? v[key] : DEFAULT_VOCAB[key]);
    return {
      fieldKinds: pick('fieldKinds'),
      dateKinds: pick('dateKinds'),
      photoRoles: pick('photoRoles'),
      documentRoles: pick('documentRoles'),
      relationshipKinds: pick('relationshipKinds'),
      thingKinds: pick('thingKinds'),
      missingKeys: pick('missingKeys'),
      trashDays: Number.isFinite(v.trashDays) ? v.trashDays : DEFAULT_VOCAB.trashDays,
    };
  }, [data]);
}

export function useThingTypes() {
  const { data, loading, error, refetch } = useQuery(GET_THING_TYPES, { fetchPolicy: 'cache-and-network' });
  return useMemo(() => {
    const types = data?.thingTypes ?? [];
    return { types, typesById: new Map(types.map((t) => [t.id, t])), loading: loading && !data, error, refetch };
  }, [data, loading, error, refetch]);
}

/** The household's Location type (the starter one first), or null if it was deleted. */
export function useLocationType() {
  const { types } = useThingTypes();
  return types.find((t) => t.key === 'location') ?? types.find((t) => t.kind === 'location') ?? null;
}

/** The containment tree: `nodes` (every live thing), `nodesById`, and the Where facet's `order`. */
export function useThingTree() {
  const { data, loading, error, refetch } = useQuery(GET_THING_TREE, { fetchPolicy: 'cache-and-network' });
  return useMemo(() => {
    const nodes = data?.thingTree ?? [];
    return { nodes, nodesById: new Map(nodes.map((n) => [n.id, n])), order: whereOrder(nodes), loading: loading && !data, error, refetch };
  }, [data, loading, error, refetch]);
}

export function useThingProfile() {
  const { data, loading, error } = useQuery(GET_THING_PROFILE, { fetchPolicy: 'cache-and-network' });
  return { profile: data?.thingProfile ?? null, loading, error };
}

export function useAttention() {
  const { data, loading, error, refetch } = useQuery(GET_THING_ATTENTION, { fetchPolicy: 'cache-and-network' });
  const attention = data?.thingAttention ?? null;
  const dueCount = attention ? attention.overdue.length + attention.dueSoon.length : 0;
  return { attention, dueCount, loading: loading && !data, error, refetch };
}

/** The `context` the facet labels and fixed orders read (utils/facets.jsx). */
export function useFacetContext() {
  const { typesById } = useThingTypes();
  const { nodesById, order } = useThingTree();
  return useMemo(() => ({ typesById, nodesById, whereOrder: order }), [typesById, nodesById, order]);
}
