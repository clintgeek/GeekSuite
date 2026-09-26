/**
 * The small, household-wide reference data every screen reads: the
 * vocabulary, the types, the places, the caller's saved views and the
 * attention summary. Each is its own cached query; this names them once and
 * derives the maps the pickers, labels and facets share.
 */
import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { GET_PLACES, GET_THING_ATTENTION, GET_THING_PROFILE, GET_THING_TYPES, GET_THING_VOCABULARY } from '../graphql/queries';
import { DEFAULT_VOCAB } from '../utils/vocab';
import { placeOrder } from '../utils/places';

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

export function usePlaces() {
  const { data, loading, error, refetch } = useQuery(GET_PLACES, { fetchPolicy: 'cache-and-network' });
  return useMemo(() => {
    const places = data?.places ?? [];
    return { places, placesById: new Map(places.map((p) => [p.id, p])), order: placeOrder(places), loading: loading && !data, error, refetch };
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
  const { placesById, order } = usePlaces();
  return useMemo(() => ({ typesById, placesById, placeOrder: order }), [typesById, placesById, order]);
}
